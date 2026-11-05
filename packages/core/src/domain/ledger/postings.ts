import { BusinessDocument, Company, Branch, Expense, LedgerAccount, Party, Payment, PaymentAccount, StockMovement, TaxCategory, Voucher } from '../../types';
import { openingDebit } from '../partyKinds';
import { advanceTaxEvents } from '../advanceTax';
import { CREDIT_KINDS } from '../documentStates';
import { expenseCost, claimableTax, expenseTaxComponents } from '../expenseTax';
import { ItcBuckets, TaxSplit, itcOfDocument } from '../itc';
import { calculateLine } from '../lineCalc';
import { homeStateCode } from '../taxEngine';
import { addDaysISO } from '../../lib/date';
import type { PerpetualStock } from '../stockLedger';
import { TAX_KINDS, TaxKind } from './accounts';

/**
 * Double entry, worked out from what the business recorded. Nothing here is stored: the server and
 * the app both run these over their own copies of the books, as the reports do, so they always agree.
 * Every amount is in base-currency paise; a posting is a debit or a credit, never both.
 */
export type Posting = {
  date: string;
  account: string;
  debit: number;
  credit: number;
  source: { type: 'document' | 'payment' | 'expense' | 'voucher' | 'opening' | 'stock'; id: string; number: string; kind?: string };
  branchId?: string;
  partyId?: string;
  costCentreId?: string;
};

/** Documents that are on the books: finalised, and not since cancelled or rejected. */
const OFF_BOOKS = ['draft', 'requested', 'cancelled', 'rejected'];
const SALES = ['invoice', 'debitNote', 'salesReturn', 'creditNote'];
const PURCHASES = ['purchaseBill', 'supplierDebitNote', 'purchaseReturn', 'supplierCreditNote'];

/** The tax component types, as the accounts name them. */
const TYPE_TO_KIND: Record<string, TaxKind> = { CGST: 'Cgst', SGST: 'Sgst', IGST: 'Igst', CESS: 'Cess' };
const SPLIT_KEY: Record<TaxKind, keyof TaxSplit> = { Cgst: 'cgst', Sgst: 'sgst', Igst: 'igst', Cess: 'cess' };

type Entry = [account: string, amount: number, costCentreId?: string];

/**
 * Turns signed amounts (debit positive) into postings, dropping zeros. Rounding to paise in base
 * currency can leave a paisa or two over; that goes to round off, so every source balances.
 */
function toPostings(entries: Entry[], source: Posting['source'], date: string, extra: Pick<Posting, 'branchId' | 'partyId' | 'costCentreId'>): Posting[] {
  // Keyed by account and cost centre: a voucher may split one account over several centres.
  const merged = new Map<string, number>();
  const key = (account: string, cc?: string) => `${account}\u0000${cc ?? extra.costCentreId ?? ''}`;
  for (const [account, amount, cc] of entries) if (amount) merged.set(key(account, cc), (merged.get(key(account, cc)) ?? 0) + Math.round(amount));
  const off = [...merged.values()].reduce((a, b) => a + b, 0);
  if (off) merged.set(key('sys:roundOff'), (merged.get(key('sys:roundOff')) ?? 0) - off);
  return [...merged.entries()]
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => {
      const [account, cc] = k.split('\u0000');
      return { date, account, debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0, source, ...extra, costCentreId: cc || undefined };
    });
}

/** Tax charged on the document (not reverse charge), by kind, in document currency. */
function chargedTax(doc: BusinessDocument, reverseCharge: boolean): Record<TaxKind, number> {
  const out: Record<TaxKind, number> = { Cgst: 0, Sgst: 0, Igst: 0, Cess: 0 };
  for (const line of doc.totals.taxLines) {
    if (!!line.reverseCharge !== reverseCharge) continue;
    for (const c of line.components) {
      const k = TYPE_TO_KIND[c.type];
      if (k) out[k] += c.amount.minor;
    }
  }
  return out;
}

