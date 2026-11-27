import { describe, expect, it, vi } from 'vitest';
import { validUptoFor, type EwbPayload } from '@esmart/core/domain/ewayBill';
import type { SimulatedComplianceProvider } from '../src/providers/compliance';
import { ewayBillByIrnBody, nativeEwayBillBody } from '../src/providers/gsp/common';
import { setupApi } from './helpers';
import { issueInvoice, line, moneySetup, type Money } from './money-fixtures';

/**
 * Every way an e-way bill is raised from an invoice: in-state and inter-state supplies, exports with
 * IGST and under LUT, by road, rail, air and ship, regular and over-dimensional cargo; and the
 * portal's rules (NIC GENEWAYBILL v1.03) refusing what it would refuse.
 */
const t = setupApi();
const portal = () => t.providers.compliance as SimulatedComplianceProvider;

const SELLER = '27AAPFU0939F1ZV';
const BUYER = '29AABCG4321K1ZM';
const T0 = '2026-09-29T10:00:00.000Z';
const US = { line1: '1 Market St', city: 'San Francisco', state: 'California', postalCode: '94105', country: 'US' };

const FROM = { legalName: 'Vertex Traders', gstin: SELLER, address1: '12 Market Road', place: 'Mumbai', pincode: '400001', stateCode: '27' };
const TO_BENGALURU = { legalName: 'Anand Enterprises', gstin: BUYER, address1: '4 MG Road', place: 'Bengaluru', pincode: '560001', stateCode: '29' };
const TO_MUMBAI = { legalName: 'Sunrise Retail', gstin: 'URP', address1: '8 Linking Road', place: 'Mumbai', pincode: '400050', stateCode: '27' };
/** An export's "to": the port it leaves India from (JNPT, Maharashtra). */
const TO_PORT = { legalName: 'Overseas customer, USA', gstin: 'URP', address1: 'JNPT Port, Nhava Sheva', place: 'Navi Mumbai', pincode: '400707', stateCode: '27' };

async function ready() {
  const m = await moneySetup(t);
  t.setNow(T0);
  portal().clearFaults();
  await m.allowNegativeStock();
  return m;
}

async function overseasBuyer(m: Money) {
  const res = await t.post(
    `${m.c}/parties`,
    { kind: 'customer', name: 'Overseas customer', currency: 'INR', gstRegistrationType: 'overseas', billingAddress: US, openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 30 },
    { token: m.token },
  );
  expect(res.status, res.raw).toBe(201);
  return res.body.id as string;
}

/** Goods above the ₹50,000 threshold. */
async function goods(m: Money, partyId: string, over: Record<string, unknown> = {}) {
  const rod = await m.item();
  return issueInvoice(t, m, { partyId, lines: [line(m.gst(18), { itemId: rod, hsnCode: '721420', unitPrice: { minor: 60_000_00, currency: 'INR' } })], ...over });
}

const byRoad = { transportMode: 'road', vehicleNumber: 'MH04AB1234' };
const byDoc = (mode: 'rail' | 'air' | 'ship', docNo: string) => ({ transportMode: mode, vehicleNumber: undefined, transportDocNumber: docNo, transportDocDate: '2026-09-29' });
/** An export invoice of goods names the port they leave from (JNPT). */
const SHIPPING_BILL = { shippingBill: { portCode: 'INNSA1' } };

const input = (documentId: string, over: Record<string, unknown> = {}) => ({
  documentId,
  subSupplyType: 'supply',
  transactionType: 1,
  from: FROM,
  to: TO_BENGALURU,
  transporterId: '27AABCT5512M1Z6',
  transporterName: 'Konkan Roadlines',
  vehicleType: 'regular',
  distanceKm: 450,
  ...byRoad,
  ...over,
});

/** Raises the bill and hands back the bill and the payload the portal was sent. */
async function generate(m: Money, body: Record<string, unknown>) {
  const spy = vi.spyOn(portal(), 'submitEwayBill');
  const res = await t.post(`${m.c}/eway-bills`, body, { token: m.token });
  const payload = spy.mock.calls.at(-1)?.[1]?.payload as EwbPayload | undefined;
  spy.mockRestore();
  return { res, payload };
}

