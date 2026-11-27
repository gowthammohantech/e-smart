import { guessColumns, partiesFromCsv, type ImportField } from '@esmart/core/domain/partyImport';
import { guessItemColumns, itemsFromCsv, type ItemImportField } from '@esmart/core/domain/itemImport';
import { squashHeader } from '@esmart/core/lib/csv';
import { toMajor, type Money } from '@esmart/core/lib/money';
import { api } from './api';
import { col, financialYearStart, inChunks, shape, withoutExamples, type Entity, type Field, type Mapping } from './kit';
import { EXPENSES, JOURNALS, OPENINGS, PAYMENTS, PURCHASES, SALES, needs } from './transactions';

export * from './kit';

const CONTACT_FIELDS: Field[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'kind', label: 'Type (Customer / Supplier)' },
  { key: 'displayName', label: 'Display name' },
  { key: 'code', label: 'Code' },
  { key: 'taxId', label: 'GSTIN' },
  { key: 'pan', label: 'PAN' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'line1', label: 'Address line 1' },
  { key: 'line2', label: 'Address line 2' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postalCode', label: 'PIN code' },
  { key: 'country', label: 'Country' },
  { key: 'openingBalance', label: 'Opening balance' },
  { key: 'openingSide', label: 'Dr / Cr' },
  { key: 'creditLimit', label: 'Credit limit' },
  { key: 'paymentTermsDays', label: 'Credit days' },
  { key: 'notes', label: 'Notes' },
];

const ITEM_FIELDS: Field[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'sku', label: 'SKU / item code' },
  { key: 'type', label: 'Type (Goods / Service)' },
  { key: 'unit', label: 'Unit' },
  { key: 'salePrice', label: 'Sale price' },
  { key: 'purchasePrice', label: 'Purchase price' },
  { key: 'taxRate', label: 'GST %' },
  { key: 'hsnCode', label: 'HSN / SAC' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'openingStock', label: 'Opening stock' },
  { key: 'reorderLevel', label: 'Reorder level' },
  { key: 'description', label: 'Description' },
];

