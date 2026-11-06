import type { Item, TaxCategory } from '../types';
import { fromMajor, money } from '../lib/money';
import { cleanAmount, matchColumns, squashHeader } from '../lib/csv';
import { UNITS, SERVICE_UNIT_CODES } from '../data/masters';

/**
 * Items from a spreadsheet: a price list or stock sheet as Excel, Tally, Vyapar
 * or another app exports it, read into the item records the API's `importItems`
 * takes. Pure, so the app previews exactly what the server will be asked to create.
 */

export type ItemImportField =
  | 'name'
  | 'sku'
  | 'description'
  | 'type'
  | 'unit'
  | 'salePrice'
  | 'purchasePrice'
  | 'taxRate'
  | 'hsnCode'
  | 'barcode'
  | 'openingStock'
  | 'reorderLevel';

/** Header names each field goes by, squashed (lower case, no spaces or punctuation). */
const ALIASES: Record<ItemImportField, string[]> = {
  name: ['name', 'itemname', 'productname', 'item', 'product', 'stockitem', 'particulars', 'description1'],
  sku: ['sku', 'code', 'itemcode', 'productcode', 'partno', 'partnumber', 'skucode'],
  description: ['description', 'details', 'remarks', 'notes'],
  type: ['type', 'itemtype', 'goodsservice', 'goodsorservice', 'category'],
  unit: ['unit', 'uom', 'units', 'unitofmeasure', 'baseunit', 'uqc'],
  salePrice: ['saleprice', 'sellingprice', 'salesprice', 'rate', 'price', 'mrp', 'salerate', 'sellingrate'],
  purchasePrice: ['purchaseprice', 'costprice', 'cost', 'purchaserate', 'buyingprice', 'costrate'],
  taxRate: ['gst', 'gstrate', 'taxrate', 'tax', 'gstpercent', 'igstrate', 'gst%', 'taxpercent'],
  hsnCode: ['hsn', 'hsncode', 'sac', 'saccode', 'hsnsac', 'hsnsaccode'],
  barcode: ['barcode', 'ean', 'upc', 'gtin'],
  openingStock: ['openingstock', 'openingqty', 'openingquantity', 'stock', 'qty', 'quantity', 'closingstock', 'onhand'],
  reorderLevel: ['reorderlevel', 'reorderqty', 'minstock', 'minimumstock', 'reorderpoint'],
};

/** Which column holds which field, by header; a column with an unknown header is left out. */
export function guessItemColumns(header: string[]): Partial<Record<ItemImportField, number>> {
  return matchColumns(header, ALIASES);
}

/** What spreadsheets call a unit, as one of ours ("Nos.", "pieces", "kgs", "Ltrs" …). */
const UNIT_WORDS: Record<string, string> = {
  pc: 'PCS', pcs: 'PCS', piece: 'PCS', pieces: 'PCS',
  no: 'NOS', nos: 'NOS', number: 'NOS', numbers: 'NOS', unit: 'NOS', units: 'NOS',
  kg: 'KG', kgs: 'KG', kilogram: 'KG', kilograms: 'KG', kilo: 'KG',
  l: 'LTR', ltr: 'LTR', ltrs: 'LTR', litre: 'LTR', litres: 'LTR', liter: 'LTR', liters: 'LTR',
  m: 'MTR', mtr: 'MTR', mtrs: 'MTR', metre: 'MTR', metres: 'MTR', meter: 'MTR', meters: 'MTR',
  hr: 'HR', hrs: 'HR', hour: 'HR', hours: 'HR',
  day: 'DAY', days: 'DAY',
  box: 'BOX', boxes: 'BOX', set: 'SET', sets: 'SET',
};

export function unitCodeOf(raw: string): string | undefined {
  const key = squashHeader(raw);
  if (!key) return undefined;
  const code = UNIT_WORDS[key] ?? key.toUpperCase();
  return UNITS.some((u) => u.code === code) ? code : undefined;
}

export type ImportedItem = Omit<Item, 'id' | 'companyId' | 'createdAt' | 'imageUri' | 'gst'>;
export type ItemImportRow = { line: number; item?: ImportedItem; problems: string[] };

