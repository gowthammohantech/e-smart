import ExcelJS from 'exceljs';
import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { gstr1Summary, GSTR1_TABLES, GSTR1_TABLE_LABELS, NIL_SUPPLY_LABELS, type Gstr1Summary } from '@esmart/core/domain/gstr1';
import type { Item } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { RawBody, defineHandlers, type CompanyRow } from '../../context';
import { invalid } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { compact } from '../../lib/wire';
import { companyCore, partyCore } from '../documents/engine';
import { documentsToWire, toCoreDocument } from '../documents/wire';
import { toCsv } from '../exports/build';
import { gstnJson } from './gstn';

const D = schema.documents;

/** `092026` → September 2026, first to last day. */
export function periodRange(period: string): { from: string; to: string } {
  const m = /^(0[1-9]|1[0-2])([0-9]{4})$/.exec(period);
  if (!m) throw invalid('period', 'Use MMYYYY, e.g. 092026');
  const [month, year] = [Number(m[1]), Number(m[2])];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${m[2]}-${m[1]}-01`, to: `${m[2]}-${m[1]}-${String(last).padStart(2, '0')}` };
}

/**
 * GSTR-1 for a month, computed by `@esmart/core` gstr1Summary from the
 * company's issued invoices and credit notes, in the base currency. Drafts
 * never count; cancelled documents are fetched only for the table 13
 * document summary.
 */
export async function buildGstr1(db: DbOrTx, company: CompanyRow, period: string, now: Date): Promise<Gstr1Summary> {
  const range = periodRange(period);
  const rows = await db
    .select()
    .from(D)
    .where(and(eq(D.companyId, company.id), inArray(D.kind, ['invoice', 'salesReturn']), ne(D.status, 'draft'), gte(D.date, range.from), lte(D.date, range.to)))
    .orderBy(D.date, D.number);
  const baseCurrency = company.baseCurrency.trim();
  const documents = (await documentsToWire(db, rows, now, baseCurrency)).map(toCoreDocument);
  const partyIds = [...new Set(rows.map((r) => r.partyId))];
  const parties = partyIds.length ? await db.select().from(schema.parties).where(inArray(schema.parties.id, partyIds)) : [];
  const items = await db.select().from(schema.items).where(eq(schema.items.companyId, company.id));
  return gstr1Summary({
    company: companyCore(company),
    documents,
    parties: parties.map(partyCore),
    items: items.map((i) => ({ id: i.id, name: i.name, type: i.type, unit: i.unit, hsnCode: i.hsnCode ?? undefined }) as Item),
    baseCurrency,
    period: range,
  });
}

const major = (m: { minor: number }) => m.minor / 100;

/** Every invoice row across the tables, flat, in rupees. */
function flatRows(summary: Gstr1Summary) {
  return GSTR1_TABLES.flatMap((table) =>
    summary[table].map((r) => ({
      table,
      gstin: r.gstin ?? '',
      partyName: r.partyName,
      number: r.number,
      date: r.date,
      kind: r.kind,
      placeOfSupply: `${r.placeOfSupply}-${r.placeOfSupplyName}`,
      rate: r.rate,
      taxableValue: major(r.taxableValue),
      cgst: major(r.cgst),
      sgst: major(r.sgst),
      igst: major(r.igst),
      invoiceValue: major(r.invoiceValue),
    })),
  );
}

const ROW_COLUMNS = ['table', 'gstin', 'partyName', 'number', 'date', 'kind', 'placeOfSupply', 'rate', 'taxableValue', 'cgst', 'sgst', 'igst', 'invoiceValue'];

/** One sheet per GSTR-1 table plus HSN and a summary, as the offline tool's Excel template is laid out. */
async function workbook(summary: Gstr1Summary, company: CompanyRow, period: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Elixir Books';
  const rows = flatRows(summary);
  const head = ['GSTIN', 'Party', 'Number', 'Date', 'Place of supply', 'Rate', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Invoice value'];

  const sum = wb.addWorksheet('Summary');
  sum.addRows([
    ['GSTR-1', company.legalName ?? company.name],
    ['GSTIN', company.taxIdentifier ?? ''],
    ['Period', period],
    [],
    ['Documents', summary.totals.documents],
    ['Taxable value', major(summary.totals.taxableValue)],
    ['Tax', major(summary.totals.tax)],
    ['Invoice value', major(summary.totals.invoiceValue)],
  ]);
  for (const table of GSTR1_TABLES) {
    const ws = wb.addWorksheet(table.toUpperCase());
    ws.addRow([GSTR1_TABLE_LABELS[table]]);
    ws.addRow(head).font = { bold: true };
    for (const r of rows.filter((x) => x.table === table)) {
      ws.addRow([r.gstin, r.partyName, r.number, r.date, r.placeOfSupply, r.rate, r.taxableValue, r.cgst, r.sgst, r.igst, r.invoiceValue]);
    }
  }
  const hsn = wb.addWorksheet('HSN');
  hsn.addRow(['HSN', 'Description', 'UQC', 'Quantity', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total value']).font = { bold: true };
  for (const h of summary.hsn) hsn.addRow([h.hsnCode, h.description, h.unit, h.quantity, major(h.taxableValue), major(h.cgst), major(h.sgst), major(h.igst), major(h.totalValue)]);
  const nil = wb.addWorksheet('NIL');
  nil.addRow(['Supply type', 'Nil rated', 'Exempted', 'Non-GST']).font = { bold: true };
  for (const n of summary.nil) nil.addRow([NIL_SUPPLY_LABELS[n.supplyType], major(n.nilRated), major(n.exempt), major(n.nonGst)]);
  const docs = wb.addWorksheet('DOCS');
  docs.addRow(['Nature of document', 'From', 'To', 'Total number', 'Cancelled', 'Net issued']).font = { bold: true };
  for (const d of summary.docs) docs.addRow([d.nature === 'invoice' ? 'Invoices for outward supply' : 'Credit Note', d.from, d.to, d.total, d.cancelled, d.total - d.cancelled]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** GST: getGstr1, exportGstr1. */
export const gstHandlers = defineHandlers({
  async getGstr1(ctx) {
    const summary = await buildGstr1(ctx.db, ctx.company, ctx.query.period, ctx.now);
    return compact({ period: ctx.query.period, ...summary }) as Schema<'Gstr1Summary'>;
  },

  /** `format` picks the file: the GSTN offline-tool JSON (default), a flat CSV of invoice rows, or an Excel workbook. */
  async exportGstr1(ctx) {
    const { period } = ctx.query;
    const format = ctx.query.format ?? 'gstn-json';
    const summary = await buildGstr1(ctx.db, ctx.company, period, ctx.now);
    const name = `GSTR1_${ctx.company.taxIdentifier ?? ctx.company.id}_${period}`;
    if (format === 'csv') return new RawBody(toCsv(ROW_COLUMNS, flatRows(summary)), 'text/csv; charset=utf-8', `${name}.csv`);
    if (format === 'xlsx') return new RawBody(await workbook(summary, ctx.company, period), XLSX, `${name}.xlsx`);
    return new RawBody(JSON.stringify(gstnJson(summary, ctx.company.taxIdentifier ?? '', period)), 'application/json', `${name}.json`);
  },
});