const scaleSplit = (s: TaxSplit, by: number): TaxSplit => ({ igst: s.igst * by, cgst: s.cgst * by, sgst: s.sgst * by, cess: s.cess * by });
const splitSum = (...splits: TaxSplit[]): TaxSplit => splits.reduce((a, b) => ({ igst: a.igst + b.igst, cgst: a.cgst + b.cgst, sgst: a.sgst + b.sgst, cess: a.cess + b.cess }), { igst: 0, cgst: 0, sgst: 0, cess: 0 });
const splitTotal = (s: TaxSplit) => s.igst + s.cgst + s.sgst + s.cess;

/** A sale, a purchase, or a note or return against one. */
export function postDocument(doc: BusinessDocument, baseCurrency: string): Posting[] {
  if (OFF_BOOKS.includes(doc.status)) return [];
  const sales = SALES.includes(doc.kind);
  if (!sales && !PURCHASES.includes(doc.kind)) return [];
  const rate = doc.currency === baseCurrency ? 1 : doc.exchangeRate || 1;
  const b = (minor: number) => minor * rate;
  // A return or credit note runs the other way from its invoice or bill.
  const sign = CREDIT_KINDS.includes(doc.kind) ? -1 : 1;
  const t = doc.totals;
  const party = `party:${doc.partyId}`;
  const source = { type: 'document' as const, id: doc.id, number: doc.number, kind: doc.kind };
  const extra = { branchId: doc.branchId, partyId: doc.partyId, costCentreId: doc.costCentreId };
  const entries: Entry[] = [];

  if (sales) {
    const tax = chargedTax(doc, false);
    entries.push(
      [party, b(t.grandTotal.minor)],
      ['sys:sales', -b(t.taxableAmount.minor)],
      ...TAX_KINDS.map((k): Entry => [`sys:output${k}`, -b(tax[k])]),
      ['sys:discountAllowed', b(t.documentDiscount.minor)],
      // Recovering a billable expense clears what it put in Reimbursements recoverable: none of it is income.
      ['sys:reimbursementsRecoverable', -b(t.reimbursements?.minor ?? 0)],
      ['sys:chargesRecovered', -b(t.charges.minor)],
      ['sys:roundOff', -b(t.roundOff.minor)],
    );
  } else {
    // Input credit by bucket, as a bill (itcOfDocument signs credit notes negative; undo that here).
    const itc: ItcBuckets = itcOfDocument(doc, baseCurrency);
    const abs = (s: TaxSplit) => scaleSplit(s, sign);
    const claimable = splitSum(abs(itc.eligible), abs(itc.capitalGoods), abs(itc.reverseCharge));
    const lost = splitTotal(abs(itc.blocked)) + splitTotal(abs(itc.ineligible));
    const rcm = chargedTax(doc, true);
    // Capital goods go to fixed assets, everything else to purchases; credit that can't be claimed adds to the cost.
    const capital = doc.lines
      .filter((l) => l.gst?.capitalGoods && !l.gst?.reimbursement)
      .reduce((a, l) => a + calculateLine(l, doc.currency, { regime: 'GST', registered: false }).taxable.minor, 0);
    entries.push(
      [party, -b(t.grandTotal.minor)],
      ['sys:purchases', b(t.taxableAmount.minor - capital + (t.reimbursements?.minor ?? 0)) + lost],
      ['sys:fixedAssets', b(capital)],
      ...TAX_KINDS.map((k): Entry => [`sys:input${k}`, claimable[SPLIT_KEY[k]]]),
      ...TAX_KINDS.map((k): Entry => [`sys:rcmPayable${k}`, -b(rcm[k])]),
      ['sys:discountReceived', -b(t.documentDiscount.minor)],
      ['sys:freightInward', b(t.charges.minor)],
      ['sys:roundOff', b(t.roundOff.minor)],
    );
    // TDS kept back: the supplier is owed that much less, the government that much more.
    if (doc.tds?.amount.minor) entries.push([party, b(doc.tds.amount.minor)], [`sys:tdsPayable:${doc.tds.section}`, -b(doc.tds.amount.minor)]);
    // An import: the IGST and cess paid at customs on its bill of entry is input credit, owed to customs
    // until paid. Already in base currency.
    const boe = doc.billOfEntry;
    if (boe) {
      const duty = boe.igst.minor + (boe.cess?.minor ?? 0);
      entries.push(['sys:inputIgst', boe.igst.minor], ['sys:inputCess', boe.cess?.minor ?? 0], ['sys:customsPayable', -duty]);
    }
  }
  return toPostings(
    entries.map(([a, v]) => [a, sign * v]),
    source,
    doc.date,
    extra,
  );
}

