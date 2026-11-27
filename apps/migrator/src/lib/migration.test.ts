import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { TaxCategory } from '@esmart/core/types';
import { CONTACTS, ENTITIES, ITEMS, TEMPLATE_VERSION, detectEntity, type Ctx, type Entity } from './entities';
import { EXPENSES, JOURNALS, OPENINGS, PAYMENTS, PURCHASES, SALES } from './transactions';
import { buildTemplate, readWorkbook } from './sheets';
import { PLACES, sampleSheets } from './demo';
import { stateCodeOf } from '@esmart/core/domain/partyImport';
import { toIsoDate } from './kit';
import { cleanServerUrl } from './api';
import { plansFromSheets } from './plans';
import { defaultOptions } from './options';

const ctx: Ctx = {
  currency: 'INR',
  trackInventory: true,
  taxCategories: [0, 5, 12, 18, 28].map((rate) => ({ id: `tax_${rate}`, companyId: 'c', name: `GST ${rate}%`, rate, type: 'gst', effectiveFrom: '2020-01-01' }) as unknown as TaxCategory),
  accounts: [
    { key: 'sys:rent', name: 'Rent' },
    { key: 'sys:cash', name: 'Cash' },
    { key: 'sys:capital', name: 'Capital' },
  ],
  fiscalYearStartMonth: 4,
};

async function workbook(sheets: Record<string, string[][]>) {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    rows.forEach((r) => ws.addRow(r));
  }
  return readWorkbook(new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer));
}

const parse = (entity: Entity, rows: string[][], options: Record<string, string> = {}) => entity.parse(rows, entity.guess(rows[0]), ctx, options);

describe('the template', () => {
  it('has a sheet for every kind of data, each recognised as itself, with its example row left out', async () => {
    const bytes = await buildTemplate(ENTITIES.map((e) => e.template), TEMPLATE_VERSION);
    const sheets = await readWorkbook(bytes);
    expect(sheets.map((s) => s.name)).toEqual(['Instructions', ...ENTITIES.map((e) => e.sheetName)]);
    for (const entity of ENTITIES) {
      const sheet = sheets.find((s) => s.name === entity.sheetName)!;
      expect(detectEntity(sheet)?.id, `${entity.sheetName} is recognised`).toBe(entity.id);
      const out = parse(entity, sheet.rows);
      expect(out.records, `${entity.id} example row left out`).toHaveLength(0);
      expect(out.errors, `${entity.id} has no errors`).toHaveLength(0);
    }
  });

  it('maps every column of its own header with no help', async () => {
    const sheets = await readWorkbook(await buildTemplate(ENTITIES.map((e) => e.template), TEMPLATE_VERSION));
    for (const entity of ENTITIES) {
      const sheet = sheets.find((s) => s.name === entity.sheetName)!;
      const mapped = entity.guess(sheet.rows[0]);
      for (const f of entity.fields) expect(mapped[f.key], `${entity.id}.${f.key}`).toBeDefined();
    }
  });
});

