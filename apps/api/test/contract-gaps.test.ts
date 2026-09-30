import { describe, expect, it } from 'vitest';
import { MUMBAI, setupApi } from './helpers';
import { invoiceBody, line, moneySetup } from './money-fixtures';

const t = setupApi();

const US = { line1: '1 Market St', city: 'San Francisco', state: 'California', postalCode: '94105', country: 'US' };

describe('fields the app has that the contract gained', () => {
  it('uses a manual round-off instead of the automatic one', async () => {
    const m = await moneySetup(t);
    // 2 × 1,000.50 + 18% = 2,361.18: automatic round-off would be −0.18.
    const body = invoiceBody(m, { lines: [line(m.gst(18), { unitPrice: { minor: 100050, currency: 'INR' } })], applyRoundOff: true });
    const auto = await t.post(`${m.c}/documents`, body, { token: m.token });
    expect(auto.body.totals.roundOff.minor).toBe(-18);
    expect(auto.body.totals.grandTotal.minor).toBe(236100);

    const manual = await t.post(`${m.c}/documents`, { ...body, roundOffManual: { minor: -118, currency: 'INR' } }, { token: m.token });
    expect(manual.body.totals.roundOff.minor).toBe(-118);
    expect(manual.body.totals.grandTotal.minor).toBe(236000);
    expect(manual.body.roundOffManual).toEqual({ minor: -118, currency: 'INR' });

    // Reading it back and editing something else keeps it.
    const patched = await t.patch(`${m.c}/documents/${manual.body.id}`, { ...body, roundOffManual: { minor: -118, currency: 'INR' }, notes: 'Thanks' }, { token: m.token });
    expect(patched.body.totals.grandTotal.minor).toBe(236000);
  });

  it('zero-rates an export under a valid LUT and charges IGST once it lapses', async () => {
    const m = await moneySetup(t);
    const company = (await t.get(m.c, { token: m.token })).body;
    const withLut = (validTill: string) => ({ ...company, taxRegistration: { ...company.taxRegistration, lutNumber: 'ad270924000123x', lutValidTill: validTill } });
    const saved = await t.put(m.c, withLut('2027-03-31'), { token: m.token });
    expect(saved.body.taxRegistration).toMatchObject({ lutNumber: 'AD270924000123X', lutValidTill: '2027-03-31' });

    const overseas = await t.post(
      `${m.c}/parties`,
      { kind: 'customer', name: 'Pacific Imports', currency: 'INR', gstRegistrationType: 'overseas', billingAddress: US, openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 30 },
      { token: m.token },
    );
    const exportBody = invoiceBody(m, { partyId: overseas.body.id, date: '2026-09-29' });
    const underLut = await t.post(`${m.c}/documents`, exportBody, { token: m.token });
    expect(underLut.body.totals.totalTax.minor).toBe(0);

    await t.put(m.c, { ...withLut('2026-03-31'), version: saved.body.version }, { token: m.token });
    const lapsed = await t.post(`${m.c}/documents`, exportBody, { token: m.token });
    expect(lapsed.body.totals.totalTax.minor).toBe(36000);
    expect(lapsed.body.totals.taxLines.flatMap((l: { components: { type: string }[] }) => l.components.map((c) => c.type))).toEqual(['IGST']);
  });

  it('keeps a branch GSTIN, checking its check digit and state', async () => {
    const m = await moneySetup(t);
    const ok = await t.post(`${m.c}/branches`, { name: 'Andheri', code: 'AND', address: MUMBAI, gstin: '27aapfu0939f1zv' }, { token: m.token });
    expect(ok.status).toBe(201);
    expect(ok.body.gstin).toBe('27AAPFU0939F1ZV');
    const list = await t.get(`${m.c}/branches`, { token: m.token });
    expect(list.body.data.find((b: { id: string }) => b.id === ok.body.id).gstin).toBe('27AAPFU0939F1ZV');

    const bad = await t.post(`${m.c}/branches`, { name: 'Thane', code: 'THN', address: MUMBAI, gstin: '27AAPFU0939F1ZX' }, { token: m.token });
    expect(bad.status).toBe(422);
    expect(bad.body.issues[0].field).toBe('gstin');
    const wrongState = await t.post(`${m.c}/branches`, { name: 'Pune', code: 'PUN', address: MUMBAI, gstin: '29AABCG4321K1ZM' }, { token: m.token });
    expect(wrongState.body.issues[0].field).toBe('address.stateCode');
  });
});
