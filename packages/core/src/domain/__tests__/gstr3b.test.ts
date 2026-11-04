import { calculateDocument } from '../lineCalc';
import { buildTaxContext } from '../taxEngine';
import { dueDate, gstr3b, gstr3bJson, lateFeeAndInterest, lateFeeCap, liabilityOf, utilizeItc } from '../gstr3b';
import { BusinessDocument, Company, DocumentKind, DocumentLine, GstFlags, Party } from '../../types';
import { fromMajor, zero } from '../../lib/money';

const GSTIN = '27AABCV1234F1ZO';
const company = { id: 'c', baseCurrency: 'INR', taxRegistration: { regime: 'GST', identifierLabel: 'GSTIN', registered: true, placeOfSupplyStateCode: '27' }, fiscalYearStartMonth: 4 } as Company;
const parties = [
  { id: 'b2b', gstRegistrationType: 'regular', taxId: '27AACFA1111P1ZH', billingAddress: { stateCode: '27' } },
  { id: 'ka', gstRegistrationType: 'unregistered', billingAddress: { stateCode: '29' } },
  { id: 'sup', gstRegistrationType: 'regular', taxId: '27AABCS2222K1ZQ', billingAddress: { stateCode: '27' } },
  { id: 'gta', gstRegistrationType: 'unregistered', billingAddress: { stateCode: '27' } },
] as Party[];

const line = (major: string, gst?: GstFlags): DocumentLine => ({ id: Math.random().toString(36).slice(2), name: 'x', quantity: 1, unit: 'NOS', unitPrice: fromMajor(major, 'INR'), discountMode: 'percent', discountValue: 0, taxCategoryId: 't', taxRate: gst?.supplyType && gst.supplyType !== 'taxable' ? 0 : 18, taxInclusive: false, gst });

function doc(kind: DocumentKind, partyId: string, lines: DocumentLine[], over: Partial<BusinessDocument> = {}): BusinessDocument {
  const party = parties.find((p) => p.id === partyId)!;
  const purchase = ['purchaseBill', 'supplierCreditNote', 'supplierDebitNote', 'purchaseReturn'].includes(kind);
  const pos = over.placeOfSupplyStateCode ?? party.billingAddress.stateCode;
  const totals = calculateDocument({
    lines,
    currency: 'INR',
    baseCurrency: 'INR',
    exchangeRate: 1,
    documentDiscountMode: 'percent',
    documentDiscountValue: 0,
    charges: zero('INR'),
    applyRoundOff: false,
    taxCategories: [],
    taxContext: buildTaxContext(company, { party, placeOfSupply: pos, date: '2026-09-10', purchase, reverseCharge: over.reverseCharge }),
  });
  return { id: Math.random().toString(36).slice(2), kind, status: 'issued', partyId, date: '2026-09-10', currency: 'INR', exchangeRate: 1, placeOfSupplyStateCode: pos, lines, totals, ...over } as BusinessDocument;
}

/** A September: B2B and B2C sales, a credit note, an exempt sale, a GTA bill under reverse charge, a claimed bill with a blocked line. */
const documents = [
  doc('invoice', 'b2b', [line('10000')]),
  doc('invoice', 'ka', [line('5000')]),
  doc('creditNote', 'b2b', [line('1000')]),
  doc('invoice', 'b2b', [line('2000', { supplyType: 'exempt' })]),
  doc('purchaseBill', 'gta', [line('3000')], { reverseCharge: true }),
  doc('purchaseBill', 'sup', [line('4000'), line('500', { itcEligibility: 'blocked' })], { itcClaimPeriod: '092026' }),
  doc('purchaseBill', 'sup', [line('9999')], { itcClaimPeriod: '082026' }),
  doc('invoice', 'b2b', [line('7777')], { status: 'draft' }),
];

const r = gstr3b({ period: '092026', company, gstin: GSTIN, baseCurrency: 'INR', documents, expenses: [], parties, expenseSplit: new Map() });