describe("someone else's spreadsheet", () => {
  it('reads a Tally-style ledger export as contacts, and says what is wrong with a row', async () => {
    const sheets = await workbook({
      'Sundry Debtors': [
        ['Ledger Name', 'Under', 'GSTIN/UIN', 'Mobile No', 'State', 'Opening Balance', 'Dr/Cr'],
        ['Sharma Traders', 'Sundry Debtors', '27AAPFU0939F1ZV', '9876543210', 'Maharashtra', '25,000.00', 'Dr'],
        ['Kumar Supplies', 'Sundry Creditors', '', '9123456780', 'TN', '1,20,000', 'Cr'],
        ['Bad GST Co', 'Sundry Debtors', '27AAPFU0939F1ZX', '', '', '', ''],
        ['', 'Sundry Debtors', '', '', '', '', ''],
      ],
    });
    expect(detectEntity(sheets[0])?.id).toBe('contacts');
    const out = parse(CONTACTS, sheets[0].rows);
    expect(out.records.map((r) => r.line)).toEqual([2, 3]);
    const [sharma, kumar] = out.records.map((r) => r.value as { kind: string; name: string; billingAddress: { stateCode?: string }; openingBalance: { minor: number }; openingBalanceSide?: string });
    expect(sharma).toMatchObject({ kind: 'customer', name: 'Sharma Traders', billingAddress: { stateCode: '27' }, openingBalance: { minor: 2500000 } });
    expect(kumar).toMatchObject({ kind: 'supplier', openingBalance: { minor: 12000000 }, openingBalanceSide: 'cr' });
    expect(out.errors.map((e) => e.line)).toEqual([4, 5]);
    expect(out.errors[0].message).toMatch(/GSTIN/);
    expect(out.errors[1].message).toMatch(/No name/);
  });

  it('reads a stock sheet as items, with tax matched to the business’s rates', async () => {
    const sheets = await workbook({
      Stock: [
        ['Item Name', 'Item Code', 'UOM', 'Selling Price', 'Cost', 'GST Rate', 'HSN Code', 'Qty'],
        ['Ball Bearing 6203', 'BRG-6203', 'Nos.', '250', '180', '18%', '84821011', '40'],
        ['Odd Rate Thing', 'ODD-1', 'Pcs', '10', '5', '7', '', '1'],
      ],
    });
    expect(detectEntity(sheets[0])?.id).toBe('items');
    const out = parse(ITEMS, sheets[0].rows);
    expect(out.records).toHaveLength(1);
    expect(out.records[0].value).toMatchObject({ sku: 'BRG-6203', unit: 'NOS', taxCategoryId: 'tax_18', openingStock: 40 });
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].message).toMatch(/GST rate/);
  });

  it('keeps a long number such as a phone or HSN whole, and a date as day/month/year', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Parties');
    ws.addRow(['Name', 'Phone', 'Notes']);
    ws.addRow(['A Co', 9876543210, new Date(Date.UTC(2026, 3, 1))]);
    const sheets = await readWorkbook(new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer));
    expect(sheets[0].rows[1]).toEqual(['A Co', '9876543210', '01/04/2026']);
  });
});

describe('invoices and bills', () => {
  const rows = [
    ['Invoice No', 'Date', 'Customer', 'Item', 'Qty', 'Rate', 'GST %', 'Discount %'],
    ['INV-1', '31/03/2026', 'Sharma Traders', 'Ball Bearing 6203', '10', '250', '18', '10'],
    ['', '', '', 'Oil Seal', '5', '40', '18', ''],
    ['INV-2', '01/04/2026', 'Kumar Stores', 'Ball Bearing 6203', '2', '250', '18', ''],
    ['INV-3', '99/99/2026', 'Sharma Traders', 'Ball Bearing 6203', '1', '250', '18', ''],
    ['INV-4', '02/04/2026', 'Sharma Traders', 'Ball Bearing 6203', 'many', '250', '18', ''],
    ['INV-4', '02/04/2026', 'Sharma Traders', 'Oil Seal', '1', '40', '18', ''],
  ];

  it('groups rows by number, carries a heading down, and leaves out a document with a bad row whole', () => {
    expect(detectEntity({ name: 'Sheet1', rows })?.id).toBe('sales');
    const out = parse(SALES, rows);
    expect(out.records.map((r) => r.line)).toEqual([2, 4]);
    const inv1 = out.records[0].value as { number: string; date: string; party: string; lines: { name: string; quantity: number; discount: number; taxRate?: number }[] };
    expect(inv1).toMatchObject({ number: 'INV-1', date: '2026-03-31', party: 'Sharma Traders' });
    expect(inv1.lines.map((l) => [l.name, l.quantity, l.discount, l.taxRate])).toEqual([
      ['Ball Bearing 6203', 10, 10, 18],
      ['Oil Seal', 5, 0, 18],
    ]);
    expect(out.records[0].rows).toEqual([2, 3]);
    // INV-3 (bad date) and INV-4 (bad quantity on one row) are each left out, every row of them.
    expect(out.errors.map((e) => e.line)).toEqual([5, 6, 7]);
    expect(out.errors[0].message).toMatch(/INV-3.*not a date/);
    expect(out.errors[1].message).toMatch(/INV-4.*Quantity/);
    expect(out.errors[2].message).toMatch(/Left out with the rest of INV-4/);
  });

  it('takes a sheet with a Supplier column for purchase bills', () => {
    const bills = [
      ['Bill No', 'Date', 'Supplier', 'Item', 'Qty', 'Rate', 'GST %'],
      ['B-77', '05/04/2026', 'Kumar Supplies', 'Steel Rod', '4', '900', '18'],
    ];
    expect(detectEntity({ name: 'Bills', rows: bills })?.id).toBe('purchases');
    const out = parse(PURCHASES, bills);
    expect(out.records).toHaveLength(1);
    expect(out.records[0].value).toMatchObject({ kind: 'purchaseBill', number: 'B-77' });
  });

  it('refuses a GST rate the business has not set up', () => {
    const out = parse(SALES, [
      ['Invoice No', 'Date', 'Customer', 'Item', 'Qty', 'Rate', 'GST %'],
      ['INV-9', '01/04/2026', 'Sharma Traders', 'Thing', '1', '10', '7'],
    ]);
    expect(out.records).toHaveLength(0);
    expect(out.errors[0].message).toMatch(/GST 7% isn’t set up/);
  });
});

