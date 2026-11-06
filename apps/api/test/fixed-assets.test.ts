import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { moneySetup, type Money } from './money-fixtures';

const t = setupApi();
beforeEach(() => t.setNow('2026-09-29T10:00:00Z'));

const inr = (minor: number) => ({ minor, currency: 'INR' });

/** ₹1,20,000 of machinery bought on 1 Apr 2026 with capital brought in. */
async function buyMachine(m: Money) {
  const jv = await t.post(
    `${m.c}/vouchers`,
    { kind: 'journal', date: '2026-04-01', lines: [{ account: 'sys:fixedAssets', debit: inr(12_000_000), credit: inr(0) }, { account: 'sys:capital', debit: inr(0), credit: inr(12_000_000) }] },
    { token: m.token },
  );
  expect(jv.status).toBe(201);
}

const lathe = { name: 'CNC lathe', category: 'Plant and machinery', account: 'sys:fixedAssets', assetCode: 'PM-001', acquiredOn: '2026-04-01', inUseFrom: '2026-04-01', cost: inr(12_000_000), method: 'slm', lifeMonths: 60 };
const line = (rows: { account: string }[], key: string) => rows.find((r: any) => r.account?.key === key || r.account === key) as any;

describe('fixed assets', () => {
  it('registers an asset and posts its depreciation month by month into the books', async () => {
    const m = await moneySetup(t);
    await buyMachine(m);
    const created = await t.post(`${m.c}/fixed-assets`, lathe, { token: m.token });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'active', residualValue: inr(0), openingDepreciation: inr(0) });
    // April to September 2026: 183 of the 1,826 days of its life.
    const sixMonths = Math.round((12_000_000 * 183) / 1826);
    expect(created.body.accumulatedDepreciation).toEqual(inr(Math.round((12_000_000 * 182) / 1826)));
    expect(created.body.years[0]).toMatchObject({ label: expect.stringContaining('26'), opening: inr(12_000_000), depreciation: inr(Math.round((12_000_000 * 365) / 1826)) });
    expect(created.body.years.at(-1).closing).toEqual(inr(0));

    const pl = await t.get(`${m.c}/books/profit-loss`, { token: m.token, query: { from: '2026-04-01', to: '2026-09-30' } });
    expect(pl.status).toBe(200);
    expect(line(pl.body.indirect.expense, 'sys:depreciation').amount).toBe(sixMonths);
    const bs = await t.get(`${m.c}/books/balance-sheet`, { token: m.token, query: { to: '2026-09-30' } });
    expect(bs.body.totalAssets).toBe(bs.body.totalLiabilities);
    expect(line(bs.body.assets.flatMap((s: any) => s.lines), 'sys:accumulatedDepreciation').amount).toBe(-sixMonths);

    const list = await t.get(`${m.c}/fixed-assets`, { token: m.token, query: { asOf: '2026-09-30' } });
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].bookValue).toEqual(inr(12_000_000 - sixMonths));

    const sched = await t.get(`${m.c}/fixed-assets/schedule`, { token: m.token, query: { from: '2026-04-01', to: '2026-09-30' } });
    expect(sched.status).toBe(200);
    expect(sched.body.totals).toMatchObject({ openingCost: 0, additions: 12_000_000, depreciation: sixMonths, closingValue: 12_000_000 - sixMonths });
  });

  it('refuses what doesn’t add up, an account that isn’t a fixed asset, and a code used twice', async () => {
    const m = await moneySetup(t);
    const bad = await t.post(`${m.c}/fixed-assets`, { ...lathe, method: 'wdv', residualValue: inr(13_000_000), inUseFrom: '2026-03-01', account: 'sys:capital' }, { token: m.token });
    expect(bad.status).toBe(422);
    expect(bad.body.issues.map((i: { field: string }) => i.field).sort()).toEqual(['account', 'inUseFrom', 'rate', 'residualValue']);
    const opening = await t.post(`${m.c}/fixed-assets`, { ...lathe, openingDepreciation: inr(100) }, { token: m.token });
    expect(opening.status).toBe(422);
    expect(opening.body.issues[0].field).toBe('openingAsOf');
    const own = await t.post(`${m.c}/ledger-accounts`, { name: 'Computers', group: 'fixedAssets', openingBalance: inr(0) }, { token: m.token });
    expect((await t.post(`${m.c}/fixed-assets`, { ...lathe, account: `acc:${own.body.id}` }, { token: m.token })).status).toBe(201);
    const twice = await t.post(`${m.c}/fixed-assets`, lathe, { token: m.token });
    expect(twice.status).toBe(422);
    expect(twice.body.issues[0].field).toBe('assetCode');
  });

  it('disposes of an asset, taking it out of the books, and keeps closed periods as they were', async () => {
    const m = await moneySetup(t);
    await buyMachine(m);
    const created = await t.post(`${m.c}/fixed-assets`, lathe, { token: m.token });
    const sold = await t.put(`${m.c}/fixed-assets/${created.body.id}`, { ...created.body, disposedOn: '2026-09-15', disposalNote: 'Sold to Konkan Steel' }, { token: m.token, headers: { 'if-match': `"${created.body.version}"` } });
    expect(sold.status).toBe(200);
    expect(sold.body.status).toBe('disposed');
    expect(sold.body.bookValue).toEqual(inr(0));
    const bs = await t.get(`${m.c}/books/balance-sheet`, { token: m.token, query: { to: '2026-09-30' } });
    const lines = bs.body.assets.flatMap((s: any) => s.lines);
    expect(line(lines, 'sys:fixedAssets')?.amount ?? 0).toBe(0);
    expect(line(lines, 'sys:accumulatedDepreciation')?.amount ?? 0).toBe(0);
    expect(bs.body.totalAssets).toBe(bs.body.totalLiabilities);
    const pl = await t.get(`${m.c}/books/profit-loss`, { token: m.token, query: { from: '2026-04-01', to: '2026-09-30' } });
    const written = Math.round((12_000_000 * 168) / 1826);
    expect(line(pl.body.indirect.expense, 'sys:depreciation').amount).toBe(written);
    expect(line(pl.body.indirect.income, 'sys:assetDisposal').amount).toBe(-(12_000_000 - written));
    expect((await t.put(`${m.c}/fixed-assets/${created.body.id}`, { ...sold.body, disposedOn: '2026-10-15' }, { token: m.token, headers: { 'if-match': `"${sold.body.version}"` } })).status).toBe(422);

    // Closed through August: the disposal in September can still change, April's depreciation can't.
    await t.deps.db.update(schema.companies).set({ lockedThroughDate: '2026-08-31' }).where(eq(schema.companies.id, m.companyId));
    const later = await t.put(`${m.c}/fixed-assets/${created.body.id}`, { ...sold.body, disposedOn: '2026-09-20' }, { token: m.token, headers: { 'if-match': `"${sold.body.version}"` } });
    expect(later.status).toBe(200);
    const longer = await t.put(`${m.c}/fixed-assets/${created.body.id}`, { ...later.body, lifeMonths: 120 }, { token: m.token, headers: { 'if-match': `"${later.body.version}"` } });
    expect(longer.status).toBe(409);
    expect(longer.body.code).toBe('PERIOD_LOCKED');
    expect((await t.del(`${m.c}/fixed-assets/${created.body.id}`, { token: m.token, headers: { 'if-match': `"${later.body.version}"` } })).status).toBe(409);
  });

  it('carries on from depreciation written off before the books began', async () => {
    const m = await moneySetup(t);
    const older = await t.post(`${m.c}/fixed-assets`, { ...lathe, acquiredOn: '2024-04-01', inUseFrom: '2024-04-01', openingDepreciation: inr(4_800_000), openingAsOf: '2026-03-31' }, { token: m.token });
    expect(older.status).toBe(201);
    expect(older.body.years[0]).toMatchObject({ from: '2026-04-01', opening: inr(7_200_000) });
    const tb = await t.get(`${m.c}/books/trial-balance`, { token: m.token, query: { from: '2026-04-01', to: '2026-09-30' } });
    const acc = tb.body.rows.find((r: { account: { key: string } }) => r.account.key === 'sys:accumulatedDepreciation');
    // ₹72,000 left over the 1,096 days to 31 Mar 2029: 183 of them by September.
    expect(acc).toMatchObject({ opening: -4_800_000, credit: Math.round((7_200_000 * 183) / 1096) });
    const removed = await t.del(`${m.c}/fixed-assets/${older.body.id}`, { token: m.token, headers: { 'if-match': `"${older.body.version}"` } });
    expect(removed.status).toBe(204);
  });
});