export const CONTACTS: Entity = {
  id: 'contacts',
  group: 'Masters',
  title: 'Customers & suppliers',
  blurb: 'Names, GSTIN, contact details, addresses and opening balances.',
  sheetName: 'Contacts',
  fields: CONTACT_FIELDS,
  nameHint: /customer|supplier|vendor|party|parties|contact|ledger|debtor|creditor/i,
  signature: ['name'],
  template: {
    name: 'Contacts',
    columns: [
      col('Type', 'Customer', 'Customer, Supplier, Both or General. Left blank, a row is a customer.', { options: ['Customer', 'Supplier', 'Both', 'General'] }),
      col('Name', '(example) Sharma Traders', 'Required. The business or person’s name.', { required: true, width: 28 }),
      col('Display Name', '', 'A shorter name to show on documents.'),
      col('Code', '', 'Leave blank and a code is assigned.'),
      col('GSTIN', '27AABCV1234F1ZO', '15 characters. State and PAN fill in from it.', { width: 20 }),
      col('PAN', '', '10 characters, like AABCV1234F.'),
      col('Email', 'accounts@sharma.example', 'One email address.', { width: 26 }),
      col('Phone', '9876543210', 'Mobile or landline.'),
      col('Address Line 1', '12 Market Road', 'Street address.', { width: 24 }),
      col('Address Line 2', '', 'Area or landmark.'),
      col('City', 'Pune', 'City or town.'),
      col('State', 'Maharashtra', 'State name, or its two-letter code.', { width: 18 }),
      col('PIN Code', '411001', '6 digits.'),
      col('Country', 'IN', 'Left blank, India.'),
      col('Opening Balance', '25000', 'What stood open when you start in Elixir Books. Use this, or the Outstanding invoices sheet, not both.'),
      col('Dr/Cr', 'Dr', 'Dr: they owe you. Cr: you owe them.', { options: ['Dr', 'Cr'] }),
      col('Credit Limit', '100000', 'The most you allow them to owe.'),
      col('Credit Days', '30', 'Days they have to pay.'),
      col('Notes', '', 'Anything else worth keeping.', { width: 28 }),
    ],
  },
  guess: (header) => guessColumns(header) as Mapping,
  parse(rows, mapping, ctx) {
    const { rows: clean, lineOf } = withoutExamples(rows);
    const read = partiesFromCsv(clean, mapping as Partial<Record<ImportField, number>>, { kind: 'customer', currency: ctx.currency });
    const sheetLine = (i: number) => lineOf.get(clean[i + 1]) ?? i + 2;
    return {
      records: read.flatMap((r, i) => (r.party ? [{ line: sheetLine(i), value: r.party }] : [])),
      errors: read.flatMap((r, i) => (r.party ? [] : [{ line: sheetLine(i), message: r.problems.join(' · ') }])),
    };
  },
  async send(values, dryRun, env) {
    return inChunks(values, async (rows) => {
      const { data, error } = await api().POST('/companies/{companyId}/parties/import', { params: { path: { companyId: env.companyId } }, body: { rows: rows as never, dryRun } });
      if (error || !data) throw error ?? new Error('No answer from the server');
      return shape(data as never);
    });
  },
  planNeeds: (records, ctx) => needs(ctx, 'purchases', 'Suppliers', (records as { kind: string }[]).filter((r) => r.kind === 'supplier' || r.kind === 'both').length),
  preview: [
    { label: 'Name', value: (p: { name: string }) => p.name },
    { label: 'Type', value: (p: { kind: string }) => p.kind },
    { label: 'GSTIN', value: (p: { taxId?: string }) => p.taxId ?? '' },
    { label: 'Phone', value: (p: { phone?: string }) => p.phone ?? '' },
    { label: 'City', value: (p: { billingAddress: { city: string } }) => p.billingAddress.city },
    { label: 'Opening', value: (p: { openingBalance: Money }) => (p.openingBalance.minor ? toMajor(p.openingBalance).toLocaleString('en-IN') : '') },
  ] as Entity['preview'],
};