describe('payments, expenses, opening balances and journals', () => {
  it('reads payments with a type and a method', () => {
    const rows = [
      ['Date', 'Type', 'Party', 'Amount', 'Mode', 'UTR'],
      ['31/03/2026', 'Received', 'Sharma Traders', '25,000', 'NEFT', 'UTR1'],
      ['01/04/2026', 'Paid', 'Kumar Supplies', '1,20,000', 'Cash', ''],
      ['02/04/2026', 'Sideways', 'Kumar Supplies', '10', '', ''],
      ['xx', 'Received', 'Sharma Traders', '10', '', ''],
    ];
    expect(detectEntity({ name: 'Payments', rows })?.id).toBe('payments');
    const out = parse(PAYMENTS, rows);
    expect(out.records.map((r) => r.value)).toMatchObject([
      { direction: 'received', party: 'Sharma Traders', date: '2026-03-31', amount: { minor: 2500000 }, method: 'bank', reference: 'UTR1' },
      { direction: 'paid', amount: { minor: 12000000 }, method: 'cash' },
    ]);
    expect(out.errors.map((e) => e.line)).toEqual([4, 5]);
  });

  it('reads expenses and checks the GST rate', () => {
    const rows = [
      ['Date', 'Category', 'Amount', 'GST %'],
      ['31/03/2026', 'Rent', '25000', '18'],
      ['01/04/2026', 'Fuel', '500', '3'],
    ];
    expect(detectEntity({ name: 'Expenses', rows })?.id).toBe('expenses');
    const out = parse(EXPENSES, rows);
    expect(out.records).toHaveLength(1);
    expect(out.records[0].value).toMatchObject({ category: 'Rent', amount: { minor: 2500000 }, taxRate: 18 });
    expect(out.errors[0].message).toMatch(/GST 3%/);
  });

  it('reads outstanding invoices and bills, taking a supplier column as a bill', () => {
    const rows = [
      ['Party', 'GSTIN', 'Type', 'Number', 'Date', 'Due Date', 'Outstanding'],
      ['Sharma Traders', '', 'Customer invoice', 'INV-0412', '15/02/2026', '15/03/2026', '25,000'],
      ['Kumar Supplies', '', 'Supplier bill', 'B-9', '10/02/2026', '', '8,000'],
      ['Nobody', '', '', 'INV-1', '10/02/2026', '', '0'],
    ];
    expect(detectEntity({ name: 'Opening Balances', rows })?.id).toBe('openings');
    const out = parse(OPENINGS, rows);
    expect(out.records.map((r) => r.value)).toMatchObject([
      { kind: 'openingInvoice', number: 'INV-0412', dueDate: '2026-03-15', amount: { minor: 2500000 } },
      { kind: 'openingBill', number: 'B-9', amount: { minor: 800000 } },
    ]);
    expect(out.errors).toHaveLength(1);
  });

  it('reads balanced journals and says what is wrong with an unbalanced one', () => {
    const rows = [
      ['Date', 'Journal No', 'Account', 'Debit', 'Credit', 'Narration'],
      ['31/03/2026', 'JV-1', 'Rent', '25000', '', 'March rent'],
      ['31/03/2026', 'JV-1', 'Cash', '', '25000', ''],
      ['31/03/2026', 'JV-2', 'Rent', '100', '', ''],
      ['31/03/2026', 'JV-2', 'Cash', '', '90', ''],
    ];
    expect(detectEntity({ name: 'Journals', rows })?.id).toBe('journals');
    const out = parse(JOURNALS, rows);
    expect(out.records).toHaveLength(1);
    expect(out.records[0].value).toMatchObject({ reference: 'JV-1', date: '2026-03-31', lines: [{ account: 'sys:rent', debitMinor: 2500000 }, { account: 'sys:cash', creditMinor: 2500000 }] });
    expect(out.errors[0].message).toMatch(/JV-2.*must be equal/);
  });
});

