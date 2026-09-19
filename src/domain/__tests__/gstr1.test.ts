import { B2CL_THRESHOLD_MINOR, gstr1Summary } from '@/domain/gstr1';
import { calculateDocument } from '@/domain/lineCalc';
import { fromMajor, zero } from '@/lib/money';
import { Address, BusinessDocument, Company, DocumentLine, Party } from '@/types';

/* A Maharashtra seller; buyers in Karnataka (inter-state) and Maharashtra. */

const PERIOD = { from: '2026-09-01', to: '2026-09-30' };

function address(stateCode: string): Address {
  return { line1: '1 Main Road', city: 'City', state: '', stateCode, postalCode: '400001', country: 'IN' };
}

const COMPANY = {
  id: 'cmp',
  address: address('27'),
  taxRegistration: { regime: 'GST', identifier: '27AABCV1234F1ZO', identifierLabel: 'GSTIN', registered: true, placeOfSupplyStateCode: '27' },
} as Company;

function party(id: string, over: Partial<Party> = {}): Party {
  return {
    id,
    companyId: 'cmp',
    kind: 'customer',
    name: id,
    code: id,
    currency: 'INR',
    billingAddress: address('29'),
    openingBalance: zero('INR'),
    paymentTermsDays: 30,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const PARTIES = [
  party('registered', { taxId: '29AACFA9876P1ZH' }),
  party('consumer_ka'),
  party('consumer_mh', { billingAddress: address('27') }),
  party('overseas', { gstRegistrationType: 'overseas', billingAddress: { ...address(''), country: 'AE' } }),
];

function line(over: Partial<DocumentLine> = {}): DocumentLine {
  return {
    id: 'ln',
    name: 'Sheet',
    hsnCode: '39211900',
    quantity: 10,
    unit: 'PCS',
    unitPrice: fromMajor('1000', 'INR'),
    discountMode: 'percent',
    discountValue: 0,
    taxCategoryId: 'tax_18',
    taxRate: 18,
    taxInclusive: false,
    ...over,
  };
}

/** A document whose totals come from the real calculator, as the store builds them. */
function doc(partyId: string, over: Partial<BusinessDocument> = {}): BusinessDocument {
  const lines = over.lines ?? [line()];
  const currency = over.currency ?? 'INR';
  const pos = over.placeOfSupplyStateCode ?? PARTIES.find((p) => p.id === partyId)!.billingAddress.stateCode;
  const totals = calculateDocument({
    lines,
    currency,
    baseCurrency: 'INR',
    exchangeRate: over.exchangeRate ?? 1,
    documentDiscountMode: 'percent',
    documentDiscountValue: 0,
    charges: zero(currency),
    applyRoundOff: false,
    taxCategories: [],
    taxContext: { regime: 'GST', registered: true, homeStateCode: '27', placeOfSupplyStateCode: pos },
  });
  return {
    id: `${partyId}-${over.number ?? '1'}`,
    companyId: 'cmp',
    branchId: 'brn',
    kind: 'invoice',
    number: 'INV-1',
    status: 'issued',
    partyId,
    date: '2026-09-15',
    currency,
    exchangeRate: 1,
    documentDiscountMode: 'percent',
    documentDiscountValue: 0,
    charges: zero(currency),
    applyRoundOff: false,
    placeOfSupplyStateCode: pos,
    attachmentIds: [],
    createdBy: 'usr',
    createdAt: '2026-09-15T09:00:00.000Z',
    updatedAt: '2026-09-15T09:00:00.000Z',
    ...over,
    lines,
    totals,
  };
}

const summarize = (documents: BusinessDocument[]) =>
  gstr1Summary({ company: COMPANY, documents, parties: PARTIES, items: [], baseCurrency: 'INR', period: PERIOD });

describe('GSTR-1', () => {
  it('puts a sale to a registered buyer in B2B, one row per rate', () => {
    const s = summarize([doc('registered')]);
    expect(s.b2b).toHaveLength(1);
    expect(s.b2b[0]).toMatchObject({ gstin: '29AACFA9876P1ZH', rate: 18, placeOfSupply: '29' });
    expect(s.b2b[0].taxableValue.minor).toBe(10_000_00);
    expect(s.b2b[0].igst.minor).toBe(1_800_00);
    expect(s.b2b[0].cgst.minor).toBe(0);
  });

  it('sends a large inter-state consumer sale to B2CL and a small one to B2CS', () => {
    const large = doc('consumer_ka', { number: 'L', lines: [line({ quantity: 100 })] });
    const small = doc('consumer_ka', { number: 'S' });
    expect(large.totals.grandTotal.minor).toBeGreaterThan(B2CL_THRESHOLD_MINOR);
    const s = summarize([large, small]);
    expect(s.b2cl.map((r) => r.documentId)).toEqual([large.id]);
    expect(s.b2cs.map((r) => r.documentId)).toEqual([small.id]);
  });

  it('keeps a large sale within the state in B2CS', () => {
    const s = summarize([doc('consumer_mh', { lines: [line({ quantity: 100 })] })]);
    expect(s.b2cl).toHaveLength(0);
    expect(s.b2cs).toHaveLength(1);
    expect(s.b2cs[0].cgst.minor).toBe(s.b2cs[0].sgst.minor);
  });

  it('reports an overseas buyer under exports', () => {
    const s = summarize([doc('overseas', { placeOfSupplyStateCode: '96' })]);
    expect(s.exp).toHaveLength(1);
    expect(s.b2cs).toHaveLength(0);
  });

  it('files a credit note under CDNR and takes it off the totals', () => {
    const sale = doc('registered');
    const credit = doc('registered', { kind: 'salesReturn', number: 'CRN-1', lines: [line({ quantity: 2 })] });
    const s = summarize([sale, credit]);
    expect(s.cdnr.map((r) => r.documentId)).toEqual([credit.id]);
    expect(s.totals.taxableValue.minor).toBe(8_000_00);
    expect(s.totals.tax.minor).toBe(1_440_00);
    expect(s.hsn[0].quantity).toBe(8);
  });

  it('leaves out drafts, cancelled documents and anything outside the period', () => {
    const s = summarize([
      doc('registered', { number: 'D', status: 'draft' }),
      doc('registered', { number: 'C', status: 'cancelled' }),
      doc('registered', { number: 'O', date: '2026-08-31' }),
    ]);
    expect(s.totals.documents).toBe(0);
  });

  it('does not count a rate slab once per line in the HSN summary', () => {
    const s = summarize([doc('registered', { lines: [line({ id: 'a' }), line({ id: 'b' })] })]);
    expect(s.hsn).toHaveLength(1);
    expect(s.hsn[0].taxableValue.minor).toBe(20_000_00);
    expect(s.hsn[0].igst.minor).toBe(3_600_00);
  });

  it('uses the discounted value in the HSN summary', () => {
    const s = summarize([doc('registered', { lines: [line({ discountValue: 10 })] })]);
    expect(s.hsn[0].taxableValue.minor).toBe(9_000_00);
    expect(s.hsn[0].igst.minor).toBe(1_620_00);
  });

  it('converts a foreign-currency invoice at its stored rate', () => {
    const usd = doc('overseas', {
      currency: 'USD',
      exchangeRate: 83,
      placeOfSupplyStateCode: '96',
      lines: [line({ unitPrice: fromMajor('100', 'USD'), quantity: 1, taxRate: 0 })],
    });
    const s = summarize([usd]);
    expect(s.exp[0].taxableValue).toEqual(fromMajor('8300', 'INR'));
    expect(s.hsn[0].taxableValue).toEqual(fromMajor('8300', 'INR'));
  });
});
