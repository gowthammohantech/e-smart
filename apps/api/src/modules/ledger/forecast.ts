import { and, eq, gt, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { cashForecast, type ForecastFlow } from '@esmart/core/domain/cashForecast';
import { PAYABLE_KINDS, RECEIVABLE_KINDS } from '@esmart/core/domain/documentStates';
import { occurrencesBetween } from '@esmart/core/domain/recurrence';
import { addDaysISO, businessDate } from '@esmart/core/lib/date';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { paymentAccountBalances } from '../settings/accounts';

const D = schema.documents;
const E = schema.expenses;

/** The cash-flow forecast: getCashForecast. */
export const forecastHandlers = defineHandlers({
  async getCashForecast(ctx) {
    const weeks = Math.min(Math.max(ctx.query.weeks ?? 13, 1), 52);
    const today = businessDate(ctx.now);
    const horizon = addDaysISO(today, weeks * 7 - 1);
    const c = ctx.company.id;

    // Cash and bank today, in base currency.
    const accounts = await ctx.db.select().from(schema.paymentAccounts).where(eq(schema.paymentAccounts.companyId, c));
    const balances = await paymentAccountBalances(ctx.db, c, accounts);
    const openingCash = Object.values(balances).reduce((a, b) => a + b, 0);

    // What is still owed each way, by due date (the document date when there is none), in base currency.
    const open = await ctx.db
      .select({ id: D.id, kind: D.kind, number: D.number, date: D.date, dueDate: D.dueDate, owed: sql<number>`round((${D.grandTotalMinor} - ${D.amountPaidMinor}) * ${D.exchangeRate})::bigint` })
      .from(D)
      .where(and(eq(D.companyId, c), inArray(D.kind, PAYABLE_KINDS), notInArray(D.status, ['draft', 'cancelled', 'rejected', 'requested']), gt(D.grandTotalMinor, D.amountPaidMinor)));
    const flow = (r: (typeof open)[number]): ForecastFlow => ({
      date: r.dueDate ?? r.date,
      amount: Number(r.owed),
      label: r.number,
      kind: RECEIVABLE_KINDS.includes(r.kind) ? 'receivable' : 'payable',
      ref: `document:${r.id}`,
    });

    // Copies of recurring invoices still to be issued in the weeks ahead.
    const recurringInvoices = await ctx.db
      .select({ id: D.id, number: D.number, date: D.date, recurrence: D.recurrence, next: D.nextRecurrenceDate, end: D.recurrenceEndDate, total: D.grandTotalBaseMinor })
      .from(D)
      .where(and(eq(D.companyId, c), eq(D.kind, 'invoice'), ne(D.recurrence, 'none'), ne(D.status, 'cancelled')));
    // Recurring expenses: each next date takes the template's amount.
    const recurringExpenses = await ctx.db
      .select({ id: E.id, number: E.number, date: E.date, recurrence: E.recurrence, next: E.nextRecurrenceDate, amount: sql<number>`round(${E.amountMinor} * ${E.exchangeRate})::bigint` })
      .from(E)
      .where(and(eq(E.companyId, c), ne(E.recurrence, 'none')));

    const inflows: ForecastFlow[] = [
      ...open.filter((r) => RECEIVABLE_KINDS.includes(r.kind)).map(flow),
      ...recurringInvoices.flatMap((r) => occurrencesBetween(r.date, r.recurrence, r.next, horizon, r.end).map((date) => ({ date, amount: r.total, label: r.number, kind: 'recurringInvoice' as const, ref: `document:${r.id}` }))),
    ];
    const outflows: ForecastFlow[] = [
      ...open.filter((r) => !RECEIVABLE_KINDS.includes(r.kind)).map(flow),
      ...recurringExpenses.flatMap((r) => occurrencesBetween(r.date, r.recurrence, r.next, horizon).map((date) => ({ date, amount: Number(r.amount), label: r.number, kind: 'recurringExpense' as const, ref: `expense:${r.id}` }))),
    ];
    return cashForecast({ today, weeks, openingCash, inflows, outflows }) as never;
  },
});
