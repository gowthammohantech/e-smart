import { describe, expect, it } from 'vitest';
import { BENGALURU, MUMBAI, setupApi } from './helpers';
import { joinTeam } from './team-helpers';
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

describe('books and branches', () => {
  it('opens the books to someone listed against every branch, not to someone limited to some', async () => {
    const m = await moneySetup(t);
    const blr = await t.post(`${m.c}/branches`, { name: 'Bengaluru', code: 'blr', address: BENGALURU }, { token: m.token });
    expect(blr.status).toBe(201);
    const one = await joinTeam(t, m.token, { role: 'accountant', companyIds: [m.companyId], branchIds: [m.branch.id] });
    const all = await joinTeam(t, m.token, { role: 'accountant', companyIds: [m.companyId], branchIds: [m.branch.id, blr.body.id] });
    const view = (token: string) => t.get(`${m.c}/books/trial-balance`, { token, query: { from: '2026-04-01', to: '2027-03-31' } });
    expect((await view(one.token)).body.code).toBe('BOOKS_ALL_BRANCHES');
    expect((await view(all.token)).status).toBe(200);
  });

  it('opens TDS payable to someone listed against every branch', async () => {
    const m = await moneySetup(t);
    const blr = await t.post(`${m.c}/branches`, { name: 'Bengaluru', code: 'blr', address: BENGALURU }, { token: m.token });
    const one = await joinTeam(t, m.token, { role: 'accountant', companyIds: [m.companyId], branchIds: [m.branch.id] });
    const all = await joinTeam(t, m.token, { role: 'accountant', companyIds: [m.companyId], branchIds: [m.branch.id, blr.body.id] });
    const tds = (token: string) => t.get(`${m.c}/report-data/tds-payable`, { token, query: { from: '2026-04-01', to: '2027-03-31' } });
    expect((await tds(one.token)).body.code).toBe('BOOKS_ALL_BRANCHES');
    expect((await tds(all.token)).status).toBe(200);
  });
});

describe('contacts import with custom fields', () => {
  it('stores the company contact fields and refuses a row whose value does not fit', async () => {
    const m = await moneySetup(t);
    const zone = await t.post(`${m.c}/custom-fields`, { entity: 'party', label: 'Zone', kind: 'select', options: ['North', 'South'] }, { token: m.token });
    const rows = [party({ name: 'Zone North Traders', customFields: { [zone.body.id]: 'North' } }), party({ name: 'Zone East Traders', customFields: { [zone.body.id]: 'East' } })];
    const done = await t.post(`${m.c}/parties/import`, { rows }, { token: m.token });
    expect(done.body.results.map((r: { status: string }) => r.status)).toEqual(['created', 'invalid']);
    expect(done.body.results[1].issues[0].field).toBe(`customFields.${zone.body.id}`);
    const created = await t.get(`${m.c}/parties/${done.body.results[0].id}`, { token: m.token });
    expect(created.body.customFields).toEqual({ [zone.body.id]: 'North' });
  });
});
