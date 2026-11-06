import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { invoiceBody, moneySetup } from './money-fixtures';

const t = setupApi();

describe('TCS on sales (s.206C)', () => {
  it('collects TCS on a scrap sale, owes it under its section, and keeps it out of sales', async () => {
    const m = await moneySetup(t);
    // Anand Enterprises has a GSTIN, so a PAN: 1%.
    const inv = await t.post(`${m.c}/documents`, invoiceBody(m, { partyId: m.bengaluru.id, tcsSection: 'scrap', status: 'issued' }), { token: m.token });
    expect(inv.status).toBe(201);
    // 2 × ₹1,000 + 18% IGST = ₹2,360; 1% = ₹23.60, to the rupee ₹24.
    expect(inv.body.totals.tcs).toEqual({ minor: 2_400, currency: 'INR' });
    expect(inv.body.totals.grandTotal.minor).toBe(236_000 + 2_400);
    expect(inv.body.tcs).toEqual({ section: 'scrap', rate: 1 });
    const tb = (await t.get(`${m.c}/reports/trial-balance`, { token: m.token, query: { from: '2026-04-01', to: '2027-03-31' } })).body;
    const row = (a: string) => tb.rows.find((r: { account: string }) => r.account === a)?.closing.minor ?? 0;
    expect(row('sys:tcsPayable:scrap')).toBe(-2_400);
    expect(row('sys:sales')).toBe(-200_000);
    expect(tb.totalDebit).toEqual(tb.totalCredit);
  });

  it('takes the higher rate from a buyer with no PAN, and skips a motor vehicle sale under ₹10 lakh', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.parties).set({ pan: null, taxId: null }).where(eq(schema.parties.id, m.mumbai.id));
    const noPan = await t.post(`${m.c}/documents`, invoiceBody(m, { tcsSection: 'scrap', status: 'issued' }), { token: m.token });
    expect(noPan.body.tcs.rate).toBe(5);
    const car = await t.post(`${m.c}/documents`, invoiceBody(m, { tcsSection: 'motorVehicle', status: 'issued' }), { token: m.token });
    expect(car.body.totals.tcs).toBeUndefined();
    expect(car.body.tcs).toBeUndefined();
  });
});
