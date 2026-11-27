import { writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import type { TaxCategory } from '@esmart/core/types';
import { sampleSheets } from '../src/lib/demo';
import { ENTITIES, TEMPLATE_VERSION, type Ctx } from '../src/lib/entities';
import { buildTemplate } from '../src/lib/sheets';

const ctx: Ctx = {
  currency: 'INR',
  trackInventory: true,
  taxCategories: [0, 5, 12, 18, 28].map((rate) => ({ id: `tax_${rate}`, rate }) as unknown as TaxCategory),
  accounts: [],
  fiscalYearStartMonth: 4,
};

// Columns that hold numbers, so Excel shows them as numbers and not as text.
const NUMERIC = new Set(['qty', 'rate', 'discount %', 'gst %', 'amount', 'debit', 'credit', 'sale price', 'purchase price', 'opening stock', 'reorder level', 'credit limit', 'credit days', 'opening balance']);

async function write(file: string, mistakes: boolean) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildTemplate(ENTITIES.map((e) => e.template), TEMPLATE_VERSION)) as unknown as ArrayBuffer);
  for (const sheet of sampleSheets(ctx, { mistakes })) {
    const ws = wb.getWorksheet(sheet.name)!;
    ws.spliceRows(2, 1); // the template's example row goes
    const header = sheet.rows[0].map((h) => h.toLowerCase());
    sheet.rows.slice(1).forEach((row, i) => {
      ws.getRow(2 + i).values = row.map((cell, c) => (NUMERIC.has(header[c]) && cell !== '' && !Number.isNaN(Number(cell)) ? Number(cell) : cell));
    });
  }
  writeFileSync(file, Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer));
  console.log('Wrote', file);
}

const dir = process.argv[2] ?? '.';
await write(`${dir}/Sample-Import-Data.xlsx`, false);
await write(`${dir}/Sample-Import-Data-with-mistakes.xlsx`, true);
