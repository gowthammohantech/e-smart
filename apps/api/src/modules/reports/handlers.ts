import { inArray } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { PAYMENT_METHODS } from '@esmart/core/data/masters';
import { isCancelled } from '@esmart/core/domain/documentStates';
import { FULL_PLAN, hasModule, moduleForReport } from '@esmart/core/domain/plan';
import { tdsRegister } from '@esmart/core/domain/tds';
import type { BusinessDocument } from '@esmart/core/types';
import { schema } from '@esmart/db';
import { profitSnapshot, summarizeDocuments, summarizeExpenses, summarizePayments, summarizeStock, summarizeTax, type ReportFilters } from '@esmart/core/domain/reports';
import { RawBody, defineHandlers, type Ctx } from '../../context';
import { forbidden, invalid, planUpgradeRequired } from '../../http/errors';
import { loadBook } from '../books/book';
import { trialBalance } from '@esmart/core/domain/ledger/reports';
import { money } from '../../lib/wire';
import { expensesToWire } from '../expenses/wire';
import { coreMovements } from '../inventory/ledger';
import { ledgerHandlers } from '../ledger/handlers';
import { msmeReport } from '../ledger/msme';
import { companyCore } from '../documents/engine';
import { accountNames, branchNames, loadDocuments, loadExpenseCategories, loadExpenses, loadItems, loadParties, loadPayments, type Scope } from './data';
import { tableCsv, tableHtml, tableOf, type ReportBody, type ReportKey } from './table';

type Query = { branchId?: string; partyId?: string; currency?: string };
type AgingCtx = Pick<Ctx<'getReceivables'>, 'company' | 'user' | 'db' | 'now'>;

/** English names for the payment methods (the app translates its own). */
const METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m, { cash: 'Cash', bank: 'Bank transfer', upi: 'UPI', card: 'Card', cheque: 'Cheque', wallet: 'Wallet', other: 'Other' }[m]]),
);

/**
 * Receivables and payables as of `asOf`, from the ledger module (core
 * receivables `buildOutstanding` and `summarizeAging`), so the report and
 * the ledger screen can never disagree.
 */
export async function aging(ctx: AgingCtx, kind: 'receivables' | 'payables', q: { asOf?: string; partyId?: string; branchId?: string }): Promise<Schema<'AgingReport'>> {
  const query = Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined));
  const like = { company: ctx.company, user: ctx.user, db: ctx.db, now: ctx.now, query } as unknown as Ctx<'getReceivables'> & Ctx<'getPayables'>;
  const report = kind === 'receivables' ? await ledgerHandlers.getReceivables(like) : await ledgerHandlers.getPayables(like);
  return report as Schema<'AgingReport'>;
}

/**
 * One of the nine reports, built from the database with the same
 * `@esmart/core` reports functions the app runs, in base currency.
 */
