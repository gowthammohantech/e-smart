import { and, eq, lte } from 'drizzle-orm';
import type { Book } from '@esmart/core/domain/ledger/accounts';
import { allPostings, type Posting } from '@esmart/core/domain/ledger/postings';
import { openingStockValue, type Stock } from '@esmart/core/domain/ledger/reports';
import type { Voucher } from '@esmart/core/types';
import { goodsCostByDocument, perpetualStock } from '@esmart/core/domain/stockLedger';
import type { BusinessDocument, Item } from '@esmart/core/types';
import { schema } from '@esmart/db';
import { loadAssets } from '../assets/handlers';
import { companyCore, partyCore } from '../documents/engine';
import { coreMovements } from '../inventory/ledger';
import { taxHistories } from '../../lib/taxRates';
import { loadDocuments, loadExpenseCategories, loadExpenses, loadItems, loadPayments, type Scope } from '../reports/data';

// Opening invoices and bills too: they post to the party and Opening balances (RULES 6.12), nothing else.
// Deliveries, goods receipts and purchase orders post nothing themselves; perpetual stock needs them for
// the goods they move and for the bills made from them (RULES 6.2).
const KINDS = ['invoice', 'debitNote', 'salesReturn', 'creditNote', 'purchaseBill', 'supplierDebitNote', 'purchaseReturn', 'supplierCreditNote', 'openingInvoice', 'openingBill', 'delivery', 'goodsReceipt', 'purchaseOrder'] as const;

/**
 * The whole book up to `s.to`, as postings: every sale, purchase, note, payment, expense and voucher
 * since the books began, and the opening balances. The same `@esmart/core` functions the app runs,
 * so the server's trial balance is the app's. Covers every branch: the caller checks the user may see them.
 */
export async function loadBook(s: Scope): Promise<{ postings: Posting[]; book: Book; stock: Stock }> {
  const all: Scope = { ...s, from: '1900-01-01' };
  const base = s.company.baseCurrency.trim();
  const id = s.company.id;
  const { docs } = await loadDocuments(all, [...KINDS]);
  const { payments } = await loadPayments(all);
  const { expenses } = await loadExpenses(all);
  const parties = (await s.db.select().from(schema.parties).where(eq(schema.parties.companyId, id))).map(partyCore);
  const A = schema.paymentAccounts;
  const paymentAccounts = (await s.db.select().from(A).where(eq(A.companyId, id))).map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    openingBalance: { minor: a.openingBalanceMinor, currency: base },
    openingRate: Number(a.openingRate),
  }));
  const expenseCategories = await loadExpenseCategories(s);
  const LA = schema.ledgerAccounts;
  const ledgerAccounts = (await s.db.select().from(LA).where(eq(LA.companyId, id))).map((a) => ({ id: a.id, name: a.name, group: a.group, openingBalance: { minor: a.openingBalanceMinor, currency: base }, openingBalanceDate: a.openingBalanceDate ?? undefined }));
  const vouchers = await loadVouchers(s);
  const branches = await s.db.select().from(schema.branches).where(eq(schema.branches.companyId, id));
  const T = schema.taxCategories;
  const taxRows = await s.db.select().from(T).where(eq(T.companyId, id));
  // With their earlier rates: an expense posts its tax at the rate in force on its date.
  const histories = await taxHistories(s.db, taxRows.map((t) => t.id));
  const taxCategories = taxRows.map((t) => ({ id: t.id, companyId: t.companyId, name: t.name, rate: Number(t.rate), type: t.type, effectiveFrom: t.effectiveFrom, history: histories.get(t.id) }));
  const items = await loadItems(s);
  const movements = await coreMovements(s.db, id, { to: s.to });
  const perpetualFrom = s.company.perpetualStockFrom;
  // A return comes back at what the goods it returns went out (or came in) at.
  const sourceOf = new Map(docs.filter((d) => d.sourceDocumentId).map((d) => [d.id, d.sourceDocumentId!]));
  const costing = s.company.stockCosting as Stock['costing'];
  const stock: Stock = { items, movements, baseCurrency: base, perpetualFrom, sourceOf: (id) => sourceOf.get(id), costing };
  const openingStockMinor = openingStockValue(items, movements, base, costing);

  const postings = allPostings({
    baseCurrency: base,
    company: companyCore(s.company),
    branches: branches.map((b) => ({ id: b.id, companyId: b.companyId, name: b.name, code: b.code, gstin: b.gstin ?? undefined, isPrimary: b.isPrimary }) as never),
    taxCategories,
    documents: docs,
    payments,
    expenses: expenses.filter((e) => e.date <= s.to),
    vouchers: vouchers.filter((v) => v.date <= s.to),
    parties,
    paymentAccounts,
    ledgerAccounts,
    openingStockMinor,
    // Depreciation through the day the book is read to (RULES 6.15).
    assets: { list: await loadAssets(s.db, id), until: s.to, fyStartMonth: s.company.fiscalYearStartMonth },
    ...(perpetualFrom && perpetualFrom <= s.to && { stock: perpetualStock(items, movements, perpetualFrom, base, (id) => sourceOf.get(id), costing) }),
  });
  return { postings, book: { parties, paymentAccounts, expenseCategories, ledgerAccounts }, stock };
}

