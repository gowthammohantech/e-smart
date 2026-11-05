import { describe, expect, it } from 'vitest';
import { MUMBAI, setupApi } from './helpers';
import { issueInvoice, moneySetup } from './money-fixtures';

const t = setupApi();
const inr = (minor: number) => ({ minor, currency: 'INR' });
const party = (over: Record<string, unknown>) => ({ kind: 'customer', currency: 'INR', openingBalance: inr(0), paymentTermsDays: 30, billingAddress: MUMBAI, ...over });

describe('books: comparative statements and the integrity check', () => {
  it('breaks the P&L into months and sets the balance sheet beside last year', async () => {
    const m = await moneySetup(t);
    await issueInvoice(t, m, { date: '2026-08-10' });
    await issueInvoice(t, m, { date: '2026-09-20' });
    const q = { from: '2026-04-01', to: '2026-09-30' };
    const months = await t.get(`${m.c}/books/profit-loss`, { token: m.token, query: { ...q, breakdown: 'month' } });
    expect(months.status).toBe(200);
    expect(months.body.periods.map((p: { label: string }) => p.label)).toEqual(['Apr 26', 'May 26', 'Jun 26', 'Jul 26', 'Aug 26', 'Sep 26']);
    const whole = await t.get(`${m.c}/books/profit-loss`, { token: m.token, query: q });
    expect(months.body.netProfit.reduce((a: number, b: number) => a + b, 0)).toBe(whole.body.netProfit);
    const sales = months.body.tradingIncome.find((r: { key: string }) => r.key === 'sys:sales');
    expect(sales.values[4]).toBeGreaterThan(0);
    expect(sales.values[3]).toBe(0);

    const bs = await t.get(`${m.c}/books/balance-sheet`, { token: m.token, query: { ...q, compare: 'previousYear' } });
    expect(bs.body.dates).toEqual(['2025-09-30', '2026-09-30']);
    bs.body.totalAssets.forEach((a: number, i: number) => expect(a).toBe(bs.body.totalLiabilities[i]));
  });

  it('finds the books in agreement with their records', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m, { date: '2026-09-20' });
    await t.post(`${m.c}/payments`, { direction: 'received', partyId: m.mumbai.id, date: '2026-09-25', amount: inr(50_000), currency: 'INR', method: 'cash', accountId: m.cash.id, allocations: [{ documentId: inv.id, amount: inr(50_000) }] }, { token: m.token });
    const res = await t.get(`${m.c}/books/integrity`, { token: m.token, query: { to: '2026-09-30' } });
    expect(res.status).toBe(200);
    const failed = res.body.checks.filter((c: { ok: boolean }) => !c.ok);
    expect(failed).toEqual([]);
    expect(res.body.checks.map((c: { key: string }) => c.key)).toContain('partyLedgers');
  });
});

describe('contacts import', () => {
  it('previews, then creates the good rows and skips duplicates and bad ones', async () => {
    const m = await moneySetup(t);
    const rows = [
      party({ name: 'Murugan Traders', taxId: '27AABCT5512M1Z6', billingAddress: { ...MUMBAI, stateCode: '27' } }),
      party({ name: 'sunrise retail' }), // already there, in another case
      party({ name: 'Bad GST', taxId: '27AAACM1234A1Z0' }),
      party({ kind: 'supplier', name: 'Konkan Paper' }),
      party({ name: 'Murugan Traders' }), // a repeat within the sheet
      party({ kind: 'general', name: 'Landlord' }),
    ];
    const preview = await t.post(`${m.c}/parties/import`, { rows, dryRun: true }, { token: m.token });
    expect(preview.status).toBe(200);
    expect(preview.body.results.map((r: { status: string }) => r.status)).toEqual(['created', 'duplicate', 'invalid', 'created', 'duplicate', 'created']);
    expect(preview.body.results[2].issues[0].field).toBe('taxId');
    const before = await t.get(`${m.c}/parties`, { token: m.token, query: { q: 'Konkan Paper' } });
    expect(before.body.data).toEqual([]);

    const done = await t.post(`${m.c}/parties/import`, { rows }, { token: m.token });
    expect(done.body).toMatchObject({ created: 3, skipped: 2, invalid: 1 });
    const created = await Promise.all(done.body.results.filter((r: { id?: string }) => r.id).map(async (r: { id: string }) => (await t.get(`${m.c}/parties/${r.id}`, { token: m.token })).body));
    expect(created.map((p: { name: string; code: string }) => [p.name, p.code])).toEqual([
      ['Murugan Traders', 'C-003'],
      ['Konkan Paper', 'S-002'],
      ['Landlord', 'G-001'],
    ]);
  });
});