/**
 * The sheet's rows as items. `rows[0]` is the header. Each row says what is
 * wrong with it; a row with a problem has no item and is left out of the import.
 * Tax is matched by rate to the company's categories ("18", "18%", "GST 18%");
 * a goods item keeps stock when the business tracks inventory.
 */
export function itemsFromCsv(
  rows: string[][],
  columns: Partial<Record<ItemImportField, number>>,
  defaults: { currency: string; taxCategories: TaxCategory[]; trackInventory: boolean; openingStockDate: string },
): ItemImportRow[] {
  const fallbackTax = defaults.taxCategories.find((c) => c.rate === 18) ?? defaults.taxCategories[0];
  return rows.slice(1).map((cells, i) => {
    const line = i + 2;
    const problems: string[] = [];
    const get = (f: ItemImportField) => (columns[f] === undefined ? '' : (cells[columns[f]!] ?? '').trim());

    const name = get('name');
    if (!name) problems.push('No name');

    const typeRaw = squashHeader(get('type'));
    const type = typeRaw.startsWith('serv') ? 'service' : 'goods';

    const unitRaw = get('unit');
    const unitCode = unitRaw ? unitCodeOf(unitRaw) : type === 'service' ? 'NOS' : 'PCS';
    if (!unitCode) problems.push(`Unit "${unitRaw}" is not one of ${UNITS.map((u) => u.code).join(', ')}`);
    // A service bills in Nos whatever the sheet says.
    const unit = type === 'service' && unitCode && !SERVICE_UNIT_CODES.includes(unitCode) ? 'NOS' : unitCode;

    const price = (f: 'salePrice' | 'purchasePrice', label: string) => {
      const v = cleanAmount(get(f));
      if (v === null || (v !== undefined && Number(v) < 0)) {
        problems.push(`${label} "${get(f)}" is not an amount`);
        return money(0, defaults.currency);
      }
      return v === undefined ? money(0, defaults.currency) : fromMajor(v, defaults.currency);
    };
    const salePrice = price('salePrice', 'Sale price');
    const purchasePrice = price('purchasePrice', 'Purchase price');

    const taxRaw = get('taxRate');
    const rate = taxRaw ? Number(taxRaw.replace(/[^0-9.]/g, '')) : undefined;
    const tax = rate === undefined ? fallbackTax : defaults.taxCategories.find((c) => c.rate === rate);
    if (!tax) problems.push(`No ${taxRaw} tax category: ${defaults.taxCategories.map((c) => `${c.rate}%`).join(', ')}`);

    const hsnCode = get('hsnCode').replace(/\s/g, '');
    if (hsnCode && !/^\d{4}(\d{2}){0,2}$/.test(hsnCode)) problems.push(`HSN/SAC "${hsnCode}" should be 4, 6 or 8 digits`);

    const quantity = (f: 'openingStock' | 'reorderLevel', label: string) => {
      const raw = get(f).replace(/,/g, '');
      if (!raw) return 0;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        problems.push(`${label} "${get(f)}" is not a quantity`);
        return 0;
      }
      return n;
    };
    const openingStock = quantity('openingStock', 'Opening stock');
    const reorderLevel = quantity('reorderLevel', 'Reorder level');
    const trackInventory = type === 'goods' && defaults.trackInventory;

    const item: ImportedItem | undefined =
      problems.length || !tax || !unit
        ? undefined
        : {
            sku: get('sku').toUpperCase(),
            name,
            ...(get('description') && { description: get('description') }),
            type,
            unit,
            salePrice,
            purchasePrice,
            taxCategoryId: tax.id,
            ...(hsnCode && { hsnCode }),
            ...(get('barcode') && { barcode: get('barcode') }),
            trackInventory,
            openingStock: trackInventory ? openingStock : 0,
            ...(trackInventory && openingStock > 0 && { openingStockDate: defaults.openingStockDate }),
            reorderLevel: trackInventory ? reorderLevel : 0,
            status: 'active',
          };
    return { line, item, problems };
  });
}
