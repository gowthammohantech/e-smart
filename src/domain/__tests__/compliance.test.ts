import {
  E_INVOICE_CANCEL_REASONS,
  EInvoiceContext,
  blockingIssues,
  buildIrpPayload,
  buildSignedQrPayload,
  canCancelEInvoice,
  cancelDeadline,
  claimsFor,
  computeIrn,
  eInvoiceDocTypeFor,
  eInvoiceSupplyTypeFor,
  fiscalYearCode,
  isEInvoiceApplicable,
  mainHsnCodeOf,
  parseSignedQrPayload,
  portalDate,
  portalDateTime,
  requiresCancelRemark,
  uqcFor,
  validateEInvoice,
} from '@/domain/eInvoice';
import {
  EWAY_CANCEL_REASONS,
  EWAY_MAX_DISTANCE_KM,
  canCancelEwayBill,
  canExtendEwayBill,
  canUpdatePartB,
  ewayBillStatusAt,
  extensionWindow,
  hoursUntilExpiry,
  isEwayBillRequired,
  validPincode,
  validVehicleNumber,
  validatePartA,
  validatePartB,
  validityDays,
  validUptoFor,
} from '@/domain/ewayBill';
import {
  ackNoFrom,
  cancelIrn,
  ewayBillNumberFrom,
  extendEwayBillAtPortal,
  submitInvoice,
} from '@/domain/irpAdapter';
import {
  Address,
  BusinessDocument,
  Company,
  ComplianceSettings,
  DocumentLine,
  EwayBill,
  EwayPlace,
  Item,
  Party,
} from '@/types';
import { fromMajor, zero } from '@/lib/money';
import { sha256Hex } from '@/lib/hash';

/* ------------------------------------------------------------------ */
/* Factories                                                           */
/* ------------------------------------------------------------------ */

const NOW = '2026-09-18T11:24:07.000Z';
const TODAY = '2026-09-18';

function address(over: Partial<Address> = {}): Address {
  return {
    line1: '14 Kalbadevi Road',
    city: 'Mumbai',
    state: 'Maharashtra',
    stateCode: '27',
    postalCode: '400002',
    country: 'India',
    ...over,
  };
}

function company(over: Partial<Company> = {}): Company {
  return {
    id: 'cmp',
    accountId: 'acc',
    name: 'Vertex Traders',
    legalName: 'Vertex Traders Private Limited',
    businessType: 'Wholesale / Trading',
    country: 'IN',
    baseCurrency: 'INR',
    address: address(),
    email: 'books@vertex.example',
    phone: '+91 22 4000 1000',
    fiscalYearStartMonth: 4,
    createdAt: '2024-04-01T00:00:00.000Z',
    ...over,
    taxRegistration: {
      regime: 'GST',
      identifier: '27AABCV1234F1Z5',
      identifierLabel: 'GSTIN',
      registered: true,
      placeOfSupplyStateCode: '27',
      ...over.taxRegistration,
    },
  };
}

function party(over: Partial<Party> = {}): Party {
  return {
    id: 'cus_1',
    companyId: 'cmp',
    kind: 'customer',
    name: 'Nandini Enterprises',
    code: 'CUS-001',
    taxId: '29AACFA9876P1ZK',
    email: 'accounts@nandini.example',
    phone: '+91 80 5000 2000',
    currency: 'INR',
    billingAddress: address({ city: 'Bengaluru', state: 'Karnataka', stateCode: '29', postalCode: '560001' }),
    openingBalance: zero('INR'),
    paymentTermsDays: 30,
    status: 'active',
    createdAt: '2025-04-01T00:00:00.000Z',
    ...over,
  };
}

function settings(over: Partial<ComplianceSettings> = {}): ComplianceSettings {
  return {
    companyId: 'cmp',
    eInvoiceEnabled: true,
    annualTurnover: fromMajor('80000000', 'INR'),
    eInvoiceTurnoverThreshold: fromMajor('50000000', 'INR'),
    reportingWindowDays: 30,
    autoGenerateEInvoiceOnFinalise: false,
    irpEnvironment: 'sandbox',
    ewayBillEnabled: true,
    ewayBillThreshold: fromMajor('50000', 'INR'),
    autoGenerateEwayBillOnFinalise: false,
    defaultDistanceKm: 120,
    defaultTransportMode: 'road',
    defaultVehicleType: 'regular',
    updatedAt: NOW,
    ...over,
  };
}

