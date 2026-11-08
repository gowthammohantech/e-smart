import { BusinessDocument, Company, Branch, Expense, LedgerAccount, Party, Payment, PaymentAccount, StockMovement, TaxCategory, Voucher } from '../../types';
import { assetEntries, type FixedAsset } from '../fixedAssets';
import { openingDebit } from '../partyKinds';
import { advanceTaxEvents } from '../advanceTax';
import { CREDIT_KINDS } from '../documentStates';
import { expenseCost, claimableTax, expenseTaxComponents } from '../expenseTax';
import { ItcBuckets, TaxSplit, itcOfDocument } from '../itc';
import { calculateLine, linesWithCharges, taxedCharges } from '../lineCalc';
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
  source: { type: 'document' | 'payment' | 'expense' | 'voucher' | 'opening' | 'stock' | 'asset'; id: string; number: string; kind?: string };
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

/**
 * Reverse-charge tax is owed to the government like any other output tax (RULES 2.6, pending CA):
 * from this date it is credited to Output tax, so the 3B set-off and the Output ledger agree. What
 * was dated earlier stays in Reverse charge payable, so filed and closed periods read as they did.
 */
export const RCM_OUTPUT_FROM = '2026-11-01';

/** Where reverse-charge tax of a kind dated `date` is owed. */
export const rcmAccount = (k: TaxKind, date: string): string => (date >= RCM_OUTPUT_FROM ? `sys:output${k}` : `sys:rcmPayable${k}`);

const scaleSplit = (s: TaxSplit, by: number): TaxSplit => ({ igst: s.igst * by, cgst: s.cgst * by, sgst: s.sgst * by, cess: s.cess * by });
const splitSum = (...splits: TaxSplit[]): TaxSplit => splits.reduce((a, b) => ({ igst: a.igst + b.igst, cgst: a.cgst + b.cgst, sgst: a.sgst + b.sgst, cess: a.cess + b.cess }), { igst: 0, cgst: 0, sgst: 0, cess: 0 });
const splitTotal = (s: TaxSplit) => s.igst + s.cgst + s.sgst + s.cess;

