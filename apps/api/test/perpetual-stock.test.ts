import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { line, moneySetup } from './money-fixtures';

const t = setupApi();

describe('perpetual stock', () => {
  it('posts the goods sold to cost of goods sold, and the profit report agrees with the books', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.companies).set({ perpetualStockFrom: '2026-04-01' }).where(eq(schema.companies.id, m.companyId));
    const itemId = await m.item();
    const bill = await t.post(`${m.c}/documents`, { kind: 'purchaseBill', partyId: m.supplier!.id, date: '2026-09-01', currency: 'INR', supplierDocNumber: 'KS/1', lines: [line(m.gst(18), { itemId, quantity: 10, unitPrice: { minor: 60000, currency: 'INR' } })], status: 'issued' }, { token: m.token });
    expect(bill.status).toBe(201);
    const sale = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.mumbai.id, date: '2026-09-29', currency: 'INR', lines: [line(m.gst(18), { itemId, quantity: 4 })], status: 'issued' }, { token: m.token });
    expect(sale.status).toBe(201);

    const range = { from: '2026-04-01', to: '2026-09-30' };
    const pl = await t.get(`${m.c}/books/profit-loss`, { token: m.token, query: range });
    expect(pl.status).toBe(200);
    const expense = pl.body.trading.expense as { account: { key: string }; amount: number }[];
    // 4 sold at the ₹600 they came in at; Purchases keep none of the goods.
    expect(expense.find((l) => l.account.key === 'sys:cogs')?.amount).toBe(240000);
    expect(expense.find((l) => l.account.key === 'sys:purchases')).toBeUndefined();
    expect(pl.body.trading.closingStock).toBe(0);
    expect(pl.body.grossProfit).toBe(400000 - 240000);

    const bs = await t.get(`${m.c}/books/balance-sheet`, { token: m.token, query: range });
    expect(bs.body.totalAssets).toBe(bs.body.totalLiabilities);

    const report = await t.get(`${m.c}/reports/profit`, { token: m.token, query: range });
    expect(report.body.costOfGoods.minor).toBe(240000);
  });

  it('starts a new business perpetual, from its first financial year', async () => {
    const m = await moneySetup(t);
    const company = (await t.get(m.c, { token: m.token })).body;
    expect(company.perpetualStockFrom).toMatch(/^\d{4}-04-01$/);
  });

  it('changes only from the start of an open financial year, by an owner', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.companies).set({ perpetualStockFrom: null }).where(eq(schema.companies.id, m.companyId));
    let company = (await t.get(m.c, { token: m.token })).body;

    const midYear = await t.put(m.c, { ...company, perpetualStockFrom: '2026-05-01' }, { token: m.token });
    expect(midYear.status).toBe(422);
    expect(midYear.body.code).toBe('PERPETUAL_NOT_YEAR_START');

    const on = await t.put(m.c, { ...company, perpetualStockFrom: '2026-04-01' }, { token: m.token });
    expect(on.status).toBe(200);
    expect(on.body.perpetualStockFrom).toBe('2026-04-01');

    // Once a year it covers is closed, it stays as it is.
    await t.deps.db.update(schema.companies).set({ lockedThroughDate: '2026-06-30' }).where(eq(schema.companies.id, m.companyId));
    company = (await t.get(m.c, { token: m.token })).body;
    const back = await t.put(m.c, { ...company, perpetualStockFrom: null }, { token: m.token });
    expect(back.status).toBe(409);
    expect(back.body.code).toBe('PERIOD_LOCKED');
    const later = await t.put(m.c, { ...company, perpetualStockFrom: '2027-04-01' }, { token: m.token });
    expect(later.status).toBe(409);
  });

  it('costs goods sold first in, first out when the business keeps stock that way', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.companies).set({ perpetualStockFrom: '2026-04-01' }).where(eq(schema.companies.id, m.companyId));
    let company = (await t.get(m.c, { token: m.token })).body;
    expect(company.stockCosting).toBe('average');
    const fifo = await t.put(m.c, { ...company, stockCosting: 'fifo' }, { token: m.token });
    expect(fifo.status).toBe(200);
    expect(fifo.body.stockCosting).toBe('fifo');
    const itemId = await m.item();
    const buy = (date: string, n: string, price: number) =>
      t.post(`${m.c}/documents`, { kind: 'purchaseBill', partyId: m.supplier!.id, date, currency: 'INR', supplierDocNumber: n, lines: [line(m.gst(18), { itemId, quantity: 10, unitPrice: { minor: price, currency: 'INR' } })], status: 'issued' }, { token: m.token });
    expect((await buy('2026-09-01', 'KS/1', 60000)).status).toBe(201);
    expect((await buy('2026-09-10', 'KS/2', 90000)).status).toBe(201);
    const sale = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.mumbai.id, date: '2026-09-29', currency: 'INR', lines: [line(m.gst(18), { itemId, quantity: 15 })], status: 'issued' }, { token: m.token });
    expect(sale.status).toBe(201);
    const range = { from: '2026-04-01', to: '2026-09-30' };
    const pl = await t.get(`${m.c}/books/profit-loss`, { token: m.token, query: range });
    // 10 at ₹600 and 5 at ₹900; the average would have been ₹750 each.
    expect(pl.body.trading.expense.find((l: { account: { key: string } }) => l.account.key === 'sys:cogs')?.amount).toBe(1_050_000);
    const stock = await t.get(`${m.c}/reports/stock`, { token: m.token, query: range });
    expect(stock.body.totalValue.minor).toBe(450_000);
    const integrity = await t.get(`${m.c}/books/integrity`, { token: m.token, query: { to: '2026-09-30' } });
    expect(integrity.body.checks.find((c: { key: string }) => c.key === 'stock')).toMatchObject({ ok: true, expected: 450_000 });

    // It values every period, so it stays as it is once one is closed.
    await t.deps.db.update(schema.companies).set({ lockedThroughDate: '2026-06-30' }).where(eq(schema.companies.id, m.companyId));
    company = (await t.get(m.c, { token: m.token })).body;
    const back = await t.put(m.c, { ...company, stockCosting: 'average' }, { token: m.token });
    expect(back.status).toBe(409);
    expect(back.body.code).toBe('PERIOD_LOCKED');
  });
});
