import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { issueInvoice, line, moneySetup, type Money } from './money-fixtures';
import { joinTeam } from './team-helpers';

/** Foreign currency, credits and branches (money audit, phase 5). */
const t = setupApi();
beforeEach(() => t.setNow('2026-09-29T10:00:00Z'));

const inr = (minor: number) => ({ minor, currency: 'INR' });
const usd = (minor: number) => ({ minor, currency: 'USD' });
const tb = async (m: Money, account: string) => {
  const res = await t.get(`${m.c}/reports/trial-balance`, { token: m.token, query: { from: '2026-04-01', to: '2027-03-31' } });
  return res.body.rows.find((r: { account: string }) => r.account === account)?.closing?.minor ?? 0;
};

describe('credit left after a note', () => {
  it('lets a credit note against a paid invoice be set against the next one', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const total = inv.totals.grandTotal.minor;
    expect((await t.post(`${m.c}/payments`, { direction: 'received', partyId: m.mumbai.id, date: '2026-09-29', amount: inr(total), currency: 'INR', method: 'cash', accountId: m.cash.id, allocations: [{ documentId: inv.id, amount: inr(total) }] }, { token: m.token })).status).toBe(201);
    // ₹500 + GST off, after it was paid in full: the customer now holds ₹590 of credit.
    const note = await t.post(
      `${m.c}/documents`,
      { kind: 'creditNote', partyId: m.mumbai.id, sourceDocumentId: inv.id, date: '2026-09-29', currency: 'INR', noteReason: 'discount', status: 'issued', lines: [line(m.gst(18), { name: 'Steel rod', quantity: 1, unitPrice: inr(50_000) })] },
      { token: m.token },
    );
    expect(note.status).toBe(201);
    const next = await issueInvoice(t, m);
    const list = await t.get(`${m.c}/payments/adjust`, { token: m.token, query: { partyId: m.mumbai.id } });
    const credit = list.body.credits.find((c: { id: string }) => c.id === note.body.id);
    expect(credit).toBeTruthy();
    const done = await t.post(`${m.c}/payments/adjust`, { partyId: m.mumbai.id }, { token: m.token });
    expect(done.status).toBe(200);
    const after = await t.get(`${m.c}/documents/${next.id}`, { token: m.token });
    expect(after.body.amountPaid?.minor ?? after.body.totals.grandTotal.minor - (after.body.balanceDue?.minor ?? 0)).toBeGreaterThan(0);
  });
});

describe('foreign currency', () => {
  async function usdCustomer(m: Money) {
    await t.post(`${m.c}/exchange-rates`, { from: 'USD', to: 'INR', rate: 80, effectiveFrom: '2026-09-01' }, { token: m.token });
    const p = await t.post(`${m.c}/parties`, { kind: 'customer', name: 'Acme Inc', currency: 'USD', gstRegistrationType: 'overseas', billingAddress: { line1: '1 Main St', city: 'Austin', state: 'Texas', country: 'US', postalCode: '73301' }, openingBalance: usd(0), paymentTermsDays: 30 }, { token: m.token });
    expect(p.status, p.raw).toBe(201);
    return p.body.id as string;
  }

  it('works the exchange difference on all a receipt settles, discount included', async () => {
    const m = await moneySetup(t);
    const acme = await usdCustomer(m);
    // $100 at 80 = ₹8,000.
    const inv = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: acme, date: '2026-09-10', currency: 'USD', exchangeRate: 80, lines: [line(m.gst(0), { quantity: 1, unitPrice: usd(10_000) })], status: 'issued' }, { token: m.token });
    expect(inv.status, inv.raw).toBe(201);
    // $90 cash and $10 discount at 85.
    const rec = await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: acme, date: '2026-09-29', amount: usd(9_000), currency: 'USD', exchangeRate: 85, method: 'cash', accountId: m.cash.id, allocations: [{ documentId: inv.body.id, amount: usd(9_000), discount: usd(1_000) }] },
      { token: m.token },
    );
    expect(rec.status, rec.raw).toBe(201);
    // The customer is cleared exactly: ₹8,000 in, ₹8,000 out.
    expect(await tb(m, `party:${acme}`)).toBe(0);
  });
});

describe('branches', () => {
  it('keeps a user kept to one branch from settling another branch’s invoice', async () => {
    const m = await moneySetup(t);
    const other = await t.post(`${m.c}/branches`, { name: 'Pune', code: 'PUN', address: { line1: 'FC Road', city: 'Pune', state: 'Maharashtra', stateCode: '27', postalCode: '411004', country: 'IN' } }, { token: m.token });
    expect(other.status, other.raw).toBe(201);
    const inv = await issueInvoice(t, m, { branchId: other.body.id });
    const [primary] = await t.deps.db.select().from(schema.branches).where(eq(schema.branches.isPrimary, true));
    void primary;
    const clerk = await joinTeam(t, m.token, { role: 'accountant', companyIds: [m.companyId], branchIds: [m.branch.id] });
    const res = await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.mumbai.id, date: '2026-09-29', amount: inr(1_000), currency: 'INR', method: 'cash', accountId: m.cash.id, allocations: [{ documentId: inv.id, amount: inr(1_000) }] },
      { token: clerk.token },
    );
    expect(res.status).toBe(422);
  });
});