/**
 * Under perpetual stock, what each sale's goods cost as the books posted it, for the profit report
 * (profitSnapshot). Undefined while the books are periodic. Stock is costed across the whole company,
 * up to `s.to`, whatever branch the report is for.
 */
export async function loadPerpetualCost(s: Pick<Scope, 'db' | 'company' | 'to'>, docs: Pick<BusinessDocument, 'id' | 'sourceDocumentId'>[], items: Item[]): Promise<{ from: string; goodsCost: Map<string, number> } | undefined> {
  const from = s.company.perpetualStockFrom;
  if (!from || from > s.to) return undefined;
  const movements = await coreMovements(s.db, s.company.id, { to: s.to });
  const sourceOf = new Map(docs.filter((d) => d.sourceDocumentId).map((d) => [d.id, d.sourceDocumentId!]));
  const stock = perpetualStock(items, movements, from, s.company.baseCurrency.trim(), (id) => sourceOf.get(id), s.company.stockCosting as 'average' | 'fifo');
  return { from, goodsCost: goodsCostByDocument(stock, docs) };
}

/** The company's vouchers up to `s.to` (of one kind, when given), as core sees them. */
export async function loadVouchers(s: Pick<Scope, 'db' | 'company' | 'to'>, kind?: Voucher['kind']): Promise<Voucher[]> {
  const V = schema.vouchers;
  const base = s.company.baseCurrency.trim();
  const rows = await s.db.select().from(V).where(and(eq(V.companyId, s.company.id), eq(V.status, 'posted'), lte(V.date, s.to), kind ? eq(V.kind, kind) : undefined));
  return rows.map((v) => ({
    id: v.id,
    companyId: v.companyId,
    branchId: v.branchId,
    kind: v.kind,
    number: v.number,
    date: v.date,
    narration: v.narration ?? undefined,
    reference: v.reference ?? undefined,
    challan: (v.challan as Voucher['challan']) ?? undefined,
    gstChallan: (v.gstChallan as Voucher['gstChallan']) ?? undefined,
    gstin: v.gstin ?? undefined,
    gstPeriod: v.gstPeriod ?? undefined,
    // A line's narration and cost centre come with it: profit by centre splits a voucher by line (RULES 6.7).
    lines: (v.lines as { account: string; debitMinor: number; creditMinor: number; narration?: string; costCentreId?: string }[]).map((l) => ({
      account: l.account,
      debit: { minor: l.debitMinor, currency: base },
      credit: { minor: l.creditMinor, currency: base },
      ...(l.narration && { narration: l.narration }),
      ...(l.costCentreId && { costCentreId: l.costCentreId }),
    })),
    createdBy: v.createdBy,
    createdAt: v.createdAt.toISOString(),
  }));
}