export async function buildReport(s: Scope, key: ReportKey, q: Query): Promise<ReportBody> {
  const base = s.company.baseCurrency.trim();
  const filters: ReportFilters = { range: { from: s.from, to: s.to }, branchId: q.branchId ?? null, partyId: q.partyId ?? null, currency: q.currency ?? null };

  switch (key) {
    case 'sales-summary':
    case 'purchase-summary': {
      const { docs, summaries } = await loadDocuments(s, [key === 'sales-summary' ? 'invoice' : 'purchaseBill']);
      const [parties, items, branches] = [await loadParties(s, docs.map((d) => d.partyId)), await loadItems(s), await branchNames(s)];
      const r = summarizeDocuments(docs, parties, items, branches, base, filters);
      return {
        ...r,
        // Core counts an item's quantity here; the contract's count is an integer.
        byItem: r.byItem.map((row) => ({ ...row, count: Math.round(row.count) })),
        documents: await summaries(r.documents),
      };
    }
    case 'expense-summary': {
      const { expenses, byId } = await loadExpenses(s);
      const r = summarizeExpenses(expenses, await loadExpenseCategories(s), base, filters);
      return { ...r, expenses: await expensesToWire(s.db, r.expenses.map((e) => byId.get(e.id)!)) };
    }
    case 'receivables':
    case 'payables':
      return aging(s, key, { asOf: s.to, partyId: q.partyId, branchId: q.branchId });
    case 'stock': {
      const restricted = s.user.branchIds;
      const branchIds = q.branchId ? [q.branchId] : restricted;
      const hidden = !!q.branchId && restricted.length > 0 && !restricted.includes(q.branchId);
      const movements = hidden ? [] : await coreMovements(s.db, s.company.id, { branchIds, to: s.to });
      const r = summarizeStock(await loadItems(s), movements, base, q.branchId ?? null);
      // Core hands back the Item it was given, which is the wire Item.
      return { ...r, rows: r.rows.map((row) => ({ ...row, item: row.item as unknown as Schema<'Item'> })) };
    }
    case 'tax-summary': {
      const { docs } = await loadDocuments(s, ['invoice', 'debitNote', 'salesReturn', 'creditNote', 'purchaseBill', 'supplierDebitNote', 'purchaseReturn', 'supplierCreditNote']);
      const { expenses } = await loadExpenses(s);
      return summarizeTax(docs, base, filters, expenses, companyCore(s.company));
    }
    case 'payments': {
      const { payments, wire } = await loadPayments(s);
      const r = summarizePayments(payments, await accountNames(s), METHOD_LABELS, base, filters);
      return { ...r, payments: r.payments.map((p) => wire.get(p.id)!) };
    }
    case 'profit': {
      // Bills give the average cost of what was sold.
      const { docs } = await loadDocuments(s, ['invoice', 'debitNote', 'salesReturn', 'creditNote', 'purchaseBill']);
      const { expenses } = await loadExpenses(s);
      return profitSnapshot(docs, expenses, await loadItems(s), base, filters);
    }
    case 'trial-balance': {
      // The books are one set across branches; a user limited to some of them sees the branch reports instead.
      if (s.user.branchIds.length) throw forbidden('BOOKS_ALL_BRANCHES', 'The books cover every branch; ask an owner or admin');
      const { postings, book } = await loadBook(s);
      const tb = trialBalance(postings, book, { from: s.from, to: s.to }, s.company.fiscalYearStartMonth);
      return {
        rows: tb.rows.map((r) => ({ account: r.account.key, name: r.account.name, group: r.account.group, opening: money(r.opening, base), debit: money(r.debit, base), credit: money(r.credit, base), closing: money(r.closing, base) })),
        totalDebit: money(tb.totals.closingDebit, base),
        totalCredit: money(tb.totals.closingCredit, base),
      };
    }
    case 'msme-payables':
      return msmeReport(s.db, s.company, s.to, s.user.branchIds);
    case 'tds-register': {
      const { docs } = await loadDocuments(s, ['purchaseBill', 'supplierDebitNote', 'supplierCreditNote']);
      const live = docs.filter((d) => !isCancelled(d.status) && (!q.partyId || d.partyId === q.partyId));
      const partyIds = [...new Set(live.map((d) => d.partyId))];
      const parties = partyIds.length ? await s.db.select({ id: schema.parties.id, name: schema.parties.name, pan: schema.parties.pan }).from(schema.parties).where(inArray(schema.parties.id, partyIds)) : [];
      const toBase = (minor: number, d: BusinessDocument) => Math.round(minor * (d.currency === base ? 1 : d.exchangeRate));
      const rows = tdsRegister(
        live.map((d) => ({
          partyId: d.partyId,
          date: d.date,
          tds: d.tds ? { section: d.tds.section, amount: { minor: toBase(d.tds.amount.minor, d) } } : undefined,
          baseMinor: toBase(d.totals.taxableAmount.minor, d),
          sign: d.kind === 'supplierCreditNote' ? -1 : 1,
        })),
        parties.map((p) => ({ id: p.id, name: p.name, pan: p.pan ?? undefined })),
        { from: s.from, to: s.to },
      );
      return {
        rows: rows.map((r) => ({ ...r, base: money(r.baseMinor, base), tds: money(r.tdsMinor, base), baseMinor: undefined, tdsMinor: undefined })),
        total: money(rows.reduce((a, r) => a + r.tdsMinor, 0), base),
      };
    }
  }
}

/** Reports: getReport. JSON by default; CSV or PDF when `Accept` asks for one. */
export const reportsHandlers = defineHandlers({
  async getReport(ctx) {
    const key = ctx.params.reportKey as ReportKey;
    const module = moduleForReport(key);
    if (module && !hasModule(ctx.company.plan, module)) throw planUpgradeRequired(FULL_PLAN, module);
    const { from, to, branchId, partyId, currency } = ctx.query;
    if (from > to) throw invalid('from', 'The range starts after it ends');

    const scope: Scope = { db: ctx.db, company: ctx.company, user: ctx.user, now: ctx.now, from, to };
    const body = await buildReport(scope, key, { branchId, partyId, currency });

    const accept = String(ctx.req.headers.accept ?? '');
    const wants = (type: string) => accept.includes(type) && !accept.includes('application/json');
    if (wants('text/csv') || wants('application/pdf')) {
      const category = key === 'expense-summary' ? Object.fromEntries((await loadExpenseCategories(scope)).map((c) => [c.id, c.name])) : {};
      const table = tableOf(key, body, { category });
      const name = `${key}-${from}-${to}`;
      if (wants('text/csv')) return new RawBody(tableCsv(table), 'text/csv; charset=utf-8', `${name}.csv`);
      return new RawBody(await ctx.deps.providers.pdf.render(tableHtml(ctx.company, table, { from, to })), 'application/pdf', `${name}.pdf`);
    }
    return body;
  },
});