export const ITEMS: Entity = {
  id: 'items',
  group: 'Masters',
  title: 'Items & services',
  blurb: 'Products and services with prices, GST, HSN and opening stock.',
  sheetName: 'Items',
  fields: ITEM_FIELDS,
  nameHint: /item|product|stock|inventory|goods|service|catalog/i,
  signature: ['name'],
  options: [
    {
      key: 'stockDate',
      type: 'date',
      label: 'Opening stock is counted as of',
      hint: 'Invoices, bills and other documents dated before this day cannot use these items. Pick a day before your oldest document.',
      default: (ctx) => financialYearStart(ctx.fiscalYearStartMonth),
    },
  ],
  template: {
    name: 'Items',
    columns: [
      col('Name', '(example) Ball Bearing 6203', 'Required. What the item is called.', { required: true, width: 28 }),
      col('SKU', 'BRG-6203', 'Your item code. Left blank, one is assigned.'),
      col('Type', 'Goods', 'Goods or Service.', { options: ['Goods', 'Service'] }),
      col('Unit', 'NOS', 'PCS, BOX, KG, LTR, MTR, HR, DAY, SET or NOS.', { options: ['PCS', 'BOX', 'KG', 'LTR', 'MTR', 'HR', 'DAY', 'SET', 'NOS'] }),
      col('Sale Price', '250', 'The selling price before GST.'),
      col('Purchase Price', '180', 'What you pay for it, before GST.'),
      col('GST %', '18', 'A rate your business has set up: 0, 5, 12, 18 or 28.', { options: ['0', '5', '12', '18', '28'] }),
      col('HSN', '84821011', 'HSN for goods or SAC for services: 4, 6 or 8 digits.'),
      col('Barcode', '', 'The number under the barcode.'),
      col('Opening Stock', '40', 'How many you hold when you start. Goods only.'),
      col('Reorder Level', '10', 'Warn when stock falls to this.'),
      col('Description', 'Deep groove ball bearing', 'Shown on documents.', { width: 30 }),
    ],
  },
  guess: (header) => guessItemColumns(header) as Mapping,
  parse(rows, mapping, ctx, options) {
    const { rows: clean, lineOf } = withoutExamples(rows);
    const today = new Date().toISOString().slice(0, 10);
    // Not after today (the server refuses a later day), whatever was typed.
    const openingStockDate = options.stockDate && options.stockDate <= today ? options.stockDate : today;
    const read = itemsFromCsv(clean, mapping as Partial<Record<ItemImportField, number>>, { currency: ctx.currency, taxCategories: ctx.taxCategories, trackInventory: ctx.trackInventory, openingStockDate });
    const sheetLine = (i: number) => lineOf.get(clean[i + 1]) ?? i + 2;
    return {
      // A stock-keeping item with no quantity still needs its date: left out, the server counts its stock from
      // today, and no invoice or bill dated before today can use the item.
      records: read.flatMap((r, i) => (r.item ? [{ line: sheetLine(i), value: r.item.trackInventory && !r.item.openingStockDate ? { ...r.item, openingStockDate } : r.item }] : [])),
      errors: read.flatMap((r, i) => (r.item ? [] : [{ line: sheetLine(i), message: r.problems.join(' · ') }])),
    };
  },
  async send(values, dryRun, env) {
    return inChunks(values, async (rows) => {
      const { data, error } = await api().POST('/companies/{companyId}/items/import', { params: { path: { companyId: env.companyId } }, body: { rows: rows as never, dryRun } });
      if (error || !data) throw error ?? new Error('No answer from the server');
      return shape(data as never);
    });
  },
  preview: [
    { label: 'SKU', value: (i: { sku: string }) => i.sku },
    { label: 'Name', value: (i: { name: string }) => i.name },
    { label: 'Unit', value: (i: { unit: string }) => i.unit },
    { label: 'Sale price', value: (i: { salePrice: Money }) => toMajor(i.salePrice).toLocaleString('en-IN') },
    { label: 'Stock', value: (i: { openingStock: number }) => (i.openingStock ? String(i.openingStock) : '') },
  ] as Entity['preview'],
};

/**
 * Import order. Contacts and items stand alone; whatever refers to them (opening balances, invoices,
 * payments) comes after, so a file that holds all of it works top to bottom.
 */
export const ENTITIES: Entity[] = [CONTACTS, ITEMS, OPENINGS, JOURNALS, SALES, PURCHASES, PAYMENTS, EXPENSES];

/** What the sheet most looks like, by the columns it has and what it is called. Undefined when it looks like none. */
export function detectEntity(sheet: { name: string; rows: string[][] }): Entity | undefined {
  return bestEntity(sheet.name, sheet.rows[0] ?? [])?.entity;
}

/** The kind of data a header row most looks like, with how well it fits. */
export function bestEntity(sheetName: string, header: string[]): { entity: Entity; score: number } | undefined {
  let best: { entity: Entity; score: number } | undefined;
  for (const entity of ENTITIES) {
    const mapped = entity.guess(header);
    if (!entity.signature.every((f) => mapped[f] !== undefined)) continue;
    const score = Object.values(mapped).filter((v) => v !== undefined).length + (entity.nameHint.test(sheetName) ? 4 : 0);
    if (!best || score > best.score) best = { entity, score };
  }
  return best;
}

/** A sheet that is only instructions. */
export const isInstructions = (name: string) => squashHeader(name) === 'instructions';

/** What a template of these entities is called on disk. */
export const templateFileName = () => 'Elixir-Books-Import-Template.xlsx';