function line(over: Partial<DocumentLine> = {}): DocumentLine {
  return {
    id: 'ln1',
    itemId: 'itm_goods',
    name: 'Polypropylene sheet',
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

/** An inter-state B2B invoice that reports cleanly. */
function invoice(over: Partial<BusinessDocument> = {}): BusinessDocument {
  const lines = over.lines ?? [line()];
  const taxable = fromMajor('10000', 'INR');
  const tax = fromMajor('1800', 'INR');
  const grand = fromMajor('11800', 'INR');
  return {
    id: 'inv1',
    companyId: 'cmp',
    branchId: 'brn',
    kind: 'invoice',
    number: 'INV/26-27/0042',
    status: 'issued',
    partyId: 'cus_1',
    date: '2026-09-15',
    currency: 'INR',
    exchangeRate: 1,
    documentDiscountMode: 'percent',
    documentDiscountValue: 0,
    charges: zero('INR'),
    applyRoundOff: true,
    placeOfSupplyStateCode: '29',
    attachmentIds: [],
    createdBy: 'usr',
    createdAt: '2026-09-15T09:00:00.000Z',
    updatedAt: '2026-09-15T09:00:00.000Z',
    ...over,
    lines,
    totals: {
      subtotal: taxable,
      lineDiscount: zero('INR'),
      documentDiscount: zero('INR'),
      taxableAmount: taxable,
      taxLines: [
        {
          categoryId: 'tax_18',
          categoryName: 'GST 18%',
          rate: 18,
          taxableAmount: taxable,
          components: [{ type: 'IGST', label: 'IGST 18%', rate: 18, amount: tax }],
          totalTax: tax,
        },
      ],
      totalTax: tax,
      charges: zero('INR'),
      roundOff: zero('INR'),
      grandTotal: grand,
      grandTotalBase: grand,
      ...over.totals,
    },
  };
}

const ITEMS: Pick<Item, 'id' | 'type'>[] = [
  { id: 'itm_goods', type: 'goods' },
  { id: 'itm_service', type: 'service' },
];

function ctx(over: Partial<EInvoiceContext> = {}): EInvoiceContext {
  return {
    document: invoice(),
    company: company(),
    buyer: party(),
    settings: settings(),
    items: ITEMS,
    existingIrns: [],
    now: NOW,
    ...over,
  };
}

function place(over: Partial<EwayPlace> = {}): EwayPlace {
  return {
    legalName: 'Vertex Traders Private Limited',
    gstin: '27AABCV1234F1Z5',
    address1: '14 Kalbadevi Road',
    place: 'Mumbai',
    pincode: '400002',
    stateCode: '27',
    ...over,
  };
}

function ewb(over: Partial<EwayBill> = {}): EwayBill {
  const generatedAt = over.generatedAt ?? '2026-09-18T06:00:00.000Z';
  return {
    id: 'ewb1',
    companyId: 'cmp',
    branchId: 'brn',
    ewayBillNumber: '381027461523',
    documentId: 'inv1',
    documentKind: 'invoice',
    documentNumber: 'INV/26-27/0042',
    documentDate: '2026-09-15',
    docType: 'INV',
    supplyType: 'outward',
    subSupplyType: 'supply',
    transactionType: 1,
    partyId: 'cus_1',
    from: place(),
    to: place({ place: 'Bengaluru', pincode: '560001', stateCode: '29', gstin: '29AACFA9876P1ZK' }),
    consignmentValue: fromMajor('118000', 'INR'),
    taxableValue: fromMajor('100000', 'INR'),
    cgst: zero('INR'),
    sgst: zero('INR'),
    igst: fromMajor('18000', 'INR'),
    mainHsnCode: '39211900',
    itemCount: 1,
    transportMode: 'road',
    vehicleNumber: 'MH12AB1234',
    vehicleType: 'regular',
    distanceKm: 980,
    generatedAt,
    generatedBy: 'usr',
    validFrom: generatedAt,
    validUpto: validUptoFor(generatedAt, over.distanceKm ?? 980, over.vehicleType ?? 'regular'),
    status: 'active',
    partBUpdates: [],
    extensions: [],
    createdAt: generatedAt,
    updatedAt: generatedAt,
    ...over,
  };
}

/* ------------------------------------------------------------------ */
/* e-invoice applicability                                             */
/* ------------------------------------------------------------------ */

describe('e-invoice applicability (FRD 16)', () => {
  it('applies to a finalised B2B invoice', () => {
    const result = isEInvoiceApplicable(ctx());
    expect(result.applicable).toBe(true);
    expect(result.docType).toBe('INV');
    expect(result.supplyType).toBe('B2B');
  });

  it('reports a sales return as a credit note', () => {
    const result = isEInvoiceApplicable(
      ctx({ document: invoice({ kind: 'salesReturn', status: 'processed' }) }),
    );
    expect(result.applicable).toBe(true);
    expect(result.docType).toBe('CRN');
  });

  it('does not apply to a quotation, a delivery note or a purchase bill', () => {
    (['quote', 'delivery', 'purchaseBill'] as const).forEach((kind) => {
      expect(isEInvoiceApplicable(ctx({ document: invoice({ kind }) })).applicable).toBe(false);
    });
  });

  it('does not apply to a sale to an unregistered buyer', () => {
    const result = isEInvoiceApplicable(ctx({ buyer: party({ taxId: undefined }) }));
    expect(result.applicable).toBe(false);
    expect(result.reason).toMatch(/unregistered buyer/i);
  });

  it('does not apply when the seller is not registered for GST', () => {
    const c = company();
    c.taxRegistration!.registered = false;
    expect(isEInvoiceApplicable(ctx({ company: c })).reason).toMatch(/not registered/i);
  });

  it('does not apply under the composition scheme', () => {
    const c = company();
    c.taxRegistration!.compositionScheme = true;
    expect(isEInvoiceApplicable(ctx({ company: c })).reason).toMatch(/composition/i);
  });

  it('does not apply when turnover is below the threshold', () => {
    const s = settings({ annualTurnover: fromMajor('14000000', 'INR') });
    expect(isEInvoiceApplicable(ctx({ settings: s })).reason).toMatch(/threshold/i);
  });

  it('applies at exactly the turnover threshold', () => {
    const s = settings({ annualTurnover: fromMajor('50000000', 'INR') });
    expect(isEInvoiceApplicable(ctx({ settings: s })).applicable).toBe(true);
  });

  it('does not apply to a draft', () => {
    expect(isEInvoiceApplicable(ctx({ document: invoice({ status: 'draft' }) })).reason).toMatch(
      /finalised/i,
    );
  });

  it('does not apply when the module is switched off', () => {
    expect(isEInvoiceApplicable(ctx({ settings: settings({ eInvoiceEnabled: false }) })).reason).toMatch(
      /switched off/i,
    );
  });

  it('classifies an export with tax as EXPWP and one without as EXPWOP', () => {
    const foreign = party({ taxId: undefined, billingAddress: address({ country: 'United Arab Emirates' }) });
    expect(eInvoiceSupplyTypeFor(invoice(), foreign)).toBe('EXPWP');

    const zeroRated = invoice({
      totals: { ...invoice().totals, totalTax: zero('INR') },
    });
    expect(eInvoiceSupplyTypeFor(zeroRated, foreign)).toBe('EXPWOP');
  });

  it('treats place of supply 96 as an export', () => {
    expect(eInvoiceSupplyTypeFor(invoice({ placeOfSupplyStateCode: '96' }), party())).toBe('EXPWP');
  });

  it('maps only invoices and sales returns to a portal document type', () => {
    expect(eInvoiceDocTypeFor('invoice')).toBe('INV');
    expect(eInvoiceDocTypeFor('salesReturn')).toBe('CRN');
    expect(eInvoiceDocTypeFor('purchaseOrder')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* e-invoice validation                                                */
/* ------------------------------------------------------------------ */

describe('e-invoice validation (FRD 16)', () => {
  const codes = (c: EInvoiceContext) => validateEInvoice(c).map((i) => i.code);

  it('passes a well-formed B2B invoice with nothing blocking', () => {
    expect(blockingIssues(validateEInvoice(ctx()))).toHaveLength(0);
  });

  it('blocks a malformed seller GSTIN', () => {
    const c = company();
    c.taxRegistration!.identifier = 'NOTAGSTIN';
    expect(codes(ctx({ company: c }))).toContain('3028');
  });

  it('blocks a malformed buyer GSTIN on a B2B supply', () => {
    expect(codes(ctx({ buyer: party({ taxId: '29AACFA' }) }))).toContain('3029');
  });

  it('does not demand a buyer GSTIN on an export', () => {
    const foreign = party({ taxId: undefined, billingAddress: address({ country: 'Singapore' }) });
    expect(codes(ctx({ buyer: foreign }))).not.toContain('3029');
  });

  it('blocks a line with no HSN code and names the line', () => {
    const found = validateEInvoice(
      ctx({ document: invoice({ lines: [line(), line({ id: 'ln2', hsnCode: undefined })] }) }),
    ).find((i) => i.code === '2176');
    expect(found).toBeDefined();
    expect(found!.field).toBe('lines[1].hsnCode');
  });

  it('blocks an HSN code that is not 4, 6 or 8 digits', () => {
    expect(codes(ctx({ document: invoice({ lines: [line({ hsnCode: '392' })] }) }))).toContain('2176');
    expect(codes(ctx({ document: invoice({ lines: [line({ hsnCode: '3921' })] }) }))).not.toContain('2176');
    expect(codes(ctx({ document: invoice({ lines: [line({ hsnCode: '392119' })] }) }))).not.toContain('2176');
  });

  it('blocks a missing place of supply', () => {
    expect(codes(ctx({ document: invoice({ placeOfSupplyStateCode: undefined }) }))).toContain('2227');
  });

  it('blocks a place of supply that is not a known state code', () => {
    expect(codes(ctx({ document: invoice({ placeOfSupplyStateCode: '99' }) }))).toContain('2228');
  });

  it('blocks IGST charged on a supply within the state', () => {
    // Home state 27 supplying to 27, but the totals carry IGST.
    expect(codes(ctx({ document: invoice({ placeOfSupplyStateCode: '27' }) }))).toContain('2172');
  });

  it('blocks CGST and SGST charged on a supply across states', () => {
    const intra = invoice();
    intra.totals.taxLines = [
      {
        categoryId: 'tax_18',
        categoryName: 'GST 18%',
        rate: 18,
        taxableAmount: fromMajor('10000', 'INR'),
        components: [
          { type: 'CGST', label: 'CGST 9%', rate: 9, amount: fromMajor('900', 'INR') },
          { type: 'SGST', label: 'SGST 9%', rate: 9, amount: fromMajor('900', 'INR') },
        ],
        totalTax: fromMajor('1800', 'INR'),
      },
    ];
    expect(codes(ctx({ document: intra }))).toContain('2173');
  });

  it('accepts a declared total one rupee either side of the recomputed one', () => {
    [-100, 100].forEach((delta) => {
      const doc = invoice();
      doc.totals.grandTotal = { minor: doc.totals.grandTotal.minor + delta, currency: 'INR' };
      expect(codes(ctx({ document: doc }))).not.toContain('2182');
    });
  });

  it('blocks a declared total more than a rupee out', () => {
    const doc = invoice();
    doc.totals.grandTotal = { minor: doc.totals.grandTotal.minor + 101, currency: 'INR' };
    expect(codes(ctx({ document: doc }))).toContain('2182');
  });

  it('accepts the number format this app generates', () => {
    expect(codes(ctx())).not.toContain('2233');
  });

  it('accepts a document number of exactly sixteen characters', () => {
    expect(codes(ctx({ document: invoice({ number: 'INV/2026-27/0042' }) }))).not.toContain('2233');
  });

  it('blocks a document number longer than sixteen characters', () => {
    expect(codes(ctx({ document: invoice({ number: 'INV/2026-2027/00042' }) }))).toContain('2233');
  });

  it('blocks a document number starting with zero, slash or hyphen', () => {
    ['0INV/0001', '/INV/0001', '-INV/0001'].forEach((number) => {
      expect(codes(ctx({ document: invoice({ number }) }))).toContain('2233');
    });
  });

  it('blocks a document number containing a space or an underscore', () => {
    ['INV 0001', 'INV_0001'].forEach((number) => {
      expect(codes(ctx({ document: invoice({ number }) }))).toContain('2233');
    });
  });

  it('blocks a future-dated document', () => {
    expect(codes(ctx({ document: invoice({ date: '2026-09-19' }) }))).toContain('2234');
  });

  it('accepts a document dated today', () => {
    expect(codes(ctx({ document: invoice({ date: TODAY }) }))).not.toContain('2234');
  });

  it('accepts a document on the last day of the reporting window', () => {
    expect(codes(ctx({ document: invoice({ date: '2026-08-19' }) }))).not.toContain('2235');
  });

  it('blocks a document past the reporting window', () => {
    expect(codes(ctx({ document: invoice({ date: '2026-08-18' }) }))).toContain('2235');
  });

  it('honours a reporting window overridden in settings', () => {
    const c = ctx({ document: invoice({ date: '2026-09-10' }), settings: settings({ reportingWindowDays: 3 }) });
    expect(codes(c)).toContain('2235');
  });

  it('blocks a document with no lines', () => {
    expect(codes(ctx({ document: invoice({ lines: [] }) }))).toContain('2236');
  });

  it('blocks a line with no quantity', () => {
    expect(codes(ctx({ document: invoice({ lines: [line({ quantity: 0 })] }) }))).toContain('2237');
  });

  it('blocks a document number already registered this financial year', () => {
    const irn = computeIrn('27AABCV1234F1Z5', 'INV', 'INV/26-27/0042', '2026-27');
    expect(codes(ctx({ existingIrns: [irn] }))).toContain('2150');
  });

  it('warns without blocking on a unit the portal does not know', () => {
    const found = validateEInvoice(
      ctx({ document: invoice({ lines: [line({ unit: 'DAY' })] }) }),
    ).find((i) => i.code === 'W001');
    expect(found?.severity).toBe('warning');
    expect(blockingIssues(validateEInvoice(ctx({ document: invoice({ lines: [line({ unit: 'DAY' })] }) })))).toHaveLength(0);
  });

  it('warns when the buyer has neither email nor phone', () => {
    const found = validateEInvoice(
      ctx({ buyer: party({ email: undefined, phone: undefined }) }),
    ).find((i) => i.code === 'W002');
    expect(found?.severity).toBe('warning');
  });

  it('reports every blocking problem rather than stopping at the first', () => {
    const broken = invoice({
      number: 'INV 0001 THAT IS FAR TOO LONG',
      placeOfSupplyStateCode: undefined,
      lines: [line({ hsnCode: undefined })],
    });
    const found = blockingIssues(validateEInvoice(ctx({ document: broken }))).map((i) => i.code);
    expect(found).toEqual(expect.arrayContaining(['2176', '2227', '2233']));
  });

  it('maps app units onto portal unit codes', () => {
    expect(uqcFor('KG')).toBe('KGS');
    expect(uqcFor('PCS')).toBe('PCS');
    expect(uqcFor('DAY')).toBe('OTH');
  });
});

/* ------------------------------------------------------------------ */
/* IRN                                                                 */
/* ------------------------------------------------------------------ */

describe('IRN generation (FRD 16)', () => {
  it('is the SHA-256 of supplier GSTIN, document type, number and financial year', () => {
    expect(computeIrn('27AABCV1234F1Z5', 'INV', 'INV/26-27/0042', '2026-27')).toBe(
      sha256Hex('27AABCV1234F1Z5INVINV/26-27/00422026-27'),
    );
  });

  it('is 64 lowercase hexadecimal characters', () => {
    expect(computeIrn('27AABCV1234F1Z5', 'INV', 'INV/0001', '2026-27')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across repeated calls', () => {
    const a = computeIrn('27AABCV1234F1Z5', 'INV', 'INV/0001', '2026-27');
    const b = computeIrn('27AABCV1234F1Z5', 'INV', 'INV/0001', '2026-27');
    expect(a).toBe(b);
  });

  it('changes when only the document number changes', () => {
    expect(computeIrn('27AABCV1234F1Z5', 'INV', 'INV/0001', '2026-27')).not.toBe(
      computeIrn('27AABCV1234F1Z5', 'INV', 'INV/0002', '2026-27'),
    );
  });

  it('changes when only the financial year changes', () => {
    expect(computeIrn('27AABCV1234F1Z5', 'INV', 'INV/0001', '2026-27')).not.toBe(
      computeIrn('27AABCV1234F1Z5', 'INV', 'INV/0001', '2025-26'),
    );
  });

  it('changes when only the document type changes', () => {
    expect(computeIrn('27AABCV1234F1Z5', 'INV', 'INV/0001', '2026-27')).not.toBe(
      computeIrn('27AABCV1234F1Z5', 'CRN', 'INV/0001', '2026-27'),
    );
  });

  it('puts 31 March in the year that began the previous April', () => {
    expect(fiscalYearCode('2027-03-31')).toBe('2026-27');
  });

  it('puts 1 April in the new financial year', () => {
    expect(fiscalYearCode('2027-04-01')).toBe('2027-28');
  });
});

/* ------------------------------------------------------------------ */
/* Portal adapter                                                      */
/* ------------------------------------------------------------------ */

describe('the invoice registration portal (FRD 16)', () => {
  const payload = () => buildIrpPayload(ctx());

  it('returns an IRN, a sixteen-digit acknowledgement number and an acknowledgement date', () => {
    const res = submitInvoice({ payload: payload(), existingIrns: [], now: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.irn).toMatch(/^[0-9a-f]{64}$/);
    expect(res.ackNo).toMatch(/^[1-9][0-9]{15}$/);
    expect(res.ackDate).toBe('2026-09-18 11:24:07');
  });

  it('is deterministic for the same request', () => {
    const a = submitInvoice({ payload: payload(), existingIrns: [], now: NOW });
    const b = submitInvoice({ payload: payload(), existingIrns: [], now: NOW });
    expect(a).toEqual(b);
  });

  it('issues a different acknowledgement number at a different moment', () => {
    const a = submitInvoice({ payload: payload(), existingIrns: [], now: NOW });
    const b = submitInvoice({ payload: payload(), existingIrns: [], now: '2026-09-18T11:24:08.000Z' });
    expect(a.ok && b.ok && a.ackNo !== b.ackNo).toBe(true);
  });

  it('rejects a document number it has already registered', () => {
    const first = submitInvoice({ payload: payload(), existingIrns: [], now: NOW });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = submitInvoice({ payload: payload(), existingIrns: [first.irn], now: NOW });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.errors[0].code).toBe('2150');
  });

  it('surfaces an injected fault with the portal wording', () => {
    const res = submitInvoice({
      payload: payload(),
      existingIrns: [],
      now: NOW,
      simulation: { fail: '2211' },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0].message).toMatch(/not active/i);
  });

  it('never returns an IRN on a rejection', () => {
    const res = submitInvoice({
      payload: payload(),
      existingIrns: [],
      now: NOW,
      simulation: { fail: 'SIM001' },
    });
    expect('irn' in res).toBe(false);
  });

  it('derives a twelve-digit e-way bill number that is stable for a seed', () => {
    expect(ewayBillNumberFrom('seed')).toMatch(/^[1-9][0-9]{11}$/);
    expect(ewayBillNumberFrom('seed')).toBe(ewayBillNumberFrom('seed'));
    expect(ewayBillNumberFrom('seed')).not.toBe(ewayBillNumberFrom('other'));
  });

  it('acknowledges a cancellation with the reason it was given', () => {
    const res = cancelIrn({
      irn: 'a'.repeat(64),
      irnGeneratedAt: NOW,
      reasonCode: '3',
      now: '2026-09-18T15:00:00.000Z',
      simulation: undefined,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.reason).toBe('Order cancelled');
  });

  it('never produces a leading zero in an acknowledgement number', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(ackNoFrom(sha256Hex(`irn${i}`), NOW)[0]).not.toBe('0');
    }
  });
});

/* ------------------------------------------------------------------ */
/* Signed QR                                                           */
/* ------------------------------------------------------------------ */

describe('the signed QR payload (FRD 16)', () => {
  const irn = computeIrn('27AABCV1234F1Z5', 'INV', 'INV/26-27/0042', '2026-27');
  const claims = () => claimsFor(ctx(), irn, NOW);

  it('is a three-part JWS compact serialisation', () => {
    expect(buildSignedQrPayload(claims()).split('.')).toHaveLength(3);
  });

  it('carries the claims the portal specifies, under its own names', () => {
    const parsed = parseSignedQrPayload(buildSignedQrPayload(claims()));
    expect(parsed).toMatchObject({
      SellerGstin: '27AABCV1234F1Z5',
      BuyerGstin: '29AACFA9876P1ZK',
      DocNo: 'INV/26-27/0042',
      DocTyp: 'INV',
      DocDt: '15/09/2026',
      TotInvVal: 11800,
      ItemCnt: 1,
      MainHsnCode: '39211900',
      Irn: irn,
    });
  });

  it('formats the document date as dd/MM/yyyy and the IRN date as yyyy-MM-dd HH:mm:ss', () => {
    expect(portalDate('2026-09-15')).toBe('15/09/2026');
    expect(portalDateTime(NOW)).toBe('2026-09-18 11:24:07');
    expect(claims().IrnDt).toBe('2026-09-18 11:24:07');
  });

  it('reports the invoice value in rupees, not paise', () => {
    expect(claims().TotInvVal).toBe(11800);
  });

  it('omits the buyer GSTIN on an export to an unregistered buyer', () => {
    const foreign = party({ taxId: undefined, billingAddress: address({ country: 'Singapore' }) });
    const parsed = parseSignedQrPayload(
      buildSignedQrPayload(claimsFor(ctx({ buyer: foreign }), irn, NOW)),
    );
    expect(parsed).not.toHaveProperty('BuyerGstin');
  });

  it('uses the highest-value line for the main HSN code', () => {
    const doc = invoice({
      lines: [
        line({ id: 'a', hsnCode: '39211900', quantity: 1, unitPrice: fromMajor('100', 'INR') }),
        line({ id: 'b', hsnCode: '48025690', quantity: 1, unitPrice: fromMajor('900', 'INR') }),
      ],
    });
    expect(mainHsnCodeOf(doc)).toBe('48025690');
  });

  it('returns null for something that is not a signed payload', () => {
    expect(parseSignedQrPayload('not-a-jws')).toBeNull();
    expect(parseSignedQrPayload('a.b.c')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* e-invoice cancellation                                              */
/* ------------------------------------------------------------------ */

describe('e-invoice cancellation (FRD 16)', () => {
  const generated = {
    eInvoiceStatus: 'generated' as const,
    irn: 'a'.repeat(64),
    irnGeneratedAt: '2026-09-18T06:00:00.000Z',
  };

  it('allows cancellation a minute after the IRN was issued', () => {
    expect(canCancelEInvoice(generated, '2026-09-18T06:01:00.000Z').allowed).toBe(true);
  });

  it('allows cancellation at twenty-three hours fifty-nine', () => {
    expect(canCancelEInvoice(generated, '2026-09-19T05:59:00.000Z').allowed).toBe(true);
  });

  it('refuses cancellation at exactly twenty-four hours', () => {
    const result = canCancelEInvoice(generated, '2026-09-19T06:00:00.000Z');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/credit note/i);
  });

  it('refuses cancellation when no IRN exists', () => {
    expect(canCancelEInvoice({ eInvoiceStatus: 'pending' }, NOW).allowed).toBe(false);
  });

  it('refuses cancellation of an IRN already cancelled', () => {
    expect(
      canCancelEInvoice({ ...generated, eInvoiceStatus: 'cancelled' }, '2026-09-18T07:00:00.000Z').allowed,
    ).toBe(false);
  });

  it('reports the deadline as generation plus twenty-four hours', () => {
    expect(cancelDeadline('2026-09-18T06:00:00.000Z')).toBe('2026-09-19T06:00:00.000Z');
  });

  it('offers exactly the four reason codes the portal accepts', () => {
    expect(Object.keys(E_INVOICE_CANCEL_REASONS)).toEqual(['1', '2', '3', '4']);
  });

  it('asks for a remark only on "other"', () => {
    expect(requiresCancelRemark('4')).toBe(true);
    (['1', '2', '3'] as const).forEach((code) => expect(requiresCancelRemark(code)).toBe(false));
  });
});

/* ------------------------------------------------------------------ */
/* e-way bill requirement                                              */
/* ------------------------------------------------------------------ */

describe('e-way bill requirement (FRD 16)', () => {
  /** The base invoice is only worth 11,800, which is under the threshold. */
  const consignment = (over: Partial<BusinessDocument> = {}): BusinessDocument => {
    const doc = invoice(over);
    doc.totals.grandTotal = fromMajor('118000', 'INR');
    return doc;
  };

  const required = (doc: BusinessDocument, s = settings()) =>
    isEwayBillRequired({ document: doc, items: ITEMS, settings: s });

  it('is required for a finalised invoice of goods above the threshold', () => {
    expect(required(consignment()).required).toBe(true);
  });

  it('is required for a delivery note of goods', () => {
    expect(required(consignment({ kind: 'delivery', status: 'delivered' })).required).toBe(true);
  });

  it('is not required for a sales return or a purchase bill', () => {
    (['salesReturn', 'purchaseBill', 'goodsReceipt', 'quote'] as const).forEach((kind) => {
      expect(required(consignment({ kind, status: 'issued' })).required).toBe(false);
    });
  });

  it('is not required for a services-only invoice', () => {
    const services = consignment({ lines: [line({ itemId: 'itm_service' })] });
    const result = required(services);
    expect(result.required).toBe(false);
    expect(result.reason).toMatch(/no goods/i);
  });

  it('is required when at least one line is goods', () => {
    const mixed = consignment({
      lines: [line({ itemId: 'itm_service' }), line({ id: 'b', itemId: 'itm_goods' })],
    });
    expect(required(mixed).required).toBe(true);
  });

  it('is not required at exactly fifty thousand rupees', () => {
    const doc = consignment();
    doc.totals.grandTotal = fromMajor('50000', 'INR');
    expect(required(doc).required).toBe(false);
  });

  it('is required one paisa above fifty thousand rupees', () => {
    const doc = consignment();
    doc.totals.grandTotal = { minor: fromMajor('50000', 'INR').minor + 1, currency: 'INR' };
    expect(required(doc).required).toBe(true);
  });

  it('honours a threshold overridden in settings', () => {
    // Maharashtra sets its intra-state threshold at a lakh rather than 50,000.
    const maharashtra = settings({ ewayBillThreshold: fromMajor('200000', 'INR') });
    expect(required(consignment(), maharashtra).required).toBe(false);
  });

  it('is not required for a draft or a cancelled document', () => {
    expect(required(consignment({ status: 'draft' })).required).toBe(false);
    expect(required(consignment({ status: 'cancelled' })).required).toBe(false);
  });

  it('is not required when the module is switched off', () => {
    expect(required(consignment(), settings({ ewayBillEnabled: false })).reason).toMatch(
      /switched off/i,
    );
  });
});

/* ------------------------------------------------------------------ */
/* e-way bill validity                                                 */
/* ------------------------------------------------------------------ */

describe('e-way bill validity (FRD 16)', () => {
  it('gives one day for a single kilometre', () => {
    expect(validityDays(1, 'regular')).toBe(1);
  });

  it('gives one day for exactly 200 km and two for 201 km', () => {
    expect(validityDays(200, 'regular')).toBe(1);
    expect(validityDays(201, 'regular')).toBe(2);
  });

  it('gives two days for exactly 400 km and three for 401 km', () => {
    expect(validityDays(400, 'regular')).toBe(2);
    expect(validityDays(401, 'regular')).toBe(3);
  });

  it('gives one day for exactly 20 km of over-dimensional cargo and two for 21 km', () => {
    expect(validityDays(20, 'overDimensional')).toBe(1);
    expect(validityDays(21, 'overDimensional')).toBe(2);
  });

  it('gives 59 days for 1,180 km of over-dimensional cargo', () => {
    expect(validityDays(1180, 'overDimensional')).toBe(59);
  });

  it('gives at least one day for a zero or negative distance', () => {
    expect(validityDays(0, 'regular')).toBe(1);
    expect(validityDays(-40, 'regular')).toBe(1);
    expect(validityDays(NaN, 'regular')).toBe(1);
  });

  it('expires at the last instant of the final day', () => {
    expect(validUptoFor('2026-09-18T10:00:00.000Z', 150, 'regular')).toBe('2026-09-19T23:59:59.999Z');
  });

  it('adds one whole day per 200 km on top of the day of generation', () => {
    expect(validUptoFor('2026-09-18T10:00:00.000Z', 340, 'regular')).toBe('2026-09-20T23:59:59.999Z');
  });

  it('expires at the same moment whether raised at 00:10 or at 23:50', () => {
    // Rule 138(10) counts whole days, so the time of day is deliberately ignored.
    const early = validUptoFor('2026-09-18T00:10:00.000Z', 150, 'regular');
    const late = validUptoFor('2026-09-18T23:50:00.000Z', 150, 'regular');
    expect(early).toBe(late);
  });
});

describe('e-way bill status (FRD 16)', () => {
  const bill = ewb({ generatedAt: '2026-09-18T06:00:00.000Z', distanceKm: 150 });

  it('is active a second before expiry', () => {
    expect(ewayBillStatusAt(bill, '2026-09-19T23:59:58.000Z')).toBe('active');
  });

  it('is active at exactly the expiry instant', () => {
    expect(ewayBillStatusAt(bill, bill.validUpto)).toBe('active');
  });

  it('is expired a millisecond later', () => {
    expect(ewayBillStatusAt(bill, '2026-09-20T00:00:00.000Z')).toBe('expired');
  });

  it('is cancelled once cancelled, whether or not it has expired', () => {
    const cancelled = ewb({ ...bill, status: 'cancelled' });
    expect(ewayBillStatusAt(cancelled, '2026-09-18T07:00:00.000Z')).toBe('cancelled');
    expect(ewayBillStatusAt(cancelled, '2026-09-25T07:00:00.000Z')).toBe('cancelled');
  });

  it('counts down the hours to expiry and goes negative afterwards', () => {
    expect(hoursUntilExpiry(bill, '2026-09-19T23:59:59.999Z')).toBeCloseTo(0, 5);
    expect(hoursUntilExpiry(bill, '2026-09-20T05:59:59.999Z')).toBeCloseTo(-6, 5);
  });
});

describe('e-way bill extension (FRD 16)', () => {
  const bill = ewb({ generatedAt: '2026-09-18T06:00:00.000Z', distanceKm: 150 });
  // validUpto is 2026-09-19T23:59:59.999Z, so the window runs 15:59:59.999
  // on the 19th to 07:59:59.999 on the 20th.

  it('opens exactly eight hours before expiry', () => {
    expect(canExtendEwayBill(bill, '2026-09-19T15:59:59.999Z').allowed).toBe(true);
  });

  it('is shut a second before the window opens', () => {
    const result = canExtendEwayBill(bill, '2026-09-19T15:59:58.000Z');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/eight hours before/i);
  });

  it('is still open exactly eight hours after expiry', () => {
    expect(canExtendEwayBill(bill, '2026-09-20T07:59:59.999Z').allowed).toBe(true);
  });

  it('is shut a second after the window closes', () => {
    expect(canExtendEwayBill(bill, '2026-09-20T08:00:01.000Z').allowed).toBe(false);
  });

  it('refuses to extend a cancelled bill', () => {
    const cancelled = ewb({ ...bill, status: 'cancelled' });
    expect(canExtendEwayBill(cancelled, '2026-09-19T20:00:00.000Z').allowed).toBe(false);
  });

  it('reports the window it will accept', () => {
    const window = extensionWindow(bill);
    expect(window.opensAt).toBe('2026-09-19T15:59:59.999Z');
    expect(window.closesAt).toBe('2026-09-20T07:59:59.999Z');
  });

  it('recomputes validity from the remaining distance, not the original', () => {
    // The original journey was 150 km; only 60 km of it is left to cover.
    const res = extendEwayBillAtPortal({
      bill,
      remainingDistanceKm: 60,
      reasonCode: '3',
      now: '2026-09-20T04:00:00.000Z',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.newValidUpto).toBe('2026-09-21T23:59:59.999Z');
  });

  it('refuses an extension outside the window', () => {
    const res = extendEwayBillAtPortal({
      bill,
      remainingDistanceKm: 60,
      reasonCode: '3',
      now: '2026-09-25T04:00:00.000Z',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0].field).toBe('validUpto');
  });
});

describe('e-way bill cancellation (FRD 16)', () => {
  const bill = ewb({ generatedAt: '2026-09-18T06:00:00.000Z' });

  it('is allowed within twenty-four hours of generation', () => {
    expect(canCancelEwayBill(bill, '2026-09-19T05:59:00.000Z').allowed).toBe(true);
  });

  it('is refused at exactly twenty-four hours', () => {
    expect(canCancelEwayBill(bill, '2026-09-19T06:00:00.000Z').allowed).toBe(false);
  });

  it('is refused when the bill is already cancelled', () => {
    expect(canCancelEwayBill(ewb({ ...bill, status: 'cancelled' }), '2026-09-18T07:00:00.000Z').allowed).toBe(
      false,
    );
  });

  it('offers exactly the four reason codes the portal accepts', () => {
    expect(Object.keys(EWAY_CANCEL_REASONS)).toEqual(['1', '2', '3', '4']);
  });
});

describe('e-way bill Part-B (FRD 16)', () => {
  const partB = (over: Partial<Parameters<typeof validatePartB>[0]> = {}) =>
    validatePartB({
      transportMode: 'road',
      vehicleNumber: 'MH12AB1234',
      vehicleType: 'regular',
      distanceKm: 340,
      now: NOW,
      ...over,
    }).map((i) => i.field);

  it('accepts a well-formed road consignment', () => {
    expect(partB()).toHaveLength(0);
  });

  it('requires a vehicle number for road transport', () => {
    expect(partB({ vehicleNumber: undefined })).toContain('vehicleNumber');
  });

  it('requires a transport document for rail, air and ship', () => {
    (['rail', 'air', 'ship'] as const).forEach((mode) => {
      const fields = partB({ transportMode: mode, vehicleNumber: undefined });
      expect(fields).toContain('transportDocNumber');
      expect(fields).toContain('transportDocDate');
    });
  });

  it('rejects a vehicle number on a rail consignment', () => {
    const fields = partB({
      transportMode: 'rail',
      transportDocNumber: 'RR/2026/887',
      transportDocDate: '2026-09-17',
    });
    expect(fields).toContain('vehicleNumber');
  });

  it('rejects a future-dated transport document', () => {
    const fields = partB({
      transportMode: 'air',
      vehicleNumber: undefined,
      transportDocNumber: 'AWB-4412',
      transportDocDate: '2026-09-30',
    });
    expect(fields).toContain('transportDocDate');
  });

  it('rejects a transporter ID that is not fifteen characters', () => {
    expect(partB({ transporterId: '27AABCV1234' })).toContain('transporterId');
  });

  it('rejects a distance below one kilometre or above the portal cap', () => {
    expect(partB({ distanceKm: 0 })).toContain('distanceKm');
    expect(partB({ distanceKm: EWAY_MAX_DISTANCE_KM + 1 })).toContain('distanceKm');
    expect(partB({ distanceKm: EWAY_MAX_DISTANCE_KM })).not.toContain('distanceKm');
  });

  it('accepts the registration formats the portal takes', () => {
    ['MH12AB1234', 'MH12A1234', 'MH121234', 'KA01MJ7788'].forEach((v) => {
      expect(validVehicleNumber(v)).toBeUndefined();
    });
  });

  it('rejects a lowercase, spaced or hyphenated registration', () => {
    expect(validVehicleNumber('mh12ab1234')).toMatch(/capital/i);
    expect(validVehicleNumber('MH 12 AB 1234')).toMatch(/without spaces/i);
    expect(validVehicleNumber('MH-12-AB-1234')).toMatch(/without spaces/i);
  });

  it('refuses a Part-B update on a cancelled or expired bill', () => {
    const bill = ewb({ generatedAt: '2026-09-18T06:00:00.000Z', distanceKm: 150 });
    expect(canUpdatePartB(ewb({ ...bill, status: 'cancelled' }), NOW).allowed).toBe(false);
    expect(canUpdatePartB(bill, '2026-09-25T00:00:00.000Z').allowed).toBe(false);
    expect(canUpdatePartB(bill, '2026-09-19T00:00:00.000Z').allowed).toBe(true);
  });
});

describe('e-way bill Part-A (FRD 16)', () => {
  const partA = (over: Partial<Parameters<typeof validatePartA>[0]> = {}) =>
    validatePartA({
      from: place(),
      to: place({ place: 'Bengaluru', pincode: '560001', stateCode: '29', gstin: '29AACFA9876P1ZK' }),
      subSupplyType: 'supply',
      documentNumber: 'INV/26-27/0042',
      documentDate: '2026-09-15',
      consignmentValueMinor: 11800000,
      mainHsnCode: '39211900',
      ...over,
    }).map((i) => i.field);

  it('accepts a well-formed Part-A', () => {
    expect(partA()).toHaveLength(0);
  });

  it('accepts URP in place of a GSTIN for an unregistered party', () => {
    expect(partA({ to: place({ gstin: 'URP', stateCode: '29' }) })).toHaveLength(0);
  });

  it('rejects a malformed GSTIN', () => {
    expect(partA({ to: place({ gstin: 'NOPE', stateCode: '29' }) })).toContain('to.gstin');
  });

  it('accepts a six-digit PIN code and rejects a short, long or zero-leading one', () => {
    expect(validPincode('560001')).toBeUndefined();
    expect(validPincode('56001')).toBeDefined();
    expect(validPincode('5600012')).toBeDefined();
    expect(validPincode('060001')).toBeDefined();
  });

  it('demands a description when the sub-supply type is "others"', () => {
    expect(partA({ subSupplyType: 'others' })).toContain('subSupplyDescription');
    expect(partA({ subSupplyType: 'others', subSupplyDescription: 'Sample despatch' })).toHaveLength(0);
  });

  it('demands a consignment value above zero and an HSN code', () => {
    expect(partA({ consignmentValueMinor: 0 })).toContain('consignmentValue');
    expect(partA({ mainHsnCode: undefined })).toContain('mainHsnCode');
  });

  it('demands a known state code at both ends', () => {
    expect(partA({ from: place({ stateCode: '99' }) })).toContain('from.stateCode');
  });
});