describe('e-way bill flows: invoice kinds × transport modes × cargo', () => {
  const modes = [
    ['road', byRoad],
    ['rail', byDoc('rail', 'RR123456')],
    ['air', byDoc('air', 'AWB98765')],
    ['ship', byDoc('ship', 'BL445566')],
  ] as const;
  const cargo = ['regular', 'overDimensional'] as const;

  for (const [mode, transport] of modes) {
    for (const vehicleType of cargo) {
      it(`inter-state invoice (IGST) by ${mode}, ${vehicleType} cargo`, async () => {
        const m = await ready();
        const inv = await goods(m, m.bengaluru.id);
        const { res, payload } = await generate(m, input(inv.id, { ...transport, vehicleType, distanceKm: 450 }));
        expect(res.status, res.raw).toBe(201);
        const bill = res.body.ewayBill;
        expect(bill.ewayBillNumber).toMatch(/^[0-9]{12}$/);
        expect(bill).toMatchObject({ transportMode: mode, vehicleType, distanceKm: 450, validUpto: validUptoFor(T0, 450, vehicleType) });
        if (mode === 'road') expect(bill.vehicleNumber).toBe('MH04AB1234');
        else expect(bill).toMatchObject({ transportDocNumber: (transport as { transportDocNumber: string }).transportDocNumber, transportDocDate: '2026-09-29' });

        // What NIC receives: inter-state, so IGST only, billed and shipped to Karnataka.
        const body = nativeEwayBillBody(payload!);
        expect(body).toMatchObject({ supplyType: 'O', subSupplyType: 1, docType: 'INV', transactionType: 1, toStateCode: 29, actToStateCode: 29, transMode: { road: '1', rail: '2', air: '3', ship: '4' }[mode], vehicleType: vehicleType === 'regular' ? 'R' : 'O', cgstValue: 0, sgstValue: 0 });
        expect(body.igstValue as number).toBeGreaterThan(0);
        const total = (body.totalValue as number) + (body.cgstValue as number) + (body.sgstValue as number) + (body.igstValue as number) + (body.otherValue as number);
        expect(Math.round(total * 100)).toBe(Math.round((body.totInvValue as number) * 100));
      });
    }
  }

  it('in-state invoice (CGST + SGST) by road', async () => {
    const m = await ready();
    const inv = await goods(m, m.mumbai.id);
    const { res, payload } = await generate(m, input(inv.id, { to: TO_MUMBAI, distanceKm: 25 }));
    expect(res.status, res.raw).toBe(201);
    const body = nativeEwayBillBody(payload!);
    expect(body).toMatchObject({ fromStateCode: 27, toStateCode: 27, actToStateCode: 27, igstValue: 0 });
    expect(body.cgstValue as number).toBeGreaterThan(0);
    expect(body.cgstValue).toBe(body.sgstValue);
  });

  for (const [label, crossBorderTax] of [['with IGST', 'withTax'], ['under LUT (no tax)', 'withoutTax']] as const) {
    for (const [mode, transport] of [['road', byRoad], ['ship', byDoc('ship', 'BL778899')]] as const) {
      it(`export ${label} by ${mode}: billed to Other Country, shipped to the port`, async () => {
        const m = await ready();
        const buyer = await overseasBuyer(m);
        const inv = await goods(m, buyer, { crossBorderTax, ...SHIPPING_BILL });
        const { res, payload } = await generate(m, input(inv.id, { subSupplyType: 'export', to: TO_PORT, distanceKm: 30, ...transport }));
        expect(res.status, res.raw).toBe(201);
        expect(res.body.ewayBill).toMatchObject({ subSupplyType: 'export', to: { stateCode: '27', pincode: '400707', gstin: 'URP' } });

        const body = nativeEwayBillBody(payload!);
        expect(body).toMatchObject({ subSupplyType: 3, toGstin: 'URP', toStateCode: 99, actToStateCode: 27, toPincode: 400707, cgstValue: 0, sgstValue: 0 });
        if (crossBorderTax === 'withTax') expect(body.igstValue as number).toBeGreaterThan(0);
        else expect(body.igstValue).toBe(0);

        // By IRN, the port goes as ExpShipDtls, with URP for its GSTIN.
        const byIrn = ewayBillByIrnBody('a'.repeat(64), payload!, 'TransDocNo', 'TransDocDt');
        expect(byIrn.ExpShipDtls).toEqual({ Gstin: 'URP', Addr1: 'JNPT Port, Nhava Sheva', Loc: 'Navi Mumbai', Pin: 400707, Stcd: '27' });
      });
    }
  }
});

