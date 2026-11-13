import { describe, expect, it } from 'vitest';
import { gstinChecksum } from '@esmart/core/domain/gstin';
import { setupApi } from './helpers';
import { invoiceBody, line, moneySetup, type Money } from './money-fixtures';

const t = setupApi();

type Doc = { id: string; crossBorderTax?: string; totals: { totalTax: { minor: number }; taxLines: { components: { type: string }[] }[] } };

const BENGALURU = { line1: '1 SEZ Road', city: 'Bengaluru', state: 'Karnataka', stateCode: '29', postalCode: '560100', country: 'IN' };
const gstin = (pan: string) => `29${pan}1Z${gstinChecksum(`29${pan}1Z`)}`;

async function sezParty(m: Money, kind: 'customer' | 'supplier', pan: string) {
  const res = await t.post(
    `${m.c}/parties`,
    { kind, name: `SEZ ${kind}`, currency: 'INR', openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 30, gstRegistrationType: 'sez', taxId: gstin(pan), billingAddress: BENGALURU },
    { token: m.token },
  );
  expect(res.status, res.raw).toBe(201);
  return res.body.id as string;
}

async function post(m: Money, body: Record<string, unknown>): Promise<Doc> {
  const res = await t.post(`${m.c}/documents`, body, { token: m.token });
  expect(res.status, res.raw).toBe(201);
  return res.body as Doc;
}

const tax = (d: Doc) => d.totals.totalTax.minor;

describe('SEZ supplies: with tax or without, as chosen', () => {
  it('an invoice to an SEZ unit charges IGST with tax and none without; unchosen, without an LUT, it charges IGST', async () => {
    const m = await moneySetup(t);
    const sez = await sezParty(m, 'customer', 'AABCS1234K');

    const withTax = await post(m, invoiceBody(m, { partyId: sez, crossBorderTax: 'withTax' }));
    expect(withTax.crossBorderTax).toBe('withTax');
    expect(withTax.totals.taxLines.flatMap((l) => l.components.map((c) => c.type))).toEqual(['IGST']);
    expect(tax(withTax)).toBe(36000);

    const without = await post(m, invoiceBody(m, { partyId: sez, crossBorderTax: 'withoutTax' }));
    expect(without.crossBorderTax).toBe('withoutTax');
    expect(tax(without)).toBe(0);

    // Left unset: no LUT on file, so IGST, and the document says what it applied.
    expect(await post(m, invoiceBody(m, { partyId: sez }))).toMatchObject({ crossBorderTax: 'withTax' });

    // Changed on an edit, it is charged again.
    const edited = await t.patch(`${m.c}/documents/${withTax.id}`, invoiceBody(m, { partyId: sez, crossBorderTax: 'withoutTax' }), { token: m.token });
    expect(edited.status, edited.raw).toBe(200);
    expect(edited.body).toMatchObject({ crossBorderTax: 'withoutTax' });
    expect(tax(edited.body as Doc)).toBe(0);
  });

  it('a note against an SEZ invoice reverses it as it was charged, whatever it is sent with', async () => {
    const m = await moneySetup(t);
    const sez = await sezParty(m, 'customer', 'AABCS1234K');
    const inv = await post(m, invoiceBody(m, { partyId: sez, crossBorderTax: 'withoutTax', status: 'issued' }));
    const note = await post(m, { kind: 'creditNote', partyId: sez, date: '2026-09-29', currency: 'INR', sourceDocumentId: inv.id, lines: [line(m.gst(18), { quantity: 1 })], crossBorderTax: 'withTax' });
    expect(note.crossBorderTax).toBe('withoutTax');
    expect(tax(note)).toBe(0);
  });

  it('a bill from an SEZ supplier charges IGST unless it says without tax', async () => {
    const m = await moneySetup(t);
    const sez = await sezParty(m, 'supplier', 'AABCS5678K');
    const bill = (over: Record<string, unknown>) => ({ kind: 'purchaseBill', partyId: sez, date: '2026-09-29', currency: 'INR', supplierDocNumber: `SB-${Math.random()}`, lines: [line(m.gst(18))], ...over });
    const unchosen = await post(m, bill({}));
    expect(unchosen.crossBorderTax).toBe('withTax');
    expect(tax(unchosen)).toBe(36000);
    const without = await post(m, bill({ crossBorderTax: 'withoutTax' }));
    expect(without.crossBorderTax).toBe('withoutTax');
    expect(tax(without)).toBe(0);
  });

  it('means nothing to a party at home outside an SEZ', async () => {
    const m = await moneySetup(t);
    const doc = await post(m, invoiceBody(m, { crossBorderTax: 'withoutTax' }));
    expect(doc.crossBorderTax).toBeUndefined();
    expect(tax(doc)).toBe(36000);
  });
});

const US = { line1: '1 Market St', city: 'San Francisco', state: 'California', postalCode: '94105', country: 'US' };

async function overseas(m: Money, kind: 'customer' | 'supplier') {
  const res = await t.post(
    `${m.c}/parties`,
    { kind, name: `Overseas ${kind}`, currency: 'INR', gstRegistrationType: 'overseas', billingAddress: US, openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 30 },
    { token: m.token },
  );
  expect(res.status, res.raw).toBe(201);
  return res.body.id as string;
}

describe('exports and imports: with tax or without, as chosen', () => {
  it('an export charges IGST with tax and none without; unchosen, without an LUT, it charges IGST', async () => {
    const m = await moneySetup(t);
    const buyer = await overseas(m, 'customer');
    const withTax = await post(m, invoiceBody(m, { partyId: buyer, crossBorderTax: 'withTax' }));
    expect(withTax.crossBorderTax).toBe('withTax');
    expect(withTax.totals.taxLines.flatMap((l) => l.components.map((c) => c.type))).toEqual(['IGST']);
    expect(tax(withTax)).toBe(36000);
    const without = await post(m, invoiceBody(m, { partyId: buyer, crossBorderTax: 'withoutTax' }));
    expect(without.crossBorderTax).toBe('withoutTax');
    expect(tax(without)).toBe(0);
    expect(await post(m, invoiceBody(m, { partyId: buyer }))).toMatchObject({ crossBorderTax: 'withTax' });
  });

  it('an import bill charges none unless it says with tax, and only without tax carries a bill of entry', async () => {
    const m = await moneySetup(t);
    const supplier = await overseas(m, 'supplier');
    const bill = (over: Record<string, unknown>) => ({ kind: 'purchaseBill', partyId: supplier, date: '2026-09-29', currency: 'INR', supplierDocNumber: `IMP-${Math.random()}`, lines: [line(m.gst(18))], ...over });
    const boe = { number: '1234567', date: '2026-09-28', portCode: 'INNSA1', assessableValue: { minor: 200000, currency: 'INR' }, igst: { minor: 36000, currency: 'INR' } };

    const unchosen = await post(m, bill({ billOfEntry: boe }));
    expect(unchosen.crossBorderTax).toBe('withoutTax');
    expect(tax(unchosen)).toBe(0);

    const withTax = await post(m, bill({ crossBorderTax: 'withTax' }));
    expect(withTax.crossBorderTax).toBe('withTax');
    expect(tax(withTax)).toBe(36000);

    // IGST on the lines and again on a bill of entry would be claimed twice.
    const both = await t.post(`${m.c}/documents`, bill({ crossBorderTax: 'withTax', billOfEntry: boe }), { token: m.token });
    expect(both.status).toBe(422);
    expect(both.body.issues[0]).toMatchObject({ field: 'billOfEntry' });
  });
});
