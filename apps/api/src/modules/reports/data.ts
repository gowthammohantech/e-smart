import { and, eq, getTableColumns, gte, inArray, lte, ne, type SQL } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import type { BusinessDocument, DocumentKind, ExpenseCategory, Party, Payment } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { AuthUser, CompanyRow } from '../../context';
import type { DbOrTx } from '../../lib/audit';
import { partyCore } from '../documents/engine';
import { documentsToWire, summariesToWire, toCoreDocument, type SummaryRow } from '../documents/wire';
import { toCoreExpense, type ExpenseRow } from '../expenses/wire';
import { toCoreItem } from '../inventory/ledger';
import { paymentsToWire } from '../payments/wire';

/** What every loader needs: whose data, which branches and which dates. */
export type Scope = { db: DbOrTx; company: CompanyRow; user: AuthUser; now: Date; from: string; to: string };

const D = schema.documents;

/** Rows limited to the branches the caller may see. */
function branchFilter(user: AuthUser, column: typeof D.branchId | typeof schema.expenses.branchId | typeof schema.payments.branchId): SQL | undefined {
  return user.branchIds.length ? inArray(column, user.branchIds) : undefined;
}

/**
 * Documents of `kinds` dated in the range, as `@esmart/core` BusinessDocument
 * through the documents module's own wire mapping (DocumentWire is the app's
 * BusinessDocument), plus a way to turn the ones a report selected back into
 * DocumentSummary rows. Drafts are never live in core, so they are not loaded.
 */
export async function loadDocuments(s: Scope, kinds: DocumentKind[]) {
  const rows = (await s.db
    .select({ ...getTableColumns(D), partyName: schema.parties.name })
    .from(D)
    .innerJoin(schema.parties, eq(schema.parties.id, D.partyId))
    .where(and(eq(D.companyId, s.company.id), inArray(D.kind, kinds), ne(D.status, 'draft'), gte(D.date, s.from), lte(D.date, s.to), branchFilter(s.user, D.branchId)))
    .orderBy(D.date, D.id)) as SummaryRow[];
  const wire = await documentsToWire(s.db, rows, s.now, s.company.baseCurrency.trim());
  const docs: BusinessDocument[] = wire.map(toCoreDocument);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    docs,
    summaries: async (selected: BusinessDocument[]): Promise<Schema<'DocumentSummary'>[]> => summariesToWire(s.db, selected.map((d) => byId.get(d.id)!), s.now),
  };
}

export async function loadParties(s: Scope, ids: string[]): Promise<Party[]> {
  if (!ids.length) return [];
  const rows = await s.db.select().from(schema.parties).where(and(eq(schema.parties.companyId, s.company.id), inArray(schema.parties.id, [...new Set(ids)])));
  return rows.map(partyCore);
}

export async function loadItems(s: Pick<Scope, 'db' | 'company'>) {
  const rows = await s.db.select().from(schema.items).where(eq(schema.items.companyId, s.company.id)).orderBy(schema.items.name, schema.items.id);
  return rows.map(toCoreItem);
}

export async function branchNames(s: Pick<Scope, 'db' | 'company'>): Promise<Record<string, string>> {
  const rows = await s.db.select({ id: schema.branches.id, name: schema.branches.name }).from(schema.branches).where(eq(schema.branches.companyId, s.company.id));
  return Object.fromEntries(rows.map((b) => [b.id, b.name]));
}

/** Expenses dated in the range, as core sees them, with their rows for the wire. */
export async function loadExpenses(s: Scope) {
  const E = schema.expenses;
  const rows = await s.db
    .select()
    .from(E)
    .where(and(eq(E.companyId, s.company.id), gte(E.date, s.from), lte(E.date, s.to), branchFilter(s.user, E.branchId)))
    .orderBy(E.date, E.id);
  return { rows, expenses: rows.map(toCoreExpense), byId: new Map<string, ExpenseRow>(rows.map((r) => [r.id, r])) };
}

export async function loadExpenseCategories(s: Pick<Scope, 'db' | 'company'>): Promise<ExpenseCategory[]> {
  const C = schema.expenseCategories;
  const rows = await s.db.select().from(C).where(eq(C.companyId, s.company.id));
  return rows.map((c) => ({ id: c.id, companyId: c.companyId, name: c.name, icon: c.icon, color: c.color }));
}

/** Payments dated in the range. The wire Payment is core's Payment, so one mapping serves both. */
export async function loadPayments(s: Scope) {
  const P = schema.payments;
  const rows = await s.db
    .select()
    .from(P)
    .where(and(eq(P.companyId, s.company.id), gte(P.date, s.from), lte(P.date, s.to), branchFilter(s.user, P.branchId)))
    .orderBy(P.date, P.id);
  const wire = await paymentsToWire(s.db, rows, s.company.baseCurrency.trim());
  const payments = wire.map((p) => ({ ...(p as unknown as Payment), attachmentIds: p.attachmentIds ?? [], createdAt: p.createdAt ?? '' }));
  return { payments, wire: new Map(wire.map((p) => [p.id!, p])) };
}

export async function accountNames(s: Pick<Scope, 'db' | 'company'>): Promise<Record<string, string>> {
  const A = schema.paymentAccounts;
  const rows = await s.db.select({ id: A.id, name: A.name }).from(A).where(eq(A.companyId, s.company.id));
  return Object.fromEntries(rows.map((a) => [a.id, a.name]));
}
