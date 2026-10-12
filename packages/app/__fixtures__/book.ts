import type { BusinessDocument, Company, DocumentLine, Item, NumberingSeries, Party, Payment, TaxCategory } from '@esmart/core/types';
import { calculateDocument } from '@esmart/core/domain/lineCalc';
import { DEFAULT_PREFIXES, defaultSeries } from '@esmart/core/domain/numbering';
import { fromMajor, zero } from '@esmart/core/lib/money';
import { emptyData, type AppData } from '../store/appStore';

/**
 * A small, fixed set of books for tests: one GST-registered company in
 * Maharashtra with a primary branch, its owner, a customer with a GSTIN, two
 * items, an issued invoice with a payment against it, and a draft invoice.
 * The store never holds anything but what the API sent, so tests build their
 * state from this instead of a bundled demo dataset.
 */
export const BOOK = { companyId: 'cmp_test', branchId: 'brn_main', userId: 'usr_owner', customerId: 'cus_acme', supplierId: 'sup_parts' } as const;

const ADDRESS = { line1: '1 Market Road', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', postalCode: '400001', country: 'IN' };
const CREATED = '2026-04-01T00:00:00.000Z';

export function company(over: Partial<Company> = {}): Company {
  return {
    id: BOOK.companyId,
    accountId: 'acct_test',
    name: 'Test Traders',
    legalName: 'Test Traders Pvt Ltd',
    businessType: 'wholesale',
    country: 'IN',
    baseCurrency: 'INR',
    address: ADDRESS,
    taxRegistration: { regime: 'GST', identifier: '27AABCV1234F1ZO', identifierLabel: 'GSTIN', registered: true, placeOfSupplyStateCode: '27' },
    fiscalYearStartMonth: 4,
    plan: 'pro',
    createdAt: CREATED,
    ...over,
  };
}

const tax18: TaxCategory = { id: 'tax_18', companyId: BOOK.companyId, name: 'GST 18%', rate: 18, type: 'GST', effectiveFrom: '2017-07-01' };

const items: Item[] = [
  { id: 'itm_bearing', companyId: BOOK.companyId, sku: 'BRG-6203', name: 'Ball bearing 6203', type: 'goods', unit: 'pcs', salePrice: fromMajor('150', 'INR'), purchasePrice: fromMajor('110', 'INR'), taxCategoryId: 'tax_18', hsnCode: '84821011', barcode: '8901234567890', trackInventory: true, openingStock: 100, reorderLevel: 20, status: 'active', createdAt: CREATED },
  { id: 'itm_service', companyId: BOOK.companyId, sku: 'SVC-FIT', name: 'Fitting service', type: 'service', unit: 'NOS', salePrice: fromMajor('800', 'INR'), purchasePrice: zero('INR'), taxCategoryId: 'tax_18', hsnCode: '998719', trackInventory: false, openingStock: 0, reorderLevel: 0, status: 'active', createdAt: CREATED },
];

const parties: Party[] = [
  { id: BOOK.customerId, companyId: BOOK.companyId, kind: 'customer', name: 'Acme Retail', code: 'C-001', taxId: '27AABCT5512M1Z6', currency: 'INR', billingAddress: ADDRESS, openingBalance: zero('INR'), paymentTermsDays: 30, status: 'active', createdAt: CREATED },
  { id: BOOK.supplierId, companyId: BOOK.companyId, kind: 'supplier', name: 'Parts Supply Co', code: 'S-001', currency: 'INR', billingAddress: ADDRESS, openingBalance: zero('INR'), paymentTermsDays: 15, status: 'active', createdAt: CREATED },
];

function line(item: Item, quantity: number): DocumentLine {
  return { id: `ln_${item.id}`, itemId: item.id, name: item.name, hsnCode: item.hsnCode, quantity, unit: item.unit, unitPrice: item.salePrice, discountMode: 'percent', discountValue: 0, taxCategoryId: 'tax_18', taxRate: 18, taxInclusive: false };
}

function invoice(id: string, number: string, status: BusinessDocument['status'], lines: DocumentLine[]): BusinessDocument {
  return {
    id,
    companyId: BOOK.companyId,
    branchId: BOOK.branchId,
    kind: 'invoice',
    number,
    status,
    partyId: BOOK.customerId,
    date: '2026-09-01',
    dueDate: '2026-10-01',
    currency: 'INR',
    exchangeRate: 1,
    lines,
    documentDiscountMode: 'percent',
    documentDiscountValue: 0,
    charges: zero('INR'),
    applyRoundOff: true,
    placeOfSupplyStateCode: '27',
    attachmentIds: [],
    totals: calculateDocument({
      lines,
      currency: 'INR',
      baseCurrency: 'INR',
      exchangeRate: 1,
      documentDiscountMode: 'percent',
      documentDiscountValue: 0,
      charges: zero('INR'),
      applyRoundOff: true,
      taxCategories: [tax18],
      taxContext: { regime: 'GST', homeStateCode: '27', placeOfSupplyStateCode: '27', registered: true },
    }),
    createdBy: BOOK.userId,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  };
}

/** The test book as the store holds it after a sign-in. */
export function buildTestBook(): AppData {
  const issued = invoice('inv_issued', 'INV/26-27/0001', 'issued', [line(items[0], 10), line(items[1], 2)]);
  const draft = invoice('inv_draft', 'INVOICE-DRAFT', 'draft', [line(items[0], 4)]);
  const payment: Payment = {
    id: 'pay_1',
    companyId: BOOK.companyId,
    branchId: BOOK.branchId,
    number: 'PAY/26-27/0001',
    direction: 'received',
    partyId: BOOK.customerId,
    date: '2026-09-10',
    amount: fromMajor('1000', 'INR'),
    currency: 'INR',
    exchangeRate: 1,
    method: 'upi',
    accountId: 'acc_bank',
    allocations: [{ documentId: issued.id, documentNumber: issued.number, amount: fromMajor('1000', 'INR') }],
    unallocated: zero('INR'),
    attachmentIds: [],
    createdBy: BOOK.userId,
    createdAt: '2026-09-10T10:00:00.000Z',
  };
  const series: NumberingSeries[] = (['invoice', 'payment'] as const).map((kind) => ({ ...defaultSeries(BOOK.companyId, kind, DEFAULT_PREFIXES[kind]), id: `series_${kind}`, nextNumber: 2 }));
  return {
    ...emptyData(),
    accountId: 'acct_test',
    users: [{ id: BOOK.userId, accountId: 'acct_test', name: 'Asha Rao', email: 'asha@example.in', role: 'owner', companyIds: [BOOK.companyId], branchIds: [BOOK.branchId], avatarColor: '#007AFF', status: 'active' }],
    companies: [company()],
    branches: [{ id: BOOK.branchId, companyId: BOOK.companyId, name: 'Head office', code: 'HO', address: ADDRESS, isPrimary: true }],
    parties,
    items,
    taxCategories: [tax18],
    paymentAccounts: [{ id: 'acc_bank', companyId: BOOK.companyId, name: 'Current account', type: 'bank', currency: 'INR', openingBalance: zero('INR'), isDefault: true }],
    numberingSeries: series,
    documents: [issued, draft],
    payments: [payment],
  };
}