/**
 * Money in or out, and what settled documents without money: TDS deducted, discount, write-off. An
 * advance for services also owes GST from the day it arrives, taken back as invoices adjust it.
 */
export function postPayment(p: Payment, ctx: { homeState?: string; documentDate?: (id: string) => string | undefined } = {}): Posting[] {
  const rate = p.exchangeRate || 1;
  const b = (minor: number) => minor * rate;
  const sum = (k: 'tdsDeducted' | 'discount' | 'writeOff') => p.allocations.reduce((a, x) => a + (x[k]?.minor ?? 0), 0);
  const gain = p.fxGainLoss?.minor ?? 0;
  const received = p.direction === 'received';
  const cash = b(p.amount.minor);
  const entries: Entry[] = received
    ? [
        [`pay:${p.accountId}`, cash],
        ['sys:tdsReceivable', b(sum('tdsDeducted'))],
        ['sys:discountAllowed', b(sum('discount'))],
        ['sys:badDebts', b(sum('writeOff'))],
        ['sys:fxGainLoss', -gain],
      ]
    : [
        [`pay:${p.accountId}`, -cash],
        // Kept back under its section, so it reaches that section's payable and 26Q.
        [p.tdsSection && p.tdsSection !== 'none' ? `sys:tdsPayable:${p.tdsSection}` : 'sys:tdsPayable', -b(sum('tdsDeducted'))],
        ['sys:discountReceived', -b(sum('discount'))],
        ['sys:otherIncome', -b(sum('writeOff'))],
        ['sys:fxGainLoss', -gain],
      ];
  // The party takes whatever balances the rest.
  const rest = entries.reduce((a, [, v]) => a + Math.round(v), 0);
  entries.push([`party:${p.partyId}`, -rest]);
  const source = { type: 'payment' as const, id: p.id, number: p.number };
  const extra = { branchId: p.branchId, partyId: p.partyId };
  const advance = advanceTaxEvents(p, ctx.homeState, ctx.documentDate ?? (() => undefined)).flatMap((e) => {
    const sign = e.kind === 'received' ? 1 : -1;
    const tax = e.igst + e.cgst + e.sgst;
    return toPostings(
      [
        ['sys:gstOnAdvances', sign * tax],
        ['sys:outputIgst', -sign * e.igst],
        ['sys:outputCgst', -sign * e.cgst],
        ['sys:outputSgst', -sign * e.sgst],
      ],
      source,
      e.date,
      extra,
    );
  });
  return [...toPostings(entries, source, p.date, extra), ...advance];
}

