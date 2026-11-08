import { B2CL_THRESHOLD_MINOR, consolidateB2cs, gstr1Summary } from '../gstr1';
import { creditNoteDeadline } from '../../lib/date';
import { calculateDocument } from '../lineCalc';
import { fromMajor, zero } from '../../lib/money';
import { Address, BusinessDocument, Company, DocumentLine, Party } from '../../types';

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

  it('reports a sale with no party on record as a walk-in B2CS sale', () => {
    const walkIn = { ...doc('consumer_mh'), id: 'cash-1', partyId: 'gone' };
    const s = summarize([walkIn]);
    expect(s.b2cs.map((r) => r.documentId)).toEqual(['cash-1']);
    expect(s.b2cs[0].partyName).toBe('Walk-in customer');
    expect(s.totals.documents).toBe(1);
  });

  it('nets a small credit note to a consumer against B2CS, not CDNUR', () => {
    const credit = doc('consumer_mh', { kind: 'salesReturn', number: 'CRN-1', lines: [line({ quantity: 1 })] });
    const s = summarize([doc('consumer_mh'), credit]);
    expect(s.cdnur).toHaveLength(0);
    expect(s.b2cs.map((r) => r.kind)).toEqual(['invoice', 'salesReturn']);
  });

  it('keeps a credit note against a large inter-state sale in CDNUR', () => {
    const credit = doc('consumer_ka', { kind: 'salesReturn', number: 'CRN-1', lines: [line({ quantity: 100 })] });
    expect(summarize([credit]).cdnur).toHaveLength(1);
  });

  it('moves nil-rated supplies to table 8 by supply type', () => {
    const s = summarize([
      doc('registered', { number: 'A', lines: [line({ id: 'a', taxRate: 0 }), line({ id: 'b' })] }),
      doc('consumer_mh', { number: 'B', lines: [line({ taxRate: 0 })] }),
    ]);
    expect(s.b2b.map((r) => r.rate)).toEqual([18]);
    expect(s.b2cs).toHaveLength(0);
    expect(s.nil).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ supplyType: 'INTRB2B', nilRated: fromMajor('10000', 'INR') }),
        expect.objectContaining({ supplyType: 'INTRAB2C', nilRated: fromMajor('10000', 'INR') }),
      ]),
    );
    expect(s.totals.taxableValue).toEqual(fromMajor('30000', 'INR'));
  });

  it('summarises documents issued per series, counting cancelled ones', () => {
    const s = summarize([
      doc('registered', { number: 'INV-0003' }),
      doc('registered', { number: 'INV-0001' }),
      doc('registered', { number: 'INV-0002', status: 'cancelled' }),
      doc('registered', { number: 'INV-0009', status: 'draft' }),
      doc('registered', { kind: 'salesReturn', number: 'CRN-1' }),
    ]);
    expect(s.docs).toEqual([
      { nature: 'creditNote', series: 'CRN-', from: 'CRN-1', to: 'CRN-1', total: 1, cancelled: 0 },
      { nature: 'invoice', series: 'INV-', from: 'INV-0001', to: 'INV-0003', total: 3, cancelled: 1 },
    ]);
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

describe('GSTR-1 status, SEZ and branch state', () => {
  it('leaves a return awaiting approval out of every table and table 13, as the books and 3B do', () => {
    const sale = doc('registered');
    const pending = doc('registered', { kind: 'salesReturn', number: 'CRN-1', status: 'requested', lines: [line({ quantity: 2 })] });
    const s = summarize([sale, pending]);
    expect(s.cdnr).toHaveLength(0);
    expect(s.totals.taxableValue.minor).toBe(10_000_00);
    expect(s.docs.map((d) => d.nature)).toEqual(['invoice']);
  });

  it('flags a sale to an SEZ and keeps one without tax out of table 8', () => {
    const sez = party('sez', { taxId: '29AACFS1234P1ZH', gstRegistrationType: 'sez' });
    const s = gstr1Summary({
      company: COMPANY,
      documents: [doc('registered', { id: 'z', partyId: 'sez', placeOfSupplyStateCode: '29', lines: [line({ taxRate: 0 })] })],
      parties: [...PARTIES, sez],
      items: [],
      baseCurrency: 'INR',
      period: PERIOD,
    });
    expect(s.nil).toHaveLength(0);
    expect(s.b2b).toHaveLength(1);
    expect(s.b2b[0]).toMatchObject({ sez: true, rate: 0 });
  });

  it('reads each sale from its own branch’s state', () => {
    // A Karnataka branch selling inside Karnataka, in a Maharashtra company.
    const ka = doc('consumer_ka', { branchId: 'brn_ka', lines: [line({ quantity: 100 })] });
    const s = gstr1Summary({ company: COMPANY, documents: [ka], parties: PARTIES, items: [], baseCurrency: 'INR', period: PERIOD, homeStateOf: (d) => (d.branchId === 'brn_ka' ? '29' : undefined) });
    expect(s.b2cl).toHaveLength(0);
    expect(s.b2cs).toHaveLength(1);
    expect(s.b2cs[0].interState).toBe(false);
    expect(consolidateB2cs(s.b2cs, '27', 'INR')[0].supplyType).toBe('INTRA');
  });
});

describe('GSTR-1 and GST treatment', () => {
  it('reports cess in its own column, apart from IGST', () => {
    const s = summarize([doc('registered', { lines: [line({ gst: { cessRate: 12 } })] })]);
    expect(s.b2b[0].igst.minor).toBe(180000);
    expect(s.b2b[0].cess.minor).toBe(120000);
    expect(s.totals.tax.minor).toBe(300000);
    expect(s.hsn[0].igst.minor).toBe(180000);
    expect(s.hsn[0].cess.minor).toBe(120000);
  });

  it('flags a reverse-charge sale and leaves its tax out of the seller’s liability', () => {
    const s = summarize([doc('registered', { lines: [line({ gst: { reverseCharge: true } })] })]);
    expect(s.b2b[0].reverseCharge).toBe(true);
    expect(s.b2b[0].igst.minor).toBe(180000);
    expect(s.totals.tax.minor).toBe(0);
  });

  it('splits table 8 into nil-rated, exempt and non-GST', () => {
    const lines = [
      line({ id: 'a', gst: { supplyType: 'nil' }, taxRate: 0 }),
      line({ id: 'b', gst: { supplyType: 'exempt' }, taxRate: 0 }),
      line({ id: 'c', gst: { supplyType: 'nonGst' }, taxRate: 0, unitPrice: fromMajor('500', 'INR') }),
    ];
    const s = summarize([doc('registered', { lines })]);
    expect(s.b2b).toEqual([]);
    expect(s.nil).toEqual([
      expect.objectContaining({ supplyType: 'INTRB2B', nilRated: fromMajor('10000', 'INR'), exempt: fromMajor('10000', 'INR'), nonGst: fromMajor('5000', 'INR') }),
    ]);
  });

  it('leaves a reimbursement out of every table and the HSN summary', () => {
    const lines = [line(), line({ id: 'r', name: 'Port fees', hsnCode: '9967', gst: { reimbursement: true }, taxRate: 0 })];
    const s = summarize([doc('registered', { lines })]);
    expect(s.b2b.map((r) => r.rate)).toEqual([18]);
    expect(s.b2b[0].taxableValue.minor).toBe(1000000);
    expect(s.nil).toEqual([]);
    expect(s.hsn.map((h) => h.hsnCode)).toEqual(['39211900']);
  });

  it('reports the buyer’s GSTIN as it was when the invoice was issued', () => {
    const s = summarize([doc('registered', { partyGstin: '29AACFA1111P1ZH' })]);
    expect(s.b2b[0].gstin).toBe('29AACFA1111P1ZH');
  });
});

describe('GSTR-1 credit and debit notes', () => {
  it('reports a credit note as C and a debit note as D, counted against the totals each way', () => {
    const inv = doc('registered', { number: 'INV-1' });
    const cn = doc('registered', { kind: 'creditNote', number: 'CN-1', sourceDocumentId: inv.id, lines: [line({ quantity: 1 })] });
    const dn = doc('registered', { kind: 'debitNote', number: 'DBN-1', sourceDocumentId: inv.id, lines: [line({ quantity: 1, unitPrice: fromMajor('500', 'INR') })] });
    const s = summarize([inv, cn, dn]);
    expect(s.cdnr.map((r) => [r.number, r.noteType])).toEqual([
      ['CN-1', 'C'],
      ['DBN-1', 'D'],
    ]);
    // 10,000 − 1,000 + 500
    expect(s.totals.taxableValue.minor).toBe(950000);
    expect(s.docs.map((d) => d.nature).sort()).toEqual(['creditNote', 'debitNote', 'invoice']);
  });

  it('reports a direct note, raised against no one invoice, by the buyer it is issued to', () => {
    const registered = doc('registered', { kind: 'creditNote', number: 'CN-1', lines: [line({ quantity: 1 })] });
    const consumer = doc('consumer_ka', { kind: 'creditNote', number: 'CN-2', lines: [line({ quantity: 1 })] });
    const s = summarize([registered, consumer]);
    expect(s.cdnr.map((r) => [r.number, r.noteType])).toEqual([['CN-1', 'C']]);
    // A small unregistered note lowers B2CS, as its own value is all there is to go on.
    expect(s.cdnur).toEqual([]);
    expect(s.totals.taxableValue.minor).toBe(-200000);
  });

  it('carries the original invoice on a note row: the linked one, or the one a direct note names (RULES 6.24)', () => {
    const inv = doc('registered', { number: 'INV-7', date: '2026-08-10' });
    const linked = doc('registered', { kind: 'creditNote', number: 'CN-1', sourceDocumentId: inv.id, lines: [line({ quantity: 1 })] });
    const direct = doc('registered', { kind: 'creditNote', number: 'CN-2', noteGst: 'withGst', originalNumber: 'OLD/0042', originalDate: '2026-04-20', lines: [line({ quantity: 1 })] });
    const s = summarize([inv, linked, direct]);
    expect(s.cdnr.map((r) => [r.number, r.originalNumber, r.originalDate])).toEqual([
      ['CN-1', 'INV-7', '2026-08-10'],
      ['CN-2', 'OLD/0042', '2026-04-20'],
    ]);
  });

  it('leaves a financial note without GST out of every table and the totals (RULES 6.24)', () => {
    const inv = doc('registered');
    const financial = doc('registered', { kind: 'creditNote', number: 'CN-9', noteGst: 'noGst', lines: [line({ quantity: 1, gst: { supplyType: 'nonGst' } })] });
    const s = summarize([inv, financial]);
    expect(s.cdnr).toEqual([]);
    expect(s.b2cs).toEqual([]);
    expect(s.totals.taxableValue.minor).toBe(1000000);
    expect(s.docs.map((d) => d.nature)).toEqual(['invoice']);
  });

  it('leaves the HSN quantity alone for a value-only note', () => {
    const inv = doc('registered');
    const cn = doc('registered', { kind: 'creditNote', number: 'CN-1', sourceDocumentId: inv.id, lines: [line({ quantity: 1 })] });
    const s = summarize([inv, cn]);
    expect(s.hsn[0].quantity).toBe(10);
    expect(s.hsn[0].taxableValue.minor).toBe(900000);
  });

  it('puts an unregistered buyer’s note in CDNUR when the invoice it lowers was B2CL', () => {
    const big = doc('consumer_ka', { lines: [line({ quantity: 200 })] });
    const cn = doc('consumer_ka', { kind: 'creditNote', number: 'CN-1', sourceDocumentId: big.id, lines: [line({ quantity: 1 })] });
    const s = summarize([big, cn]);
    expect(s.b2cl).toHaveLength(1);
    expect(s.cdnur.map((r) => r.number)).toEqual(['CN-1']);
  });
});

describe('credit note deadline (s.34(2))', () => {
  it('is 30 November after the end of the financial year of the supply', () => {
    expect(creditNoteDeadline('2025-06-10')).toBe('2026-11-30');
    expect(creditNoteDeadline('2026-03-31')).toBe('2026-11-30');
    expect(creditNoteDeadline('2026-04-01')).toBe('2027-11-30');
  });
});
