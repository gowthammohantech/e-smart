/** Shared fixtures for the GST suites: one seller, a few buyers, one invoice. */

import { calculateDocument } from '@/domain/lineCalc';
import { fromMajor, zero } from '@/lib/money';
import {
  BusinessDocument,
  Company,
  DocumentLine,
  Item,
  Party,
  TaxCategory,
} from '@/types';

export const TAX_CATEGORIES: TaxCategory[] = [
  { id: 'tax_18', companyId: 'co_1', name: 'GST 18%', rate: 18, type: 'GST', effectiveFrom: '2017-07-01' },
  { id: 'tax_5', companyId: 'co_1', name: 'GST 5%', rate: 5, type: 'GST', effectiveFrom: '2017-07-01' },
];

/** Both GSTINs below carry real check digits. */
export const SELLER_GSTIN = '27AAPFU0939F1ZV';
export const BUYER_MH_GSTIN = '27AACCM1234C1Z2';
export const BUYER_KA_GSTIN = '29AACCM1234C1ZY';

export function company(over: Partial<Company> = {}): Company {
  return {
    id: 'co_1',
    accountId: 'acc_1',
    name: 'Vertex Traders',
    legalName: 'Vertex Traders Private Limited',
    businessType: 'Wholesale / Trading',
    country: 'IN',
    baseCurrency: 'INR',
    address: {
      line1: '14 Marol Industrial Estate',
      city: 'Mumbai',
      state: 'Maharashtra',
      stateCode: '27',
      postalCode: '400059',
      country: 'India',
    },
    email: 'books@vertex.example',
    phone: '+91 22 2820 1100',
    taxRegistration: {
      regime: 'GST',
      identifier: SELLER_GSTIN,
      identifierLabel: 'GSTIN',
      registered: true,
      placeOfSupplyStateCode: '27',
      turnoverSlab: '10crTo50cr',
      eInvoiceEnabled: true,
      eWayBillEnabled: true,
    },
    fiscalYearStartMonth: 4,
    createdAt: '2024-04-01T00:00:00.000Z',
    ...over,
  };
}

export function party(over: Partial<Party> = {}): Party {
  return {
    id: 'cus_1',
    companyId: 'co_1',
    name: 'Meridian Hardware',
    code: 'C-001',
    taxId: BUYER_MH_GSTIN,
    gstRegistrationType: 'regular',
    email: 'accounts@meridian.example',
    phone: '+91 22 4000 1000',
    billingAddress: {
      line1: '21 Lamington Road',
      city: 'Mumbai',
      state: 'Maharashtra',
      stateCode: '27',
      postalCode: '400007',
      country: 'India',
    },
    openingBalance: zero('INR'),
    paymentTermsDays: 30,
    status: 'active',
    createdAt: '2024-04-01T00:00:00.000Z',
    ...over,
  };
}

export const ITEMS: Item[] = [
  {
    id: 'itm_1',
    companyId: 'co_1',
    sku: 'VT-1001',
    name: 'Brass hinge 4 inch',
    type: 'goods',
    unit: 'PCS',
    salePrice: fromMajor('250', 'INR'),
    taxCategoryId: 'tax_18',
    hsnCode: '830210',
    status: 'active',
    createdAt: '2024-04-01T00:00:00.000Z',
  },
  {
    id: 'itm_2',
    companyId: 'co_1',
    sku: 'VT-9001',
    name: 'Installation service',
    type: 'service',
    unit: 'HR',
    salePrice: fromMajor('800', 'INR'),
    taxCategoryId: 'tax_18',
    hsnCode: '995461',
    status: 'active',
    createdAt: '2024-04-01T00:00:00.000Z',
  },
];

export function line(over: Partial<DocumentLine> = {}): DocumentLine {
  return {
    id: 'ln_1',
    itemId: 'itm_1',
    name: 'Brass hinge 4 inch',
    hsnCode: '830210',
    quantity: 100,
    unit: 'PCS',
    unitPrice: fromMajor('250', 'INR'),
    discountMode: 'percent',
    discountValue: 0,
    taxCategoryId: 'tax_18',
    taxRate: 18,
    taxInclusive: false,
    ...over,
  };
}

export function invoice(
  over: Partial<BusinessDocument> = {},
  opts: { placeOfSupply?: string } = {},
): BusinessDocument {
  const lines = over.lines ?? [line()];
  const homeState = '27';
  const placeOfSupply = opts.placeOfSupply ?? over.placeOfSupplyStateCode ?? homeState;

  const totals = calculateDocument({
    lines,
    currency: 'INR',
    documentDiscountMode: 'percent',
    documentDiscountValue: 0,
    charges: zero('INR'),
    applyRoundOff: true,
    taxCategories: TAX_CATEGORIES,
    taxContext: {
      regime: 'GST',
      homeStateCode: homeState,
      placeOfSupplyStateCode: placeOfSupply,
      registered: true,
    },
  });

  return {
    id: 'doc_1',
    companyId: 'co_1',
    branchId: 'br_1',
    kind: 'invoice',
    number: 'INV/2026-27/0001',
    status: 'issued',
    partyId: 'cus_1',
    date: '2026-09-18',
    dueDate: '2026-10-18',
    lines,
    documentDiscountMode: 'percent',
    documentDiscountValue: 0,
    charges: zero('INR'),
    applyRoundOff: true,
    placeOfSupplyStateCode: placeOfSupply,
    attachmentIds: [],
    totals,
    createdBy: 'usr_1',
    createdAt: '2026-09-18T09:00:00.000Z',
    updatedAt: '2026-09-18T09:00:00.000Z',
    ...over,
  };
}
