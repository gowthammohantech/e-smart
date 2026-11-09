import { inArray } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { PAYMENT_METHODS } from '@esmart/core/data/masters';
import { PAYABLE_KINDS, RECEIVABLE_KINDS, isCancelled } from '@esmart/core/domain/documentStates';
import { FULL_PLAN, hasModule, moduleForReport } from '@esmart/core/domain/plan';
import { tdsRegister } from '@esmart/core/domain/tds';
import type { BusinessDocument } from '@esmart/core/types';
import { schema } from '@esmart/db';
import { summarizeAdvances, summarizeDocuments, summarizeExpenses, summarizePayments, summarizeStock, summarizeTax, type ReportFilters } from '@esmart/core/domain/reports';
import { RawBody, defineHandlers, type Ctx } from '../../context';
import { forbidden, invalid, planUpgradeRequired } from '../../http/errors';
import { loadBook, loadVouchers } from '../books/book';
import { amendmentsForScreen, gstr1ForRange } from '../gst/handlers';
import { buildOutstanding, summarizeAging } from '@esmart/core/domain/receivables';
import { tds26asMatch, tdsPayableSummary, tdsReceivable, tdsReturnRows } from '@esmart/core/domain/tdsReports';
import { tcsPayableSummary, tcsRegister } from '@esmart/core/domain/tcsReports';
import { msmePayables, sec43bh } from '@esmart/core/domain/msme';
import { today } from '../documents/lifecycle';
import { profitFigures, trialBalance } from '@esmart/core/domain/ledger/reports';
import { money } from '../../lib/wire';
import { expensesToWire } from '../expenses/wire';
import { coreMovements } from '../inventory/ledger';
import { ledgerHandlers } from '../ledger/handlers';
import { msmeReport } from '../ledger/msme';
import { companyCore } from '../documents/engine';
import { branchScope } from '../dashboard/period';
import { accountNames, branchNames, loadDocuments, loadExpenseCategories, loadExpenses, loadItems, loadParties, loadPayments, type Scope } from './data';
import { tableCsv, tableHtml, tableOf, type ReportBody, type ReportKey } from './table';

type Query = { branchId?: string; partyId?: string; currency?: string };
type AgingCtx = Pick<Ctx<'getReceivables'>, 'company' | 'user' | 'db' | 'now'>;