describe('the demo sample', () => {
  const read = (mistakes: boolean) =>
    plansFromSheets('Sample', sampleSheets(ctx, { mistakes, tag: 'ABC' }), ctx, true).map((p) => {
      const entity = ENTITIES.find((e) => e.id === p.entity)!;
      return { plan: p, entity, parsed: entity.parse(p.sheet.rows, p.mapping, ctx, defaultOptions(entity, ctx)) };
    });

  it('has a sheet for every kind of data, each recognised, each marked as sample, and nothing wrong in it', () => {
    const plans = read(false);
    expect(plans.map((p) => p.entity.id).sort()).toEqual(ENTITIES.map((e) => e.id).sort());
    for (const p of plans) {
      expect(p.plan.demo).toBe(true);
      expect(p.parsed.errors, `${p.entity.id} reads cleanly`).toEqual([]);
      expect(p.parsed.records.length, `${p.entity.id} has records`).toBeGreaterThan(0);
    }
  });

  it('is a fresh set each time, so a second load does not collide with the first', () => {
    const a = sampleSheets(ctx, { tag: 'AAA' }).flatMap((s) => s.rows.flat());
    const b = sampleSheets(ctx, { tag: 'BBB' }).flatMap((s) => s.rows.flat());
    expect(a.some((c) => c.includes('(Demo AAA)'))).toBe(true);
    expect(a.filter((c) => c.includes('AAA') && b.includes(c))).toEqual([]);
  });

  it('with mistakes, goes wrong in the places it is meant to and nowhere else', () => {
    const wrong = Object.fromEntries(read(true).map((p) => [p.entity.id, p.parsed.errors.map((e) => e.message).join(' | ')]));
    expect(wrong.contacts).toMatch(/GSTIN/);
    expect(wrong.contacts).toMatch(/Email/);
    expect(wrong.items).toMatch(/GST rate/);
    expect(wrong.sales).toMatch(/not a date/);
    expect(wrong.sales).toMatch(/Quantity/);
    expect(wrong.payments).toMatch(/Type/);
    expect(wrong.expenses).toMatch(/Amount|No amount/);
    expect(wrong.openings).toBe('');
    expect(wrong.purchases).toBe('');
    expect(wrong.journals).toBe('');
  });
});

describe('dates as people write them', () => {
  it.each([
    ['31/03/2026', '2026-03-31'],
    ['31-03-2026', '2026-03-31'],
    ['31.3.2026', '2026-03-31'],
    ['1/4/26', '2026-04-01'],
    ['2026-03-31', '2026-03-31'],
    ['2026/03/31', '2026-03-31'],
    ['31-Mar-2026', '2026-03-31'],
    ['31-Mar-26', '2026-03-31'],
    ['31 March 2026', '2026-03-31'],
    ['1st April 2026', '2026-04-01'],
    ['Mar 31, 2026', '2026-03-31'],
    ['31/03/2026 10:30', '2026-03-31'],
    ['31/03/2026 10:30 PM', '2026-03-31'],
    ['2026-03-31T00:00:00Z', '2026-03-31'],
    ['12/31/2026', '2026-12-31'],
    ['05/06/2026', '2026-06-05'],
    ['46112', '2026-03-31'],
    ['31/02/2026', undefined],
    ['99/99/2026', undefined],
    ['', undefined],
    ['soon', undefined],
  ])('%s is %s', (raw, iso) => {
    expect(toIsoDate(raw)).toBe(iso);
  });
});

