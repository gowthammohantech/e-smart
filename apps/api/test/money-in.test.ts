import { beforeEach, describe, expect, it } from 'vitest';
import { setupApi } from './helpers';
import { moneySetup, type Money } from './money-fixtures';

const t = setupApi();
beforeEach(() => t.setNow('2026-09-29T10:00:00Z'));

const inr = (minor: number) => ({ minor, currency: 'INR' });

const received = (m: Money, date: string, minor: number) =>
  t.post(`${m.c}/payments`, { direction: 'received', partyId: m.mumbai.id, date, amount: inr(minor), currency: 'INR', method: 'cash', accountId: m.cash.id }, { token: m.token });
const receipt = (m: Money, date: string, minor: number) =>
  t.post(`${m.c}/vouchers`, { kind: 'receipt', date, narration: 'Interest', lines: [{ account: `pay:${m.cash.id}`, debit: inr(minor), credit: inr(0) }, { account: 'sys:capital', debit: inr(0), credit: inr(minor) }] }, { token: m.token });

describe('money in: payments received and receipt vouchers in one list', () => {
  it('merges both by date, newest first, and pages them by one cursor', async () => {
    const m = await moneySetup(t);
    expect((await received(m, '2026-09-20', 100_000)).status).toBe(201);
    expect((await receipt(m, '2026-09-22', 50_000)).status).toBe(201);
    expect((await received(m, '2026-09-25', 30_000)).status).toBe(201);
    // Money paid out is not money in.
    expect((await t.post(`${m.c}/payments`, { direction: 'paid', partyId: m.supplier!.id, date: '2026-09-26', amount: inr(10_000), currency: 'INR', method: 'cash', accountId: m.cash.id }, { token: m.token })).status).toBe(201);

    const all = await t.get(`${m.c}/money-in`, { token: m.token });
    expect(all.status).toBe(200);
    expect(all.body.data.map((e: { type: string }) => e.type)).toEqual(['payment', 'receipt', 'payment']);
    expect(all.body.data[0].payment).toMatchObject({ direction: 'received', date: '2026-09-25', amount: inr(30_000) });
    expect(all.body.data[1].voucher).toMatchObject({ kind: 'receipt', date: '2026-09-22' });
    expect(all.body.nextCursor).toBeNull();

    // A page at a time, nothing skipped or repeated.
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      const page = await t.get(`${m.c}/money-in`, { token: m.token, query: { limit: 1, ...(cursor && { cursor }) } });
      expect(page.status).toBe(200);
      seen.push(...page.body.data.map((e: { payment?: { date: string }; voucher?: { date: string } }) => (e.payment ?? e.voucher)!.date));
      cursor = page.body.nextCursor ?? undefined;
      if (!cursor) break;
    }
    expect(seen).toEqual(['2026-09-25', '2026-09-22', '2026-09-20']);

    const onlyPayments = await t.get(`${m.c}/money-in`, { token: m.token, query: { type: 'payment' } });
    expect(onlyPayments.body.data).toHaveLength(2);

    const summary = await t.get(`${m.c}/money-in/summary`, { token: m.token });
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      count: 3,
      total: inr(180_000),
      payments: { count: 2, total: inr(130_000) },
      receipts: { count: 1, total: inr(50_000) },
      byAccount: [{ account: 'sys:capital', total: inr(50_000) }],
    });
  });

  it('lists payments alone on a plan without the books', async () => {
    const m = await moneySetup(t, 'free');
    expect((await received(m, '2026-09-20', 100_000)).status).toBe(201);
    const list = await t.get(`${m.c}/money-in`, { token: m.token });
    expect(list.status).toBe(200);
    expect(list.body.data.map((e: { type: string }) => e.type)).toEqual(['payment']);
    const summary = await t.get(`${m.c}/money-in/summary`, { token: m.token });
    expect(summary.body).toMatchObject({ count: 1, receipts: { count: 0 }, byAccount: [] });
  });
});