describe('e-way bill flows: what the portal would refuse is refused first', () => {
  async function refused(over: (m: Money, docId: string) => Record<string, unknown>, party: (m: Money) => Promise<string> | string = (m) => m.bengaluru.id, invOver: Record<string, unknown> = {}) {
    const m = await ready();
    const inv = await goods(m, await party(m), invOver);
    const res = await t.post(`${m.c}/eway-bills`, input(inv.id, over(m, inv.id)), { token: m.token });
    expect(res.status, res.raw).toBe(422);
    return (res.body.issues as { code: string; severity: string }[]).filter((i) => i.severity === 'blocking').map((i) => i.code);
  }

  it('an export sent to Other Country (99) instead of the port', async () => {
    expect(await refused(() => ({ subSupplyType: 'export', to: { ...TO_PORT, stateCode: '99', pincode: '999999' } }), overseasBuyer, SHIPPING_BILL)).toContain('EWB105');
  });

  it('an export consignee with a GSTIN instead of URP', async () => {
    expect(await refused(() => ({ subSupplyType: 'export', to: { ...TO_PORT, gstin: BUYER } }), overseasBuyer, SHIPPING_BILL)).toContain('EWB112');
  });

  it('a PIN that is not in the chosen state', async () => {
    expect(await refused(() => ({ to: { ...TO_BENGALURU, pincode: '400001' } }))).toContain('EWB121');
  });

  it('names, addresses and places longer than the portal takes', async () => {
    const codes = await refused(() => ({ to: { ...TO_BENGALURU, legalName: 'N'.repeat(101), address1: 'A'.repeat(121), place: 'P'.repeat(51) } }));
    expect(codes).toEqual(expect.arrayContaining(['EWB118', 'EWB119', 'EWB120']));
  });

  it('an Others description longer than 20 characters', async () => {
    expect(await refused(() => ({ subSupplyType: 'others', subSupplyDescription: 'D'.repeat(21) }))).toEqual(expect.arrayContaining(['EWB113']));
  });

  it('a document more than 180 days old', async () => {
    expect(await refused(() => ({}), undefined, { date: '2026-03-01', dueDate: '2026-03-31' })).toContain('EWB117');
  });

  it('rail, air or ship without a transport document, or with one longer than 15 characters', async () => {
    expect(await refused(() => ({ transportMode: 'rail', vehicleNumber: undefined }))).toEqual(expect.arrayContaining(['EWB202', 'EWB203']));
    expect(await refused(() => ({ ...byDoc('air', 'X'.repeat(16)), vehicleNumber: undefined }))).toContain('EWB209');
  });

  it('a road bill without a vehicle number, and a distance over 4,000 km', async () => {
    expect(await refused(() => ({ vehicleNumber: undefined }))).toContain('EWB201');
    // Over 4,000 km the request itself is refused, before any rule runs.
    const m = await ready();
    const inv = await goods(m, m.bengaluru.id);
    const far = await t.post(`${m.c}/eway-bills`, input(inv.id, { distanceKm: 4001 }), { token: m.token });
    expect(far.status).toBe(422);
    expect(far.raw).toContain('distanceKm');
  });
});