/** An expense paid from an account: its cost, the credit it carries, and reverse-charge tax owed. */
export function postExpense(e: Expense, ctx: { company?: Company; branches: Branch[]; taxCategories: TaxCategory[] }): Posting[] {
  const rate = e.exchangeRate || 1;
  const b = (minor: number) => minor * rate;
  const taxRate = ctx.taxCategories.find((c) => c.id === e.taxCategoryId)?.rate ?? 0;
  const components = expenseTaxComponents(e, taxRate, ctx.company, ctx.branches.find((x) => x.id === e.branchId));
  const claim = claimableTax(e).minor > 0;
  const byKind = (k: TaxKind) => components.filter((c) => TYPE_TO_KIND[c.type] === k).reduce((a, c) => a + c.amount.minor, 0);
  // A billable expense is the customer's cost, paid as their agent: it waits in Reimbursements recoverable, out of P&L.
  const entries: Entry[] = [
    [e.billable ? 'sys:reimbursementsRecoverable' : `exp:${e.categoryId}`, b(expenseCost(e).minor)],
    ...TAX_KINDS.map((k): Entry => [`sys:input${k}`, claim ? b(byKind(k)) : 0]),
    ...TAX_KINDS.map((k): Entry => [`sys:rcmPayable${k}`, e.reverseCharge ? -b(byKind(k)) : 0]),
    [`pay:${e.accountId}`, -b(e.amount.minor)],
  ];
  return toPostings(entries, { type: 'expense', id: e.id, number: e.number }, e.date, { branchId: e.branchId, partyId: e.supplierId, costCentreId: e.costCentreId });
}

/** A posted voucher posts exactly what it says; a draft posts nothing. */
export function postVoucher(v: Voucher): Posting[] {
  if (isDraftVoucher(v)) return [];
  return toPostings(
    v.lines.map((l): Entry => [l.account, l.debit.minor - l.credit.minor, l.costCentreId]),
    { type: 'voucher', id: v.id, number: v.number, kind: v.kind },
    v.date,
    { branchId: v.branchId },
  );
}

/** A draft voucher is kept but stays out of the books until it is posted. */
export const isDraftVoucher = (v: Pick<Voucher, 'status'>): boolean => v.status === 'draft';

/** The day before anything: opening balances sit here, so every report sees them as opening. */
export const OPENING_DATE = '1900-01-01';

/**
 * Opening balances: what parties owed or were owed, cash and bank, the business's own accounts, and
 * stock counted at the start. Whatever doesn't balance is the owner's (Opening balances, in capital).
 * A balance given a date stands at the start of that day, so it posts the day before: a report from
 * that day on reads it as opening, one before it doesn't see it. Undated ones sit at OPENING_DATE.
 */
export function postOpenings(book: {
  parties: Pick<Party, 'id' | 'kind' | 'openingBalance' | 'openingBalanceDate' | 'openingBalanceSide'>[];
  paymentAccounts: Pick<PaymentAccount, 'id' | 'openingBalance' | 'openingRate' | 'openingBalanceDate'>[];
  ledgerAccounts: Pick<LedgerAccount, 'id' | 'openingBalance' | 'openingBalanceDate'>[];
  openingStockMinor: number;
}): Posting[] {
  const byDate = new Map<string, Entry[]>();
  const add = (date: string | undefined, entry: Entry) => {
    const day = date ? addDaysISO(date, -1) : OPENING_DATE;
    byDate.set(day, [...(byDate.get(day) ?? []), entry]);
  };
  // On the side the party says, or its kind's usual one: a customer's is owed to us, a supplier's by us.
  for (const p of book.parties) add(p.openingBalanceDate, [`party:${p.id}`, openingDebit(p)]);
  // A cash or bank account's opening stands on its "as on" date too, like any other; undated, at the start of the books.
  for (const a of book.paymentAccounts) add(a.openingBalanceDate, [`pay:${a.id}`, a.openingBalance.minor * (a.openingRate ?? 1)]);
  for (const a of book.ledgerAccounts) add(a.openingBalanceDate, [`acc:${a.id}`, a.openingBalance.minor]);
  add(undefined, ['sys:openingStock', book.openingStockMinor]);
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, entries]) => {
      const rest = entries.reduce((a, [, v]) => a + v, 0);
      return toPostings([...entries, ['sys:openingDifference', -rest]], { type: 'opening', id: 'opening', number: 'Opening balances' }, date, {});
    });
}