/** A sale, a purchase, or a note or return against one. */
export function postDocument(doc: BusinessDocument, baseCurrency: string): Posting[] {
  if (OFF_BOOKS.includes(doc.status)) return [];
  // What was owed when the books started (RULES 6.12): only the party's account and Opening balances
  // move, on the invoice's own date. It was a sale (or purchase) of an earlier year, under the old books.
  if (doc.kind === 'openingInvoice' || doc.kind === 'openingBill') {
    const amount = Math.round(doc.totals.grandTotal.minor * (doc.currency === baseCurrency ? 1 : doc.exchangeRate || 1));
    const side = doc.kind === 'openingInvoice' ? 1 : -1;
    return toPostings(
      [
        [`party:${doc.partyId}`, side * amount],
        ['sys:openingDifference', -side * amount],
      ],
      { type: 'document', id: doc.id, number: doc.number, kind: doc.kind },
      doc.date,
      { branchId: doc.branchId, partyId: doc.partyId },
    );
  }
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
  // A financial or commercial note without GST (RULES 6.24) is a discount after the sale, not a
  // return: its value goes to discount allowed (received), not sales (purchases). It carries no tax.
  const discountNote = doc.noteGst === 'noGst' && !doc.sourceDocumentId;
  // The part of the charges inside the taxable value; zero before CHARGES_TAXED_FROM.
  const taxed = taxedCharges(doc).minor;

  if (sales) {
    const tax = chargedTax(doc, false);
    entries.push(
      [party, b(t.grandTotal.minor)],
      // Charges taxed with the lines (RULES 1.10) are inside the taxable value but still recovered as charges.
      [discountNote ? 'sys:discountAllowed' : 'sys:sales', -b(t.taxableAmount.minor - taxed)],
      ...TAX_KINDS.map((k): Entry => [`sys:output${k}`, -b(tax[k])]),
      ['sys:discountAllowed', b(t.documentDiscount.minor)],
      // Recovering a billable expense clears what it put in Reimbursements recoverable: none of it is income.
      ['sys:reimbursementsRecoverable', -b(t.reimbursements?.minor ?? 0)],
      ['sys:chargesRecovered', -b(t.charges.minor + taxed)],
      ['sys:roundOff', -b(t.roundOff.minor)],
    );
    // TCS collected with the price is the government's, not income: owed under its section (RULES 6.13).
    if (t.tcs?.minor) entries.push([doc.tcs?.section ? `sys:tcsPayable:${doc.tcs.section}` : 'sys:tcsPayable', -b(t.tcs.minor)]);
  } else {
    // Input credit by bucket, as a bill (itcOfDocument signs credit notes negative; undo that here).
    const itc: ItcBuckets = itcOfDocument(doc, baseCurrency);
    const abs = (s: TaxSplit) => scaleSplit(s, sign);
    const claimable = splitSum(abs(itc.eligible), abs(itc.capitalGoods), abs(itc.reverseCharge));
    const lost = splitTotal(abs(itc.blocked)) + splitTotal(abs(itc.ineligible));
    const rcm = chargedTax(doc, true);
    // Capital goods go to fixed assets, everything else to purchases; credit that can't be claimed adds to the cost.
    // Charges taxed with the lines (RULES 1.10): a capital line's share is part of the asset's cost, the
    // rest stays freight inward, as charges did before.
    const capitalLines = linesWithCharges(doc).filter((l) => l.gst?.capitalGoods && !l.gst?.reimbursement);
    const capital = capitalLines.reduce((a, l) => a + calculateLine(l, doc.currency, { regime: 'GST', registered: false }).taxable.minor, 0);
    const freight = taxed - capitalLines.reduce((a, l) => a + (l.chargeShare?.minor ?? 0), 0);
    const cost = b(t.taxableAmount.minor - capital - freight + (t.reimbursements?.minor ?? 0)) + lost;
    entries.push(
      [party, -b(t.grandTotal.minor)],
      ...(discountNote ? [['sys:discountReceived', cost] as Entry] : purchasesByCentre(doc, cost)),
      ['sys:fixedAssets', b(capital)],
      ...TAX_KINDS.map((k): Entry => [`sys:input${k}`, claimable[SPLIT_KEY[k]]]),
      ...TAX_KINDS.map((k): Entry => [rcmAccount(k, doc.date), -b(rcm[k])]),
      ['sys:discountReceived', -b(t.documentDiscount.minor)],
      ['sys:freightInward', b(t.charges.minor + freight)],
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
  const posted = toPostings(
    entries.map(([a, v, cc]) => [a, sign * v, cc]),
    source,
    doc.date,
    extra,
  );
  if (sales) return posted;
  return [...posted, ...itcReversalPostings(doc, baseCurrency, source, extra)];
}

/**
 * Credit on a bill unpaid 180 days after its date (rule 37) leaves Input tax on the day it is
 * reversed (`itcReversedOn`, which GSTR-3B shows in 4B(2)) and goes to Input tax credit reversed;
 * it comes back on the day the bill is paid (`itcReclaimedOn`, 4A(5) and 4D(1)). The same credit
 * 3B moves: what was claimable, not the reverse charge (RULES 6.22, pending CA).
 */
function itcReversalPostings(doc: BusinessDocument, baseCurrency: string, source: Posting['source'], extra: Pick<Posting, 'branchId' | 'partyId' | 'costCentreId'>): Posting[] {
  if (!doc.itcReversedOn) return [];
  const itc = itcOfDocument(doc, baseCurrency);
  const sum = splitSum(itc.eligible, itc.capitalGoods);
  const claimable: TaxSplit = { igst: Math.round(sum.igst), cgst: Math.round(sum.cgst), sgst: Math.round(sum.sgst), cess: Math.round(sum.cess) };
  if (!splitTotal(claimable)) return [];
  const move = (side: 1 | -1): Entry[] => [
    ['sys:itcReversed', side * splitTotal(claimable)],
    ...TAX_KINDS.map((k): Entry => [`sys:input${k}`, -side * claimable[SPLIT_KEY[k]]]),
  ];
  return [
    ...toPostings(move(1), source, doc.itcReversedOn, extra),
    ...(doc.itcReclaimedOn ? toPostings(move(-1), source, doc.itcReclaimedOn, extra) : []),
  ];
}

/**
 * What a purchase costs, split over the cost centres its lines carry (RULES 6.20): a non-stock line's
 * own centre, else the document's. Shared by each centre's taxable value, so the parts add up to the
 * whole exactly; a document whose lines carry no centre of their own posts as one.
 */
function purchasesByCentre(doc: BusinessDocument, amount: number): Entry[] {
  const own = doc.lines.some((l) => l.costCentreId && l.costCentreId !== doc.costCentreId);
  if (!own) return [['sys:purchases', amount]];
  const weights = new Map<string, number>();
  for (const l of doc.lines) {
    if (l.gst?.capitalGoods && !l.gst?.reimbursement) continue;
    const cc = l.costCentreId ?? doc.costCentreId ?? '';
    weights.set(cc, (weights.get(cc) ?? 0) + calculateLine(l, doc.currency, { regime: 'GST', registered: false }).taxable.minor);
  }
  const total = [...weights.values()].reduce((a, w) => a + w, 0);
  if (total <= 0) return [['sys:purchases', amount]];
  const rounded = Math.round(amount);
  const parts = [...weights.entries()].map(([cc, w]): Entry => ['sys:purchases', Math.round((rounded * w) / total), cc || undefined]);
  // Rounding left over stays with the largest part.
  const off = rounded - parts.reduce((a, [, v]) => a + v, 0);
  if (off) {
    const big = parts.reduce((m, e, i) => (Math.abs(e[1]) > Math.abs(parts[m][1]) ? i : m), 0);
    parts[big] = [parts[big][0], parts[big][1] + off, parts[big][2]];
  }
  return parts;
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
        // Deducted by the customer under its section, so it matches their 26AS entry; none given stays plain (older receipts).
        // With TDS the customer deducted from an advance before any invoice: it credits them as money does.
        [p.tdsSection && p.tdsSection !== 'none' ? `sys:tdsReceivable:${p.tdsSection}` : 'sys:tdsReceivable', b(sum('tdsDeducted') + (p.advanceTds?.minor ?? 0))],
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
    const cess = e.cess ?? 0;
    const tax = e.igst + e.cgst + e.sgst + cess;
    return toPostings(
      [
        ['sys:gstOnAdvances', sign * tax],
        ['sys:outputIgst', -sign * e.igst],
        ['sys:outputCgst', -sign * e.cgst],
        ['sys:outputSgst', -sign * e.sgst],
        ['sys:outputCess', -sign * cess],
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
    ...TAX_KINDS.map((k): Entry => [rcmAccount(k, e.date), e.reverseCharge ? -b(byKind(k)) : 0]),
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
 *
 * Goods that come in on a goods receipt, before their bill, are owed to the supplier but not yet
 * bought: they go to Goods received, not billed. The bill made from the receipt (or from the order
 * the receipt was made from) moves that amount into Purchases on its own date, so Purchases never
 * runs below what was billed.
 */
export function postStock(stock: PerpetualStock, ctx: { openingStockMinor: number; documents: Map<string, BusinessDocument> }): Posting[] {
  const out: Posting[] = [];
  const carry = stock.broughtForward - ctx.openingStockMinor;
  if (Math.round(carry)) {
    out.push(...toPostings([['sys:openingStock', carry], ['sys:retainedEarnings', -carry]], { type: 'stock', id: 'perpetual', number: 'Stock brought onto the books' }, stock.from, {}));
  }
  const received = new Map<string, number>();
  for (const m of stock.costed) {
    const doc = m.referenceId ? ctx.documents.get(m.referenceId) : undefined;
    const unbilled = m.type === 'purchaseReceipt' && doc?.kind === 'goodsReceipt';
    const contra = unbilled ? GRNI : STOCK_CONTRA[m.type];
    if (!contra || !Math.round(m.cost)) continue;
    if (unbilled) received.set(doc.id, (received.get(doc.id) ?? 0) + m.cost);
    const source: Posting['source'] = doc
      ? { type: 'document', id: doc.id, number: doc.number, kind: doc.kind }
      : { type: 'stock', id: m.referenceId ?? m.id, number: m.referenceNumber ?? m.notes ?? '', kind: m.type };
    out.push(...toPostings([['sys:openingStock', m.cost], [contra, -m.cost]], source, m.date, { branchId: m.branchId, partyId: doc?.partyId, costCentreId: doc?.costCentreId }));
  }
  out.push(...billReceipts(received, ctx.documents));
  return out;
}

const GRNI = 'sys:goodsReceivedNotBilled';

/**
 * Each bill takes over the goods receipts it was made from: the receipt itself, or those raised from
 * the same purchase order. The earliest bill takes a receipt whole; a receipt is taken over once.
 */
function billReceipts(received: Map<string, number>, documents: Map<string, BusinessDocument>): Posting[] {
  if (!received.size) return [];
  const receiptsOf = new Map<string, string[]>();
  for (const id of received.keys()) {
    const grn = documents.get(id);
    if (grn?.sourceDocumentId) receiptsOf.set(grn.sourceDocumentId, [...(receiptsOf.get(grn.sourceDocumentId) ?? []), id]);
  }
  const bills = [...documents.values()].filter((d) => d.kind === 'purchaseBill').sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const taken = new Set<string>();
  const out: Posting[] = [];
  for (const bill of bills) {
    const ids: string[] = [];
    // Up the bill's chain: a receipt it was made from, or the order whose receipts it bills.
    let at = bill.sourceDocumentId;
    for (let depth = 0; at && depth < 10; depth++) {
      if (received.has(at)) ids.push(at);
      ids.push(...(receiptsOf.get(at) ?? []));
      at = documents.get(at)?.sourceDocumentId;
    }
    const value = [...new Set(ids)].filter((id) => !taken.has(id)).reduce((a, id) => (taken.add(id), a + received.get(id)!), 0);
    if (!Math.round(value)) continue;
    out.push(...toPostings([[GRNI, value], ['sys:purchases', -value]], { type: 'document', id: bill.id, number: bill.number, kind: bill.kind }, bill.date, { branchId: bill.branchId, partyId: bill.partyId, costCentreId: bill.costCentreId }));
  }
  return out;
}

/**
 * The fixed asset register's postings through `until` (RULES 6.15): depreciation at each month's end,
 * depreciation written off before the books began, and disposals. Each under its asset, with its
 * branch and cost centre.
 */
export function postAssets(assets: { list: FixedAsset[]; until: string; fyStartMonth?: number }): Posting[] {
  return assets.list.flatMap((a) =>
    assetEntries(a, assets.until, assets.fyStartMonth).flatMap((e) =>
      toPostings(e.entries, { type: 'asset', id: a.id, number: a.assetCode || a.name, kind: e.kind }, e.date, { branchId: a.branchId, costCentreId: a.costCentreId }),
    ),
  );
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
  /** The fixed asset register, posted through `until`. */
  assets?: { list: FixedAsset[]; until: string; fyStartMonth?: number };
}): Posting[] {
  const dates = new Map(book.documents.map((d) => [d.id, d.date]));
  const documentDate = (id: string) => dates.get(id);
  return [
    ...postOpenings(book),
    ...book.documents.flatMap((d) => postDocument(d, book.baseCurrency)),
    ...book.payments.flatMap((p) => postPayment(p, { homeState: homeStateCode(book.company, book.branches.find((b) => b.id === p.branchId)), documentDate })),
    ...book.expenses.flatMap((e) => postExpense(e, book)),
    ...book.vouchers.flatMap(postVoucher),
    ...(book.assets ? postAssets(book.assets) : []),
    ...(book.stock ? postStock(book.stock, { openingStockMinor: book.openingStockMinor, documents: new Map(book.documents.filter((d) => !OFF_BOOKS.includes(d.status)).map((d) => [d.id, d])) }) : []),
  ].sort((a, b) => a.date.localeCompare(b.date));
}
