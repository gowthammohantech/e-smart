import { eq } from 'drizzle-orm';
import type { Book } from '@esmart/core/domain/ledger/accounts';
import { allPostings, type Posting } from '@esmart/core/domain/ledger/postings';
import { openingStockValue, type Stock } from '@esmart/core/domain/ledger/reports';
import type { Voucher } from '@esmart/core/types';
import { schema } from '@esmart/db';
import { companyCore, partyCore } from '../documents/engine';
import { coreMovements } from '../inventory/ledger';
import { loadDocuments, loadExpenseCategories, loadExpenses, loadItems, loadPayments, type Scope } from '../reports/data';

const KINDS = ['invoice', 'debitNote', 'salesReturn', 'creditNote', 'purchaseBill', 'supplierDebitNote', 'purchaseReturn', 'supplierCreditNote'] as const;

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
  const V = schema.vouchers;
  const vouchers: Voucher[] = (await s.db.select().from(V).where(eq(V.companyId, id))).map((v) => ({
    id: v.id,
    companyId: v.companyId,
    branchId: v.branchId,
    kind: v.kind,
    number: v.number,
    date: v.date,
    lines: (v.lines as { account: string; debitMinor: number; creditMinor: number }[]).map((l) => ({ account: l.account, debit: { minor: l.debitMinor, currency: base }, credit: { minor: l.creditMinor, currency: base } })),
    createdBy: v.createdBy,
    createdAt: v.createdAt.toISOString(),
  }));
  const branches = await s.db.select().from(schema.branches).where(eq(schema.branches.companyId, id));
  const T = schema.taxCategories;
  const taxCategories = (await s.db.select().from(T).where(eq(T.companyId, id))).map((t) => ({ id: t.id, companyId: t.companyId, name: t.name, rate: Number(t.rate), type: t.type, effectiveFrom: t.effectiveFrom }));
  const items = await loadItems(s);
  const movements = await coreMovements(s.db, id, { to: s.to });
  const stock: Stock = { items, movements, baseCurrency: base };

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
    openingStockMinor: openingStockValue(items, movements, base),
  });
  return { postings, book: { parties, paymentAccounts, expenseCategories, ledgerAccounts }, stock };
}