/** What a costed movement posts against Stock in hand (sys:openingStock), by the kind of movement. */
const STOCK_CONTRA: Partial<Record<StockMovement['type'], string>> = {
  purchaseReceipt: 'sys:purchases',
  purchaseReturn: 'sys:purchases',
  salesIssue: 'sys:cogs',
  salesReturn: 'sys:cogs',
  adjustment: 'sys:stockAdjustment',
};

/**
 * Perpetual stock (RULES 6.2): each movement from the day it starts posts its cost to Stock in hand.
 * Goods bought move out of Purchases into stock at what the stock ledger valued them at, so Purchases
 * keeps only what isn't stock (services, untracked goods, credit that can't be claimed); goods sold or
 * returned move between stock and Cost of goods sold; a count found short or over goes to Stock
 * adjustments. Transfers and cancelled documents move no value. What was in stock the day before
 * the start, beyond the opening stock already posted, is brought onto the books on the first day
 * against earlier years' profit: the periodic years counted it in their closing stock. (Dated the
 * day before, a balance sheet on that day would count it twice: posted and valued.)
 *
 * A movement from a document posts under that document, with its party, branch and cost centre.
 */
export function postStock(stock: PerpetualStock, ctx: { openingStockMinor: number; documents: Map<string, BusinessDocument> }): Posting[] {
  const out: Posting[] = [];
  const carry = stock.broughtForward - ctx.openingStockMinor;
  if (Math.round(carry)) {
    out.push(...toPostings([['sys:openingStock', carry], ['sys:retainedEarnings', -carry]], { type: 'stock', id: 'perpetual', number: 'Stock brought onto the books' }, stock.from, {}));
  }
  for (const m of stock.costed) {
    const contra = STOCK_CONTRA[m.type];
    if (!contra || !Math.round(m.cost)) continue;
    const doc = m.referenceId ? ctx.documents.get(m.referenceId) : undefined;
    const source: Posting['source'] = doc
      ? { type: 'document', id: doc.id, number: doc.number, kind: doc.kind }
      : { type: 'stock', id: m.referenceId ?? m.id, number: m.referenceNumber ?? m.notes ?? '', kind: m.type };
    out.push(...toPostings([['sys:openingStock', m.cost], [contra, -m.cost]], source, m.date, { branchId: m.branchId, partyId: doc?.partyId, costCentreId: doc?.costCentreId }));
  }
  return out;
}

/** Everything on the books, in date order. */
export function allPostings(book: {
  baseCurrency: string;
  company?: Company;
  branches: Branch[];
  taxCategories: TaxCategory[];
  documents: BusinessDocument[];
  payments: Payment[];
  expenses: Expense[];
  vouchers: Voucher[];
  parties: Pick<Party, 'id' | 'kind' | 'openingBalance' | 'openingBalanceDate' | 'openingBalanceSide'>[];
  paymentAccounts: Pick<PaymentAccount, 'id' | 'openingBalance' | 'openingRate' | 'openingBalanceDate'>[];
  ledgerAccounts: Pick<LedgerAccount, 'id' | 'openingBalance' | 'openingBalanceDate'>[];
  openingStockMinor: number;
  /** Perpetual stock from its day; left out, the books are periodic. */
  stock?: PerpetualStock;
}): Posting[] {
  const dates = new Map(book.documents.map((d) => [d.id, d.date]));
  const documentDate = (id: string) => dates.get(id);
  return [
    ...postOpenings(book),
    ...book.documents.flatMap((d) => postDocument(d, book.baseCurrency)),
    ...book.payments.flatMap((p) => postPayment(p, { homeState: homeStateCode(book.company, book.branches.find((b) => b.id === p.branchId)), documentDate })),
    ...book.expenses.flatMap((e) => postExpense(e, book)),
    ...book.vouchers.flatMap(postVoucher),
    ...(book.stock ? postStock(book.stock, { openingStockMinor: book.openingStockMinor, documents: new Map(book.documents.filter((d) => !OFF_BOOKS.includes(d.status)).map((d) => [d.id, d])) }) : []),
  ].sort((a, b) => a.date.localeCompare(b.date));
}