describe('the demo sample is different each time and always valid', () => {
  // Many different tags: each is a different load, and every one must read cleanly, be recognised, and
  // (with mistakes) go wrong only where meant.
  const tags = Array.from({ length: 80 }, (_, i) => `${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i * 7) % 26))}${i % 10}`);
  const plansFor = (tag: string, mistakes: boolean) =>
    plansFromSheets('Sample', sampleSheets(ctx, { mistakes, tag }), ctx, true).map((p) => {
      const entity = ENTITIES.find((e) => e.id === p.entity)!;
      return { entity, parsed: entity.parse(p.sheet.rows, p.mapping, ctx, defaultOptions(entity, ctx)) };
    });

  it('every load reads cleanly, every sheet is recognised, and each kind has records', () => {
    for (const tag of tags) {
      const plans = plansFor(tag, false);
      expect(plans.map((p) => p.entity.id).sort(), tag).toEqual(ENTITIES.map((e) => e.id).sort());
      for (const p of plans) {
        expect(p.parsed.errors, `${tag} ${p.entity.id}`).toEqual([]);
        expect(p.parsed.records.length, `${tag} ${p.entity.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('with mistakes, every load goes wrong in the places it is meant to and nowhere else', () => {
    for (const tag of tags) {
      const wrong = Object.fromEntries(plansFor(tag, true).map((p) => [p.entity.id, p.parsed.errors.map((e) => e.message).join(' | ')]));
      expect(wrong.contacts, tag).toMatch(/GSTIN/);
      expect(wrong.contacts, tag).toMatch(/Email/);
      expect(wrong.items, tag).toMatch(/GST rate/);
      expect(wrong.sales, tag).toMatch(/not a date/);
      expect(wrong.sales, tag).toMatch(/Quantity/);
      expect(wrong.payments, tag).toMatch(/Type/);
      expect(wrong.expenses, tag).toMatch(/Amount|No amount/);
      for (const clean of ['openings', 'purchases', 'journals']) expect(wrong[clean], `${tag} ${clean}`).toBe('');
    }
  });

  it('the same tag gives the same sample, and different tags give different ones', () => {
    const names = (tag: string) => sampleSheets(ctx, { tag }).find((s) => s.name === 'Contacts')!.rows.slice(1).map((r) => r[1].replace(/ \(Demo .*\)$/, ''));
    expect(sampleSheets(ctx, { tag: 'K7F' })).toEqual(sampleSheets(ctx, { tag: 'K7F' }));
    const distinct = new Set(tags.map((t) => names(t).join('|')));
    // Eighty loads, with the names, places, items and amounts all varying: nearly all different.
    expect(distinct.size).toBeGreaterThan(70);
    const sizes = new Set(tags.map((t) => sampleSheets(ctx, { tag: t }).find((s) => s.name === 'Sales Invoices')!.rows.length));
    expect(sizes.size, 'the number of invoice lines varies').toBeGreaterThan(2);
    const items = new Set(tags.map((t) => sampleSheets(ctx, { tag: t }).find((s) => s.name === 'Items')!.rows[1][0].replace(/ \(Demo .*\)$/, '')));
    expect(items.size, 'the items vary').toBeGreaterThan(5);
  });

  it('a place’s city, state, GST code and PIN go together', () => {
    for (const p of PLACES) {
      expect(stateCodeOf(p.state), p.city).toBe(p.code);
      expect(p.pin, p.city).toMatch(/^\d{6}$/);
    }
  });
});

describe('the server address', () => {
  it.each([
    ['https://api-production-4abd.up.railway.app/v1', 'https://api-production-4abd.up.railway.app'],
    ['https://api-production-4abd.up.railway.app/v1/', 'https://api-production-4abd.up.railway.app'],
    ['https://api-production-4abd.up.railway.app', 'https://api-production-4abd.up.railway.app'],
    ['  https://api.example.com/  ', 'https://api.example.com'],
    ['http://localhost:4000/V1', 'http://localhost:4000'],
    ['https://example.com/api', 'https://example.com/api'],
    ['https://example.com//v1//', 'https://example.com'],
    ['/v1', ''],
    ['', ''],
  ])('%s is %s', (typed, clean) => {
    expect(cleanServerUrl(typed)).toBe(clean);
  });

  it('stays fast on a string of many slashes', () => {
    const started = Date.now();
    expect(cleanServerUrl(`https://example.com${'/'.repeat(200_000)}x`)).toBe(`https://example.com${'/'.repeat(200_000)}x`);
    expect(cleanServerUrl(`https://example.com${'/'.repeat(200_000)}`)).toBe('https://example.com');
    expect(Date.now() - started).toBeLessThan(500);
  });
});
