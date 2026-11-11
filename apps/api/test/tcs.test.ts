import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { invoiceBody, moneySetup } from './money-fixtures';

const t = setupApi();
/** TCS is asked only on invoices dated before 1 April 2025 (TCS_ENDS_ON). */
const BEFORE = '2025-03-15';

describe('TCS on sales (s.206C)', () => {
  it('collects TCS on a scrap sale, owes it under its section, and keeps it out of sales', async () => {
    const m = await moneySetup(t);
    // Anand Enterprises has a GSTIN, so a PAN: 1%.
    const inv = await t.post(`${m.c}/documents`, invoiceBody(m, { partyId: m.bengaluru.id, date: BEFORE, tcsSection: 'scrap', status: 'issued' }), { token: m.token });
    expect(inv.status).toBe(201);
    // 2 × ₹1,000 + 18% IGST = ₹2,360; 1% = ₹23.60, to the rupee ₹24.
    expect(inv.body.totals.tcs).toEqual({ minor: 2_400, currency: 'INR' });
    expect(inv.body.totals.grandTotal.minor).toBe(236_000 + 2_400);
    expect(inv.body.tcs).toEqual({ section: 'scrap', rate: 1 });
    const tb = (await t.get(`${m.c}/reports/trial-balance`, { token: m.token, query: { from: '2024-04-01', to: '2025-03-31' } })).body;
    const row = (a: string) => tb.rows.find((r: { account: string }) => r.account === a)?.closing.minor ?? 0;
    expect(row('sys:tcsPayable:scrap')).toBe(-2_400);
    expect(row('sys:sales')).toBe(-200_000);
    expect(tb.totalDebit).toEqual(tb.totalCredit);
  });

  it('takes the higher rate from a buyer with no PAN, and skips a motor vehicle sale under ₹10 lakh', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.parties).set({ pan: null, taxId: null }).where(eq(schema.parties.id, m.mumbai.id));
    const noPan = await t.post(`${m.c}/documents`, invoiceBody(m, { date: BEFORE, tcsSection: 'scrap', status: 'issued' }), { token: m.token });
    expect(noPan.body.tcs.rate).toBe(5);
    const car = await t.post(`${m.c}/documents`, invoiceBody(m, { date: BEFORE, tcsSection: 'motorVehicle', status: 'issued' }), { token: m.token });
    expect(car.body.totals.tcs).toBeUndefined();
    expect(car.body.tcs).toBeUndefined();
  });

  it("takes a new invoice's section from a customer with TCS, unless the invoice says none", async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.parties).set({ tcsApplicable: true, tcsSection: 'scrap' }).where(eq(schema.parties.id, m.bengaluru.id));
    const inv = await t.post(`${m.c}/documents`, invoiceBody(m, { partyId: m.bengaluru.id, date: BEFORE, status: 'issued' }), { token: m.token });
    expect(inv.status).toBe(201);
    expect(inv.body.tcs).toEqual({ section: 'scrap', rate: 1 });
    const none = await t.post(`${m.c}/documents`, invoiceBody(m, { partyId: m.bengaluru.id, date: BEFORE, tcsSection: 'none', status: 'issued' }), { token: m.token });
    expect(none.body.tcs).toBeUndefined();
    // A customer without TCS gets none.
    const plain = await t.post(`${m.c}/documents`, invoiceBody(m, { date: BEFORE, status: 'issued' }), { token: m.token });
    expect(plain.body.tcs).toBeUndefined();
  });

  it('collects none on an invoice dated 1 April 2025 or later, whatever the section or the customer has', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.parties).set({ tcsApplicable: true, tcsSection: 'scrap' }).where(eq(schema.parties.id, m.bengaluru.id));
    for (const date of ['2025-04-01', '2026-09-15']) {
      const sent = await t.post(`${m.c}/documents`, invoiceBody(m, { partyId: m.bengaluru.id, date, tcsSection: 'scrap', status: 'issued' }), { token: m.token });
      expect(sent.status).toBe(201);
      expect(sent.body.tcs).toBeUndefined();
      expect(sent.body.totals.tcs).toBeUndefined();
      const fromParty = await t.post(`${m.c}/documents`, invoiceBody(m, { partyId: m.bengaluru.id, date, status: 'issued' }), { token: m.token });
      expect(fromParty.body.tcs).toBeUndefined();
    }
  });
});
