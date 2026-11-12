import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { fundCash, issueInvoice, moneySetup, type Money } from './money-fixtures';

const t = setupApi();
beforeEach(() => t.setNow('2026-09-29T10:00:00Z'));

const inr = (minor: number) => ({ minor, currency: 'INR' });

/** The fixtures' 18% category cut to 12% from 1 Oct 2026. */
async function cutTo12(m: Money) {
  const id = m.gst(18);
  const [before] = await t.deps.db.select().from(schema.taxCategories).where(eq(schema.taxCategories.id, id));
  const res = await t.put(`${m.c}/tax-categories/${id}`, { name: before.name, rate: 12, type: 'GST', effectiveFrom: '2026-10-01' }, { token: m.token });
  expect(res.status).toBe(200);
  return { id, was: before.effectiveFrom, res };
}

async function expenseOn(m: Money, date: string) {
  const [cat] = await t.deps.db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, m.companyId));
  const res = await t.post(`${m.c}/expenses`, { categoryId: cat.id, date, amount: inr(10000), currency: 'INR', accountId: m.cash.id, method: 'cash', taxCategoryId: m.gst(18), taxInclusive: false }, { token: m.token });
  expect(res.status).toBe(201);
  return res.body as { taxAmount: { minor: number } };
}

describe('tax effective date: a rate changed from a date charges the old rate before it', () => {
  it('sends the earlier rates with the category, so the app charges as the server does', async () => {
    const m = await moneySetup(t);
    const { id, was, res } = await cutTo12(m);
    expect(res.body).toMatchObject({ rate: 12, effectiveFrom: '2026-10-01', history: [{ effectiveFrom: was, rate: 18 }] });
    const list = await t.get(`${m.c}/tax-categories`, { token: m.token });
    expect(list.body.data.find((c: { id: string }) => c.id === id)).toMatchObject({ rate: 12, history: [{ effectiveFrom: was, rate: 18 }] });
  });

  it('an invoice, an expense and an advance dated before it take 18%; dated on or after it, 12%', async () => {
    const m = await moneySetup(t);
    await fundCash(t, m);
    await cutTo12(m);

    const before = await issueInvoice(t, m, { date: '2026-09-29' });
    expect((before as unknown as { lines: { taxRate: number }[] }).lines[0].taxRate).toBe(18);
    // An expense's amount is what was paid, tax in it: 18/118 of ₹100, then 12/112.
    expect((await expenseOn(m, '2026-09-20')).taxAmount.minor).toBe(1525);
    const advance = await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.mumbai.id, date: '2026-09-25', amount: inr(1_180_000), currency: 'INR', method: 'cash', accountId: m.cash.id, advanceTax: { taxCategoryId: m.gst(18), placeOfSupplyStateCode: '27', hsn: '998311' } },
      { token: m.token },
    );
    expect(advance.status).toBe(201);
    expect(advance.body.advanceTax).toMatchObject({ rate: 18 });

    t.setNow('2026-10-05T10:00:00Z');
    const after = await issueInvoice(t, m, { date: '2026-10-05' });
    expect((after as unknown as { lines: { taxRate: number }[] }).lines[0].taxRate).toBe(12);
    expect((await expenseOn(m, '2026-10-05')).taxAmount.minor).toBe(1071);
  });
});

describe('tax effective date: a new tax can be charged only from the day it starts', () => {
  it('refuses it on an invoice, an expense or an advance dated before then, and takes it from that day', async () => {
    const m = await moneySetup(t);
    await fundCash(t, m);
    const created = await t.post(`${m.c}/tax-categories`, { name: 'GST 40%', rate: 40, type: 'GST', effectiveFrom: '2026-10-01' }, { token: m.token });
    expect(created.status).toBe(201);
    const tax = created.body.id as string;
    const line = { name: 'Aerated drink', quantity: 1, unit: 'NOS', unitPrice: inr(10000), taxCategoryId: tax };

    const early = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.mumbai.id, date: '2026-09-29', currency: 'INR', lines: [line] }, { token: m.token });
    expect(early.status).toBe(422);
    expect(early.body.issues).toEqual([expect.objectContaining({ field: 'lines[0].taxCategoryId', message: 'GST 40% applies from 2026-10-01; the document is dated 2026-09-29' })]);

    const [cat] = await t.deps.db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, m.companyId));
    const expense = await t.post(`${m.c}/expenses`, { categoryId: cat.id, date: '2026-09-20', amount: inr(10000), currency: 'INR', accountId: m.cash.id, method: 'cash', taxCategoryId: tax }, { token: m.token });
    expect(expense.status).toBe(422);
    expect(expense.body.issues[0]).toMatchObject({ field: 'taxCategoryId', message: 'GST 40% applies from 2026-10-01; the expense is dated 2026-09-20' });

    const advance = await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.mumbai.id, date: '2026-09-25', amount: inr(140_000), currency: 'INR', method: 'cash', accountId: m.cash.id, advanceTax: { taxCategoryId: tax, placeOfSupplyStateCode: '27', hsn: '998311' } },
      { token: m.token },
    );
    expect(advance.status).toBe(422);
    expect(advance.body.issues[0].field).toBe('advanceTax.taxCategoryId');

    t.setNow('2026-10-05T10:00:00Z');
    const onTime = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.mumbai.id, date: '2026-10-01', currency: 'INR', lines: [line] }, { token: m.token });
    expect(onTime.status).toBe(201);
    expect(onTime.body.lines[0].taxRate).toBe(40);
  });
});
