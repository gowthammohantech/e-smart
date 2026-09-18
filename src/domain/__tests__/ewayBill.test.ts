import { EWB_THRESHOLD_MINOR, ewbApplicability } from '@/domain/gst/eway/applicability';
import { buildPartA } from '@/domain/gst/eway/buildPartA';
import { validateEwb } from '@/domain/gst/eway/validate';
import { EwbRecord, createMockEwb } from '@/domain/gst/eway/mockEwb';
import { EwbPartB } from '@/types';
import { fromMajor } from '@/lib/money';
import { ITEMS, company, invoice, line, party } from './gstFixtures';

const ROAD: EwbPartB = { transMode: '1', vehicleNo: 'MH12AB1234', vehicleType: 'R' };

describe('e-way bill applicability', () => {
  const base = { company: company(), party: party(), items: ITEMS };

  it('is required for goods over ₹50,000', () => {
    // 100 hinges at ₹250 is ₹25,000 + tax — below the line.
    const small = invoice({ lines: [line({ quantity: 100 })] });
    expect(small.totals.grandTotal.minor).toBeLessThan(EWB_THRESHOLD_MINOR);
    expect(ewbApplicability({ ...base, doc: small }).applicable).toBe(false);

    const large = invoice({ lines: [line({ quantity: 400 })] });
    expect(large.totals.grandTotal.minor).toBeGreaterThan(EWB_THRESHOLD_MINOR);
    expect(ewbApplicability({ ...base, doc: large }).applicable).toBe(true);
  });

  it('is never required for services alone', () => {
    const services = invoice({
      lines: [line({ itemId: 'itm_2', name: 'Installation service', hsnCode: '995461', unit: 'HR', quantity: 200, unitPrice: fromMajor('800', 'INR') })],
    });
    const result = ewbApplicability({ ...base, doc: services });
    expect(result.applicable).toBe(false);
    expect(result.reason).toMatch(/services only/);
  });

  it('is not required for a quotation or a draft', () => {
    const big = { lines: [line({ quantity: 400 })] };
    expect(ewbApplicability({ ...base, doc: invoice({ ...big, kind: 'quote', status: 'sent' }) }).applicable).toBe(false);
    expect(ewbApplicability({ ...base, doc: invoice({ ...big, status: 'draft' }) }).applicable).toBe(false);
  });

  it('is switched off when the setting is off', () => {
    const co = company();
    const result = ewbApplicability({
      ...base,
      company: { ...co, taxRegistration: { ...co.taxRegistration!, eWayBillEnabled: false } },
      doc: invoice({ lines: [line({ quantity: 400 })] }),
    });
    expect(result.applicable).toBe(false);
  });
});

describe('Part-A', () => {
  it('derives both ends of the journey from the document', () => {
    const partA = buildPartA({
      company: company(),
      party: party(),
      doc: invoice({ lines: [line({ quantity: 400 })] }),
      items: ITEMS,
    });

    expect(partA.supplyType).toBe('O');
    expect(partA.subSupplyType).toBe('1');
    expect(partA.docType).toBe('INV');
    expect(partA.fromStateCode).toBe('27');
    expect(partA.fromPincode).toBe('400059');
    expect(partA.toPincode).toBe('400007');
    expect(partA.itemList[0].hsnCode).toBe('830210');
    expect(partA.cgstValue).toBeGreaterThan(0);
    expect(partA.igstValue).toBe(0);
  });

  it('uses a delivery challan for a delivery note and a credit note for a return', () => {
    const args = { company: company(), party: party(), items: ITEMS };
    expect(buildPartA({ ...args, doc: invoice({ kind: 'delivery', status: 'delivered' }) }).docType).toBe('CHL');
    const ret = buildPartA({ ...args, doc: invoice({ kind: 'salesReturn', status: 'processed' }) });
    expect(ret.docType).toBe('CRN');
    expect(ret.subSupplyType).toBe('8');
  });
});

