import { and, eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { issueInvoice, moneySetup } from './money-fixtures';
import { INR, books } from './report-fixtures';
import { joinTeam } from './team-helpers';

const t = setupApi();

describe('dashboard', () => {
  it('summarises the month from the same numbers as the reports', async () => {
    const m = await moneySetup(t);
    const k = await books(t, m);
    await m.item({ name: 'Anchor bolt', reorderLevel: '5' }); // tracked, none in stock: low
    await t.deps.db.insert(schema.eInvoices).values({ documentId: k.a.id, companyId: m.companyId, status: 'pending' });

    const res = await t.get(`${m.c}/dashboard`, { token: m.token });
    expect(res.status).toBe(200);
    const unread = await t.deps.db.select().from(schema.notifications).where(and(eq(schema.notifications.companyId, m.companyId), isNull(schema.notifications.readAt)));
    expect(res.body).toMatchObject({
      sales: INR(236000), // invoice A only; B is August's and the draft is not live
      purchases: INR(324500),
      expenses: INR(11800),
      receivable: INR(254000),
      overdueReceivable: INR(118000), // B, due 14 Sep
      payable: INR(324500),
      cashBalance: INR(100000 - 11800),
      lowStockCount: 1,
      pendingCompliance: 1,
      unreadNotifications: unread.length,
    });
    expect(unread.length).toBeGreaterThan(0);
    expect(res.body.salesTrend).toEqual([
      { key: '2026-04', value: INR(0) },
      { key: '2026-05', value: INR(0) },
      { key: '2026-06', value: INR(0) },
      { key: '2026-07', value: INR(0) },
      { key: '2026-08', value: INR(118000) },
      { key: '2026-09', value: INR(236000) },
    ]);
    expect(res.body.recentDocuments.map((d: { id: string }) => d.id)).toEqual([k.draft.id, k.a.id, k.b.id]);

    const year = await t.get(`${m.c}/dashboard`, { token: m.token, query: { range: 'year' } });
    expect(year.body.sales).toEqual(INR(354000));
    const today = await t.get(`${m.c}/dashboard`, { token: m.token, query: { range: 'today' } });
    expect(today.body.sales).toEqual(INR(0));
    const week = await t.get(`${m.c}/dashboard`, { token: m.token, query: { range: 'week' } });
    expect(week.body.expenses).toEqual(INR(0));
    const quarter = await t.get(`${m.c}/dashboard`, { token: m.token, query: { range: 'quarter' } });
    expect(quarter.body.sales).toEqual(INR(354000));
  });

  it('gives the Sales tab its figures in one call', async () => {
    const m = await moneySetup(t);
    const k = await books(t, m);
    await t.deps.db.insert(schema.eInvoices).values({ documentId: k.a.id, companyId: m.companyId, status: 'generated' });
    const res = await t.get(`${m.c}/hubs/sales`, { token: m.token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      invoicedThisMonth: INR(236000), // A; B is August's and the draft doesn't count
      collectedThisMonth: INR(100000),
      outstanding: { amount: INR(254000), count: 2 },
      overdue: { amount: INR(118000), count: 1 }, // B, due 14 Sep
      counts: { invoice: 3 },
      paymentsReceived: 1,
      eInvoicesGenerated: 1,
    });
    // Top customers are the period's: B (August's) only counts over the year.
    expect(res.body.topCustomers).toEqual([{ partyId: m.mumbai.id, name: 'Sunrise Retail', total: INR(236000) }]);
    const year = await t.get(`${m.c}/hubs/sales`, { token: m.token, query: { range: 'year', compare: 'previous' } });
    expect(year.body.topCustomers).toEqual([
      { partyId: m.mumbai.id, name: 'Sunrise Retail', total: INR(236000) },
      { partyId: m.bengaluru.id, name: expect.any(String), total: INR(118000) },
    ]);
    expect(year.body).toMatchObject({ period: { range: 'year', from: '2026-04-01', to: '2027-03-31', previous: { from: '2025-04-01', to: '2026-03-31' } }, invoicedThisMonth: INR(354000), invoicesThisMonth: 2 });
    expect(year.body.previous).toEqual({ invoiced: INR(0), invoices: 0, collected: INR(0) });
    expect(res.body.recentInvoices.map((d: { id: string }) => d.id)).toEqual([k.draft.id, k.a.id, k.b.id]);
  });

  it('gives the Purchases tab its figures in one call', async () => {
    const m = await moneySetup(t);
    const k = await books(t, m);
    const res = await t.get(`${m.c}/hubs/purchases`, { token: m.token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      billedThisMonth: INR(324500),
      expensesThisMonth: INR(11800),
      payable: { amount: INR(324500), count: 1 },
      counts: { purchaseBill: 1 },
      expenses: 1,
      paymentsMade: 0,
      expensesByCategory: [{ categoryId: k.category.id, name: k.category.name, total: INR(11800) }],
    });
    expect(res.body.recentBills.map((d: { id: string }) => d.id)).toEqual([(k.bill as { id: string }).id]);
  });

  it('leaves out what the plan does not include', async () => {
    const m = await moneySetup(t, 'basic');
    t.setNow('2026-09-29T10:00:00Z');
    await issueInvoice(t, m, { date: '2026-09-10' });
    const res = await t.get(`${m.c}/dashboard`, { token: m.token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sales: INR(236000), receivable: INR(236000), overdueReceivable: INR(0), cashBalance: INR(0) });
    for (const key of ['purchases', 'expenses', 'payable', 'lowStockCount']) expect(res.body[key], key).toBeUndefined();
  });

  describe('periods', () => {
    it('takes the period from the query, compares it with the one before, and buckets the trend', async () => {
      const m = await moneySetup(t);
      await books(t, m);
      const res = await t.get(`${m.c}/hubs/home`, { token: m.token, query: { compare: 'previous', grain: 'week' } });
      expect(res.status).toBe(200);
      expect(res.body.period).toEqual({ range: 'month', from: '2026-09-01', to: '2026-09-30', grain: 'week', previous: { from: '2026-08-01', to: '2026-08-31' } });
      expect(res.body).toMatchObject({ salesThisMonth: INR(236000), invoicesThisMonth: 1, collectedThisMonth: INR(100000), expensesThisMonth: INR(11800) });
      expect(res.body.previous).toMatchObject({ sales: INR(118000), invoices: 1, collected: INR(0), expenses: INR(0) });
      // Monday-weeks clipped to September: 1-6, 7-13 (A on the 10th), 14-20, 21-27, 28-30.
      expect(res.body.salesTrend.map((r: { key: string; value: { minor: number } }) => [r.key, r.value.minor])).toEqual([
        ['2026-08-31', 0],
        ['2026-09-07', 236000],
        ['2026-09-14', 0],
        ['2026-09-21', 0],
        ['2026-09-28', 0],
      ]);

      const custom = await t.get(`${m.c}/hubs/home`, { token: m.token, query: { range: 'custom', from: '2026-08-01', to: '2026-09-30', grain: 'day' } });
      expect(custom.body.salesThisMonth).toEqual(INR(354000));
      expect(custom.body.salesTrend).toHaveLength(61);
      expect(custom.body.period.grain).toBe('day');
    });

    it('refuses a custom period that is missing a day or runs backwards', async () => {
      const m = await moneySetup(t);
      const backwards = await t.get(`${m.c}/hubs/sales`, { token: m.token, query: { range: 'custom', from: '2026-09-30', to: '2026-09-01' } });
      expect(backwards.status).toBe(422);
      expect(backwards.body.issues[0].field).toBe('from');
      const missing = await t.get(`${m.c}/hubs/sales`, { token: m.token, query: { range: 'custom', from: '2026-09-01' } });
      expect(missing.status).toBe(422);
      expect(missing.body.issues[0].field).toBe('to');
    });

    it('counts the day in India, not in UTC', async () => {
      const m = await moneySetup(t);
      t.setNow('2026-09-30T20:00:00Z'); // 1 October, 01:30 in India
      const res = await t.get(`${m.c}/hubs/home`, { token: m.token });
      expect(res.body.period).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    });
  });

  describe('branches', () => {
    it('follows the branch asked for, and refuses one the user does not work in', async () => {
      const m = await moneySetup(t);
      await books(t, m);
      const pune = await t.post(`${m.c}/branches`, { name: 'Pune', code: 'PNQ', address: { line1: '1 FC Road', city: 'Pune', state: 'Maharashtra', stateCode: '27', postalCode: '411004', country: 'IN' } }, { token: m.token });
      expect(pune.status).toBe(201);
      for (const hub of ['home', 'sales', 'purchases']) {
        const res = await t.get(`${m.c}/hubs/${hub}`, { token: m.token, query: { branchId: pune.body.id } });
        expect(res.status, hub).toBe(200);
      }
      const home = await t.get(`${m.c}/hubs/home`, { token: m.token, query: { branchId: pune.body.id } });
      expect(home.body.salesThisMonth).toEqual(INR(0));
      const own = await t.get(`${m.c}/hubs/home`, { token: m.token, query: { branchId: m.branch.id } });
      expect(own.body.salesThisMonth).toEqual(INR(236000));

      const member = await joinTeam(t, m.token, { role: 'accountant', companyIds: [m.companyId], branchIds: [pune.body.id] });
      const refused = await t.get(`${m.c}/hubs/sales`, { token: member.token, query: { branchId: m.branch.id } });
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe('BRANCH_NOT_ALLOWED');
      const theirs = await t.get(`${m.c}/hubs/sales`, { token: member.token });
      expect(theirs.body.invoicedThisMonth).toEqual(INR(0));

      // The books cover every branch: a user limited to some sees the accounts hub without them.
      const accounts = await t.get(`${m.c}/hubs/accounts`, { token: member.token });
      expect(accounts.status).toBe(200);
      expect(accounts.body.books).toBe(false);
      expect(accounts.body.balanceSheet).toBeUndefined();
      expect(accounts.body.accountMovement).toBeUndefined();
      expect(accounts.body.cash.opening).toBeUndefined();
    });
  });

  describe('one set of figures', () => {
    it('gives Home the profit report\'s profit, and cash that ties to the balances', async () => {
      const m = await moneySetup(t);
      await books(t, m);
      const home = await t.get(`${m.c}/hubs/home`, { token: m.token, query: { compare: 'previous' } });
      const report = await t.get(`${m.c}/report-data/profit`, { token: m.token, query: { from: '2026-09-01', to: '2026-09-30' } });
      expect(report.status).toBe(200);
      expect(home.body.profit).toEqual(report.body.netProfit);
      const before = await t.get(`${m.c}/report-data/profit`, { token: m.token, query: { from: '2026-08-01', to: '2026-08-31' } });
      expect(home.body.previous.profit).toEqual(before.body.netProfit);

      const dash = await t.get(`${m.c}/dashboard`, { token: m.token });
      expect(home.body.cash.total).toEqual(dash.body.cashBalance);
      expect(home.body.cash.accounts).toEqual([expect.objectContaining({ id: m.cash.id, balance: INR(100000 - 11800) })]);
      // September's cash: 1,000 in from Sunrise, 118 out on the expense.
      expect(home.body.cashFlow.find((r: { key: string }) => r.key === '2026-09')).toEqual({ key: '2026-09', inflow: INR(100000), outflow: INR(11800) });
      expect(home.body.invoiceStatus).toEqual([{ status: 'partiallyPaid', count: 1, total: INR(236000) }]);
      expect(home.body.moneyMovement.map((r: { kind: string; label: string; amount: unknown }) => [r.kind, r.amount])).toEqual([
        ['received', INR(100000)],
        ['expense', INR(11800)],
      ]);
      expect(home.body.inventory).toMatchObject({ tracked: 1, dead: 0 });

      const accounts = await t.get(`${m.c}/hubs/accounts`, { token: m.token });
      expect(accounts.status).toBe(200);
      expect(accounts.body.profit.netProfit).toEqual(report.body.netProfit);
      expect(accounts.body.profit).toMatchObject({ revenue: report.body.revenue, costOfGoods: report.body.costOfGoods, grossProfit: report.body.grossProfit, expenses: report.body.expenses });
      expect(accounts.body.cash).toMatchObject({ inflow: INR(100000), outflow: INR(11800), receipts: INR(100000), expenses: INR(-11800) });
      expect(accounts.body.cash.closing).toEqual(home.body.cash.total);
      expect(accounts.body.books).toBe(true);
      expect(accounts.body.balanceSheet.totalAssets).toEqual(accounts.body.balanceSheet.totalLiabilities);
      expect(accounts.body.accountMovement.length).toBeGreaterThan(0);
      const tax = await t.get(`${m.c}/report-data/tax-summary`, { token: m.token, query: { from: '2026-09-01', to: '2026-09-30' } });
      expect(accounts.body.tax).toEqual({ output: tax.body.outwardTotal, input: tax.body.inwardTotal, netPayable: tax.body.netPayable });
    });

    it('gives the profit report and Accounts & P&L the books\' profit and loss, vouchers and other income included', async () => {
      const m = await moneySetup(t);
      await t.deps.db.update(schema.companies).set({ perpetualStockFrom: null }).where(eq(schema.companies.id, m.companyId));
      await books(t, m);
      // Postings the documents alone never showed: round off on a journal (indirect expense) and a discount received (indirect income).
      const j = await t.post(`${m.c}/vouchers`, { kind: 'journal', date: '2026-09-25', lines: [{ account: 'sys:roundOff', debit: INR(500), credit: INR(0) }, { account: 'sys:capital', debit: INR(0), credit: INR(500) }] }, { token: m.token });
      expect(j.status).toBe(201);
      const r = await t.post(`${m.c}/vouchers`, { kind: 'receipt', date: '2026-09-26', lines: [{ account: `pay:${m.cash.id}`, debit: INR(700), credit: INR(0) }, { account: 'sys:discountReceived', debit: INR(0), credit: INR(700) }] }, { token: m.token });
      expect(r.status).toBe(201);
      const range = { from: '2026-09-01', to: '2026-09-30' };
      const pl = await t.get(`${m.c}/books/profit-loss`, { token: m.token, query: range });
      const report = await t.get(`${m.c}/report-data/profit`, { token: m.token, query: range });
      const hub = await t.get(`${m.c}/hubs/accounts`, { token: m.token, query: { range: 'custom', ...range } });
      for (const figures of [report.body, hub.body.profit]) {
        expect(figures.grossProfit.minor).toBe(pl.body.grossProfit);
        expect(figures.netProfit.minor).toBe(pl.body.netProfit);
        expect(figures.otherIncome).toEqual(INR(700));
        expect(figures.grossProfit.minor + figures.otherIncome.minor - figures.expenses.minor).toBe(figures.netProfit.minor);
      }
      // The expense (100 net of tax) and the round off.
      expect(report.body.expenses).toEqual(INR(10500));
      // The tile beside them is the period's net cash flow, not a balance: money in less money out.
      expect(hub.body.cash.net.minor).toBe(hub.body.cash.inflow.minor - hub.body.cash.outflow.minor);
    });

    it('gives the Expenses tab the period\'s spending', async () => {
      const m = await moneySetup(t);
      const k = await books(t, m);
      const res = await t.get(`${m.c}/hubs/purchases`, { token: m.token, query: { compare: 'previous' } });
      expect(res.body.previous).toEqual({ billed: INR(0), expenses: INR(0) });
      expect(res.body.expenseInsights).toMatchObject({ count: 1, tax: INR(1800), itcEligibleTax: INR(1800), billable: INR(0), topSuppliers: [], upcomingRecurring: [] });
      expect(res.body.expenseInsights.trend.at(-1)).toEqual({ key: '2026-09', value: INR(11800) });
      const august = await t.get(`${m.c}/hubs/purchases`, { token: m.token, query: { range: 'custom', from: '2026-08-01', to: '2026-08-31' } });
      expect(august.body.expensesByCategory).toEqual([]);
      expect(res.body.expensesByCategory).toEqual([{ categoryId: k.category.id, name: k.category.name, total: INR(11800) }]);
    });
  });

  describe('compliance', () => {
    it('lists what falls due, and says when 2B is not fetched', async () => {
      const m = await moneySetup(t);
      const res = await t.get(`${m.c}/hubs/compliance`, { token: m.token });
      expect(res.status).toBe(200);
      // 29 Sep 2026, monthly: August's 3B (20 Sep) is late; September's returns fall due in October.
      const kinds = res.body.calendar.map((d: { kind: string; period: string; status: string; gstin: string }) => `${d.gstin}:${d.kind}:${d.period}:${d.status}`);
      expect(kinds).toContain('27AAPFU0939F1ZV:gstr3b:082026:overdue');
      expect(kinds).toContain('27AAPFU0939F1ZV:gstr1:092026:pending');
      expect(kinds).toContain('27AAPFU0939F1ZV:gstr3b:092026:pending');
      expect(res.body.itc).toEqual({ gstin: '27AAPFU0939F1ZV', period: '082026', fetched: false });

      // A return recorded as filed shows filed.
      await t.deps.db.insert(schema.gstReturns).values({ id: 'gsr_test1', companyId: m.companyId, gstin: '27AAPFU0939F1ZV', returnType: 'gstr3b', period: '082026', status: 'filed' });
      const after = await t.get(`${m.c}/hubs/compliance`, { token: m.token });
      expect(after.body.calendar).toContainEqual(expect.objectContaining({ kind: 'gstr3b', period: '082026', status: 'filed' }));
      const basic = await moneySetup(t, 'basic');
      const sales = await t.get(`${basic.c}/hubs/compliance`, { token: basic.token });
      expect(sales.status).toBe(200);
      expect(sales.body.itc).toBeUndefined();
      expect(sales.body.tdsDue).toBeUndefined();
    });
  });
});
