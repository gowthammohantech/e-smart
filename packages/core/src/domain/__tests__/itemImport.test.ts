import type { TaxCategory } from '../../types';
import { parseCsv } from '../../lib/csv';
import { guessItemColumns, itemsFromCsv, unitCodeOf } from '../itemImport';

const taxes = [0, 5, 12, 18, 28].map((rate) => ({ id: `gst${rate}`, name: `GST ${rate}%`, rate }) as TaxCategory);
const defaults = { currency: 'INR', taxCategories: taxes, trackInventory: true, openingStockDate: '2026-11-05' };

const read = (csv: string) => {
  const rows = parseCsv(csv);
  return itemsFromCsv(rows, guessItemColumns(rows[0]), defaults);
};

describe('items from a CSV', () => {
  it('reads a Tally-style stock sheet: names, units, Indian amounts, GST by rate, opening stock', () => {
    const [bearing, grease] = read(
      ['Item Name,Item Code,UOM,Selling Price,Cost Price,GST %,HSN/SAC,Opening Qty', 'Ball Bearing 6203,brg-6203,Nos.,"₹1,250.50",980,18%,84821011,40', 'Grease 500g,,kgs,320,,5,3403,'].join('\n'),
    );
    expect(bearing.problems).toEqual([]);
    expect(bearing.item).toMatchObject({
      name: 'Ball Bearing 6203',
      sku: 'BRG-6203',
      unit: 'NOS',
      salePrice: { minor: 125050, currency: 'INR' },
      purchasePrice: { minor: 98000 },
      taxCategoryId: 'gst18',
      hsnCode: '84821011',
      trackInventory: true,
      openingStock: 40,
      openingStockDate: '2026-11-05',
    });
    expect(grease.item).toMatchObject({ sku: '', unit: 'KG', taxCategoryId: 'gst5', openingStock: 0 });
    expect(grease.item?.openingStockDate).toBeUndefined();
  });

  it('bills a service in Nos and keeps no stock', () => {
    const [svc] = read(['Name,Type,Unit,Rate,Stock', 'Installation,Service,hours,1500,3'].join('\n'));
    expect(svc.item).toMatchObject({ type: 'service', unit: 'NOS', trackInventory: false, openingStock: 0 });
  });

  it('says what is wrong with a row and leaves it out', () => {
    const [bad] = read(['Name,Unit,Price,GST,HSN', ',bags,abc,7,12'].join('\n'));
    expect(bad.item).toBeUndefined();
    expect(bad.problems).toEqual([
      'No name',
      expect.stringContaining('Unit "bags"'),
      'Sale price "abc" is not an amount',
      expect.stringContaining('No 7 tax category'),
      'HSN/SAC "12" should be 4, 6 or 8 digits',
    ]);
    expect(bad.line).toBe(2);
  });

  it('knows the units spreadsheets write', () => {
    expect(['Pcs', 'nos.', 'Ltrs', 'mtr', 'BOX', 'kilo'].map(unitCodeOf)).toEqual(['PCS', 'NOS', 'LTR', 'MTR', 'BOX', 'KG']);
    expect(unitCodeOf('bags')).toBeUndefined();
  });
});