/** English names for the payment methods (the app translates its own). */
/** Bought documents that give TDS back, counted against their bill's section. */
const TDS_BACK = new Set<string>(['supplierCreditNote', 'purchaseReturn']);
/** In the TDS register: not cancelled, and a return only once it has gone through (not drafted, requested or rejected). */
const tdsLive = (d: BusinessDocument) => !isCancelled(d.status) && (d.kind !== 'purchaseReturn' || !['draft', 'requested', 'rejected'].includes(d.status));

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
      const r = summarizeStock(await loadItems(s), movements, base, q.branchId ?? null, s.company.stockCosting as 'average' | 'fifo');
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
      // The books' profit and loss, so this report agrees with Books → Profit and loss (RULES 6.2).
      const { postings, book, stock } = await loadBook(s);
      return profitFigures(postings, book, { from: s.from, to: s.to }, stock, branchScope(s.user, q.branchId));
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
      // A purchase return gives back TDS at its bill's rate, as a credit note does.
      const { docs } = await loadDocuments(s, ['purchaseBill', 'supplierDebitNote', 'supplierCreditNote', 'purchaseReturn']);
      const live = docs.filter((d) => tdsLive(d) && (!q.partyId || d.partyId === q.partyId));
      const partyIds = [...new Set(live.map((d) => d.partyId))];
      const parties = partyIds.length ? await s.db.select({ id: schema.parties.id, name: schema.parties.name, pan: schema.parties.pan }).from(schema.parties).where(inArray(schema.parties.id, partyIds)) : [];
      const toBase = (minor: number, d: BusinessDocument) => Math.round(minor * (d.currency === base ? 1 : d.exchangeRate));
      const rows = tdsRegister(
        live.map((d) => ({
          partyId: d.partyId,
          date: d.date,
          tds: d.tds ? { section: d.tds.section, amount: { minor: toBase(d.tds.amount.minor, d) } } : undefined,
          baseMinor: toBase(d.totals.taxableAmount.minor, d),
          sign: TDS_BACK.has(d.kind) ? -1 : 1,
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
  async getReportData(ctx) {
    const key = ctx.params.reportKey;
    const module = moduleForReport(key);
    if (module && !hasModule(ctx.company.plan, module)) throw planUpgradeRequired(FULL_PLAN, module);
    const { from, to, branchId, partyId } = ctx.query;
    if (from > to) throw invalid('from', 'The range starts after it ends');
    // The whole book up to `to`, as the app held it: the core functions apply the range themselves.
    const all: Scope = { db: ctx.db, company: ctx.company, user: ctx.user, now: ctx.now, from: '1900-01-01', to };
    const base = ctx.company.baseCurrency.trim();
    const filters: ReportFilters = { range: { from, to }, branchId: branchId ?? null, partyId: partyId ?? null, currency: null };
    const range = { from, to };
    const SALES_SIDE = ['invoice', 'debitNote', 'salesReturn', 'creditNote'] as const;
    const BUY_SIDE = ['purchaseBill', 'supplierDebitNote', 'purchaseReturn', 'supplierCreditNote'] as const;
    const partiesOf = async (docs: { partyId: string }[], extra: { partyId: string }[] = []) => loadParties(all, [...docs, ...extra].map((d) => d.partyId));
    const inScope = <T extends { branchId?: string; partyId?: string }>(rows: T[]) => rows.filter((r) => (!branchId || r.branchId === branchId) && (!partyId || r.partyId === partyId));

    switch (key) {
      case 'sales-summary':
      case 'purchase-summary': {
        const { docs } = await loadDocuments(all, [key === 'sales-summary' ? 'invoice' : 'purchaseBill']);
        const parties = await partiesOf(docs);
        const partyNames = Object.fromEntries(parties.map((p) => [p.id, p.name]));
        return { ...summarizeDocuments(docs, parties, await loadItems(all), await branchNames(all), base, filters), partyNames } as never;
      }
      case 'expense-summary': {
        const { expenses } = await loadExpenses(all);
        return summarizeExpenses(expenses, await loadExpenseCategories(all), base, filters) as never;
      }
      case 'tax-summary': {
        const { docs } = await loadDocuments(all, [...SALES_SIDE, ...BUY_SIDE]);
        const { expenses } = await loadExpenses(all);
        return summarizeTax(docs, base, filters, expenses, companyCore(ctx.company)) as never;
      }
      case 'payments': {
        const { payments } = await loadPayments(all);
        // Methods are labelled by their key: the app names them in the reader's language.
        return summarizePayments(payments, await accountNames(all), Object.fromEntries(PAYMENT_METHODS.map((m) => [m, m])), base, filters) as never;
      }
      case 'advances': {
        const { payments } = await loadPayments(all);
        const r = summarizeAdvances(payments, base, filters);
        // Names travel with the rows: the app needn't hold every party to show them.
        const names = Object.fromEntries((await loadParties(all, r.rows.map((x) => x.partyId))).map((p) => [p.id, p.name]));
        return { ...r, partyNames: names } as never;
      }
      case 'stock': {
        const branchIds = branchScope(ctx.user, branchId);
        const movements = await coreMovements(ctx.db, ctx.company.id, { branchIds, to });
        return summarizeStock(await loadItems(all), movements, base, branchId ?? null, ctx.company.stockCosting as 'average' | 'fifo') as never;
      }
      case 'profit': {
        // The books' profit and loss, so this report agrees with Books → Profit and loss (RULES 6.2).
        const { postings, book, stock } = await loadBook(all);
        return profitFigures(postings, book, range, stock, branchScope(ctx.user, branchId)) as never;
      }
      case 'receivables':
      case 'payables': {
        const sales = key === 'receivables';
        // What is owed is what the ledger screen, the dashboard and the export count: debit notes and
        // opening invoices (or bills) too, aged as of the report's last day.
        const owedKinds = sales ? RECEIVABLE_KINDS : PAYABLE_KINDS.filter((k) => !RECEIVABLE_KINDS.includes(k));
        const { docs } = await loadDocuments(all, [...new Set([...(sales ? SALES_SIDE : BUY_SIDE), ...owedKinds])]);
        const { payments } = await loadPayments(all);
        const owed = inScope(docs.filter((d) => owedKinds.includes(d.kind)));
        const outstanding = buildOutstanding(owed, payments.filter((p) => p.direction === (sales ? 'received' : 'paid')), to, docs);
        const partyNames = Object.fromEntries((await partiesOf(outstanding.map((o) => o.document))).map((p) => [p.id, p.name]));
        return { outstanding, summary: summarizeAging(outstanding, base), partyNames } as never;
      }
      case 'tds-register': {
        const { docs } = await loadDocuments(all, [...BUY_SIDE]);
        const live = inScope(docs.filter(tdsLive));
        const rate = (d: BusinessDocument) => (d.currency === base ? 1 : d.exchangeRate);
        const rows = tdsRegister(
          live.map((d) => ({
            partyId: d.partyId,
            date: d.date,
            tds: d.tds ? { section: d.tds.section, amount: { minor: Math.round(d.tds.amount.minor * rate(d)) } } : undefined,
            baseMinor: Math.round(d.totals.taxableAmount.minor * rate(d)),
            sign: TDS_BACK.has(d.kind) ? -1 : 1,
          })),
          await partiesOf(live),
          range,
        );
        return { rows } as never;
      }
      case 'tds-payable':
      case 'tds-receivable': {
        if (ctx.user.branchIds.length) throw forbidden('BOOKS_ALL_BRANCHES', 'The books cover every branch; ask an owner or admin');
        const { postings, book } = await loadBook(all);
        if (key === 'tds-payable') return { rows: tdsPayableSummary(postings, range, today(ctx.now)) } as never;
        const parties = await loadParties(all, book.parties.map((p) => p.id));
        // The 26AS match: what invoices expected customers to deduct against what receipts recorded.
        const { docs: invoices } = await loadDocuments(all, ['invoice']);
        return { rows: tdsReceivable(postings, parties, range), match: tds26asMatch(postings, inScope(invoices), parties, base, range) } as never;
      }
      case 'tcs-register':
      case 'tcs-payable': {
        const { docs } = await loadDocuments(all, ['invoice', 'creditNote', 'salesReturn']);
        const live = inScope(docs);
        const register = tcsRegister(live, await partiesOf(live), base, range);
        if (key === 'tcs-register') return { rows: register } as never;
        if (ctx.user.branchIds.length) throw forbidden('BOOKS_ALL_BRANCHES', 'The books cover every branch; ask an owner or admin');
        const { postings } = await loadBook(all);
        return tcsPayableSummary(postings, register, range, today(ctx.now)) as never;
      }
      case 'tds-26q':
      case 'tds-challans': {
        const { docs } = await loadDocuments(all, [...BUY_SIDE]);
        const vouchers = await loadVouchers(all, 'tdsChallan');
        // Payments made that kept TDS back under a section are deductee rows too.
        const { payments } = await loadPayments(all);
        const sectioned = inScope(payments.filter((p) => p.direction === 'paid' && !!p.tdsSection));
        return tdsReturnRows(inScope(docs), vouchers, await partiesOf(docs, sectioned), base, range, sectioned) as never;
      }
      case 'gstr1': {
        // The screen's range and branch, within the branches the user may see.
        const branchIds = branchScope(ctx.user, branchId);
        const summary = await gstr1ForRange(ctx.db, ctx.company, range, ctx.now, { branchIds });
        // A month's screen shows what its return amends of earlier filed ones: a whole registration's,
        // so not to someone who sees only some branches.
        const amendments = ctx.user.branchIds.length ? undefined : await amendmentsForScreen(ctx.db, ctx.company, range, ctx.now, branchIds);
        return (amendments ? { ...summary, amendments } : summary) as never;
      }
      case 'msme-payables': {
        const { docs } = await loadDocuments(all, [...BUY_SIDE]);
        const { payments } = await loadPayments(all);
        const bills = inScope(docs);
        const parties = await partiesOf(bills);
        const partyNames = Object.fromEntries(parties.map((p) => [p.id, p.name]));
        return { rows: msmePayables(to, bills, parties, payments, Number(ctx.company.msmeBankRate)), late: sec43bh(to, bills, parties, payments, ctx.company.fiscalYearStartMonth), partyNames } as never;
      }
    }
  },

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