describe('GSTR-3B', () => {
  it('puts the period’s sales in 3.1(a), net of credit notes, and exempt ones in 3.1(c)', () => {
    expect(r.outward.taxable).toEqual({ taxable: 1_400_000, igst: 90_000, cgst: 81_000, sgst: 81_000, cess: 0 });
    expect(r.outward.nilExempt.taxable).toBe(200_000);
  });

  it('shows reverse-charge tax owed in 3.1(d) and its credit in 4A(3)', () => {
    expect(r.outward.reverseCharge).toEqual({ taxable: 300_000, igst: 0, cgst: 27_000, sgst: 27_000, cess: 0 });
    expect(r.itc.reverseCharge).toMatchObject({ cgst: 27_000, sgst: 27_000 });
  });

  it('lists inter-state supplies to unregistered buyers by state in 3.2', () => {
    expect(r.interStateUnregistered).toEqual([{ placeOfSupply: '29', taxable: 500_000, igst: 90_000 }]);
  });

  it('claims only the bills 2B matched for this period, and reverses the blocked line in 4B(1)', () => {
    expect(r.itc.allOther).toMatchObject({ cgst: 40_500, sgst: 40_500 });
    expect(r.itc.reversedRules).toMatchObject({ cgst: 4_500, sgst: 4_500 });
    expect(r.itc.net).toMatchObject({ igst: 0, cgst: 27_000 + 36_000, sgst: 27_000 + 36_000 });
  });

  it('breaks every table down to the documents behind it, adding up to the figure', () => {
    const total = (rows: { taxable: number; igst: number; cgst: number; sgst: number; cess: number }[] = []) =>
      rows.reduce((a, x) => ({ taxable: a.taxable + x.taxable, igst: a.igst + x.igst, cgst: a.cgst + x.cgst, sgst: a.sgst + x.sgst, cess: a.cess + x.cess }), { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
    expect(total(r.sources['3.1a'])).toEqual(r.outward.taxable);
    expect(total(r.sources['3.1c'])).toEqual(r.outward.nilExempt);
    expect(total(r.sources['3.1d'])).toEqual(r.outward.reverseCharge);
    expect(total(r.sources['4A3'])).toEqual(r.itc.reverseCharge);
    expect(total(r.sources['4A5'])).toEqual(r.itc.allOther);
    expect(total(r.sources['4B1'])).toEqual(r.itc.reversedRules);
    expect(total(r.sources['3.2']).igst).toBe(r.interStateUnregistered.reduce((a, x) => a + x.igst, 0));
    // A credit note shows as a negative line of 3.1(a).
    expect(r.sources['3.1a']?.some((x) => x.kind === 'creditNote' && x.taxable < 0)).toBe(true);
  });

  it('builds GSTN’s JSON in rupees', () => {
    const { forward, reverseCharge } = liabilityOf(r);
    const json = gstr3bJson(r, GSTIN, utilizeItc(forward, reverseCharge, r.itc.net));
    expect(json.sup_details.osup_det).toEqual({ txval: 14000, iamt: 900, camt: 810, samt: 810, csamt: 0 });
    expect(json.itc_elg.itc_avl.find((x) => x.ty === 'ISRC')).toMatchObject({ camt: 270, samt: 270 });
    expect(json.inter_sup.unreg_details).toEqual([{ pos: '29', txval: 5000, iamt: 900 }]);
  });
});

describe('paying the tax from credit (rule 88A)', () => {
  const k = (igst: number, cgst: number, sgst: number, cess = 0) => ({ igst, cgst, sgst, cess });

  it('uses all IGST credit first, aimed at what CGST and SGST credit can’t cover', () => {
    const u = utilizeItc(k(100, 300, 300), k(0, 0, 0), k(500, 50, 250));
    // 250 and 50 cover the shortfalls; the 100 left must still go before CGST or SGST credit.
    expect(u.credit.igst).toEqual(k(100, 300, 100));
    expect(u.credit.sgst.sgst).toBe(200);
    expect(u.cash).toEqual(k(0, 0, 0));
    expect(u.carriedForward).toEqual(k(0, 50, 50));
  });

  it('pays no cash that a smarter split could have avoided', () => {
    // A naive IGST-to-CGST-first split would leave SGST short.
    const u = utilizeItc(k(0, 100, 100), k(0, 0, 0), k(100, 100, 0));
    expect(u.cash).toEqual(k(0, 0, 0));
    expect(u.credit.igst.sgst).toBe(100);
  });

  it('never lets CGST credit pay SGST, and pays reverse charge in cash', () => {
    const u = utilizeItc(k(0, 0, 200), k(0, 50, 50), k(0, 500, 0));
    expect(u.credit.cgst.sgst).toBe(0);
    expect(u.cash).toEqual(k(0, 50, 250));
    expect(u.carriedForward.cgst).toBe(500);
  });

  it('lets CGST and SGST credit pay IGST once IGST credit is gone', () => {
    const u = utilizeItc(k(300, 0, 0), k(0, 0, 0), k(100, 150, 100));
    expect(u.credit.igst.igst).toBe(100);
    expect(u.credit.cgst.igst).toBe(150);
    expect(u.credit.sgst.igst).toBe(50);
    expect(u.cash.igst).toBe(0);
  });

  it('keeps cess credit for cess', () => {
    const u = utilizeItc(k(100, 0, 0, 50), k(0, 0, 0), k(0, 0, 0, 200));
    expect(u.credit.cess).toEqual(k(0, 0, 0, 50));
    expect(u.cash.igst).toBe(100);
  });
});

describe('due date, late fee and interest', () => {
  it('falls due on the 20th, or the 22nd or 24th under QRMP by state', () => {
    expect(dueDate('092026', 'monthly', '27')).toBe('2026-10-20');
    expect(dueDate('122026', 'qrmp', '33')).toBe('2027-01-22');
    expect(dueDate('122026', 'qrmp', '07')).toBe('2027-01-24');
  });

  it('charges ₹50 a day late (₹20 nil) and 18% a year on cash tax', () => {
    const { lateFee, interest } = lateFeeAndInterest(r, { igst: 0, cgst: 3_650_000, sgst: 0, cess: 0 }, '2026-10-20', '2026-10-30');
    expect(lateFee).toEqual({ cgst: 25_000, sgst: 25_000 });
    expect(interest.cgst).toBe(18_000);
  });
});

describe('late fee cap', () => {
  it('follows the aggregate turnover (notification 19/2021-CT)', () => {
    expect(lateFeeCap(1_00_00_000_00)).toBe(1_00_000); // ₹1 crore: ₹1,000 a head
    expect(lateFeeCap(1_50_00_000_00)).toBe(1_00_000);
    expect(lateFeeCap(4_00_00_000_00)).toBe(2_50_000); // ₹4 crore: ₹2,500
    expect(lateFeeCap(9_00_00_000_00)).toBe(5_00_000); // above ₹5 crore: ₹5,000
    expect(lateFeeCap(undefined)).toBe(5_00_000);
  });
});