describe('Part-B validation', () => {
  const partA = buildPartA({
    company: company(),
    party: party(),
    doc: invoice({ lines: [line({ quantity: 400 })] }),
    items: ITEMS,
  });
  const codes = (partB: EwbPartB, distanceKm = 320) =>
    validateEwb({ partA, partB, distanceKm }).map((e) => e.code);

  it('accepts a well-formed road consignment', () => {
    expect(codes(ROAD)).toEqual([]);
  });

  it('238 — the vehicle number is malformed', () => {
    expect(codes({ ...ROAD, vehicleNo: 'MH12AB12' })).toContain('238');
  });

  it('112 — road transport with no vehicle number', () => {
    expect(codes({ transMode: '1', vehicleType: 'R' })).toContain('112');
  });

  it('673 — rail, air or ship with no transport document', () => {
    expect(codes({ transMode: '2', vehicleType: 'R' })).toContain('673');
    expect(codes({ transMode: '2', vehicleType: 'R', transDocNo: 'RR-9912' })).toEqual([]);
  });

  it('104 — the distance is beyond what the portal allows', () => {
    expect(codes(ROAD, 4500)).toContain('104');
  });

  it('102 — the transporter ID is not a valid GSTIN', () => {
    expect(codes({ ...ROAD, transporterId: 'NOTAGSTIN12345' })).toContain('102');
  });
});

describe('mock e-way bill portal', () => {
  const partA = buildPartA({
    company: company(),
    party: party(),
    doc: invoice({ lines: [line({ quantity: 400 })] }),
    items: ITEMS,
  });

  function ewbAt(iso: string, activeBills = new Map<string, EwbRecord>()) {
    return { ewb: createMockEwb({ now: () => new Date(iso), activeBills }), activeBills };
  }

  it('issues a 12-digit number with validity from the distance', () => {
    const { ewb } = ewbAt('2026-09-18T06:00:00.000Z');
    const result = ewb.generate({ partA, partB: ROAD, distanceKm: 450, cargo: 'regular', documentId: 'doc_1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ewbNo).toMatch(/^\d{12}$/);
    // 450 km is three days.
    expect(result.validUpto).toBe('2026-09-21T00:00:00.000Z');
  });

  it('refuses a second bill for the same document', () => {
    const { ewb, activeBills } = ewbAt('2026-09-18T06:00:00.000Z');
    const first = ewb.generate({ partA, partB: ROAD, distanceKm: 100, cargo: 'regular', documentId: 'doc_1' });
    if (!first.ok) throw new Error('expected success');
    activeBills.set(first.ewbNo, { ewbDate: first.ewbDate, validUpto: first.validUpto, documentId: 'doc_1' });

    const second = ewb.generate({ partA, partB: ROAD, distanceKm: 100, cargo: 'regular', documentId: 'doc_1' });
    expect(second.ok).toBe(false);
  });

  it('updates the vehicle while the bill is live, and not after it expires', () => {
    const live = new Map<string, EwbRecord>([
      ['123456789012', { ewbDate: '2026-09-18T06:00:00.000Z', validUpto: '2026-09-19T00:00:00.000Z', documentId: 'doc_1' }],
    ]);
    const { ewb } = ewbAt('2026-09-18T18:00:00.000Z', live);
    expect(ewb.updateVehicle({ ewbNo: '123456789012', partB: { ...ROAD, vehicleNo: 'KA01F1234' } }).ok).toBe(true);

    const { ewb: later } = ewbAt('2026-09-20T09:00:00.000Z', live);
    const result = later.updateVehicle({ ewbNo: '123456789012', partB: ROAD });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe('325');
  });

  it('extends validity only around the expiry moment', () => {
    const live = new Map<string, EwbRecord>([
      ['123456789012', { ewbDate: '2026-09-18T06:00:00.000Z', validUpto: '2026-09-19T00:00:00.000Z', documentId: 'doc_1' }],
    ]);
    const { ewb: early } = ewbAt('2026-09-18T10:00:00.000Z', live);
    expect(early.extend({ ewbNo: '123456789012', remainingDistanceKm: 100, cargo: 'regular' }).ok).toBe(false);

    const { ewb: inWindow } = ewbAt('2026-09-18T20:00:00.000Z', live);
    const result = inWindow.extend({ ewbNo: '123456789012', remainingDistanceKm: 300, cargo: 'regular' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validUpto).toBe('2026-09-20T00:00:00.000Z');
  });

  it('cancels within 24 hours and refuses after, with 378', () => {
    const live = () =>
      new Map<string, EwbRecord>([
        ['123456789012', { ewbDate: '2026-09-18T06:00:00.000Z', validUpto: '2026-09-21T00:00:00.000Z', documentId: 'doc_1' }],
      ]);
    const { ewb: inTime } = ewbAt('2026-09-19T05:00:00.000Z', live());
    expect(inTime.cancel({ ewbNo: '123456789012', reason: 'Order cancelled' }).ok).toBe(true);

    const { ewb: late } = ewbAt('2026-09-19T07:00:00.000Z', live());
    const result = late.cancel({ ewbNo: '123456789012', reason: 'Order cancelled' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe('378');
  });
});
