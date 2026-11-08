import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { fundCash, issueInvoice, moneySetup } from './money-fixtures';

const t = setupApi();
beforeEach(() => t.setNow('2026-09-29T10:00:00Z'));

const inr = (minor: number) => ({ minor, currency: 'INR' });
const months = (n: number) => Array(12).fill(n);

describe('budgets', () => {
  it('plans income and expense accounts for a year, and sets the books against it to date', async () => {
    const m = await moneySetup(t);
    await fundCash(t, m);
    const [cat] = await t.deps.db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, m.companyId));
    const bad = await t.post(`${m.c}/budgets`, { name: 'FY 26-27', yearFrom: '2026-05-01', lines: [{ account: 'sys:capital', months: months(1) }, { account: 'sys:sales', months: months(1) }, { account: 'sys:sales', months: months(2) }] }, { token: m.token });
    expect(bad.status).toBe(422);
    expect(bad.body.issues.map((i: { field: string }) => i.field).sort()).toEqual(['lines[0].account', 'lines[2].account', 'yearFrom']);
    const short = await t.post(`${m.c}/budgets`, { name: 'Short', yearFrom: '2026-04-01', lines: [{ account: 'sys:sales', months: [1, 2] }] }, { token: m.token });
    expect(short.status).toBe(422);

    const created = await t.post(`${m.c}/budgets`, { name: 'FY 26-27', yearFrom: '2026-04-01', lines: [{ account: 'sys:sales', months: months(1_000_000) }, { account: `exp:${cat.id}`, months: months(20_000) }] }, { token: m.token });
    expect(created.status).toBe(201);
    expect((await t.post(`${m.c}/budgets`, { name: 'FY 26-27', yearFrom: '2026-04-01', lines: [] }, { token: m.token })).status).toBe(422);

    const inv = await issueInvoice(t, m, { date: '2026-09-10' });
    const sale = inv.totals.grandTotal.minor;
    await t.post(`${m.c}/expenses`, { categoryId: cat.id, date: '2026-09-05', amount: inr(50_000), currency: 'INR', accountId: m.cash.id, method: 'cash' }, { token: m.token });

    const v = await t.get(`${m.c}/budgets/${created.body.id}/variance`, { token: m.token, query: { from: '2026-09-01', to: '2026-09-30' } });
    expect(v.status).toBe(200);
    const sales = v.body.rows.find((r: any) => r.account.key === 'sys:sales');
    expect(sales.budget).toBe(1_000_000);
    expect(sales.actual).toBeGreaterThan(0);
    expect(sales.actual).toBeLessThanOrEqual(sale);
    const spend = v.body.rows.find((r: any) => r.account.key === `exp:${cat.id}`);
    expect(spend).toMatchObject({ nature: 'expense', budget: 20_000, actual: 50_000, variance: 30_000, favourable: false });
    // To date, without a range: April to today, the 29th of September.
    const ytd = await t.get(`${m.c}/budgets/${created.body.id}/variance`, { token: m.token });
    expect(ytd.body).toMatchObject({ from: '2026-04-01', to: '2026-09-29' });
    expect(ytd.body.rows.find((r: any) => r.account.key === `exp:${cat.id}`).budget).toBe(5 * 20_000 + Math.round((20_000 * 29) / 30));

    const saved = await t.put(`${m.c}/budgets/${created.body.id}`, { ...created.body, name: 'FY 26-27 revised' }, { token: m.token, headers: { 'if-match': `"${created.body.version}"` } });
    expect(saved.status).toBe(200);
    expect((await t.get(`${m.c}/budgets`, { token: m.token })).body.data.map((b: any) => b.name)).toEqual(['FY 26-27 revised']);
    expect((await t.del(`${m.c}/budgets/${created.body.id}`, { token: m.token, headers: { 'if-match': `"${saved.body.version}"` } })).status).toBe(204);
  });
});
