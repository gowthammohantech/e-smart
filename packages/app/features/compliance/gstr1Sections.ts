import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { NIL_SUPPLY_LABELS, consolidateB2cs, type Gstr1Row, type Gstr1Summary, type Gstr1Table } from '@esmart/core/domain/gstr1';
import type { AmendTable } from '@esmart/core/domain/gstr1Amend';
import type { DocumentKind } from '@esmart/core/types';
import { formatMoney, formatPercent, formatQty } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';
import { money, toMajor } from '@esmart/core/lib/money';
import { reportTable } from '../reports/ReportShell';
import { periodLabel } from './periods';
import { useActiveCompany, useBaseCurrency } from '../../store/selectors';

/** The parts of GSTR-1, each its own table (or tables) of the return. */
/** `at` is advances received (11A), `atadj` advances adjusted (11B). */
export type Gstr1Section = Gstr1Table | 'nil' | 'at' | 'atadj' | 'hsn' | 'docs' | 'amend';

/**
 * In the order the books' consolidated GSTR-1 report lists them, each with the return's own short
 * name and table numbers. The total liabilities line goes after `LIABILITY_AFTER`.
 */
export const GSTR1_SECTIONS: { value: Gstr1Section; label: string; tables: string }[] = [
  { value: 'b2b', label: 'B2B', tables: '4A, 4B, 6B, 6C' },
  { value: 'b2cl', label: 'B2CL', tables: '5' },
  { value: 'b2cs', label: 'B2CS', tables: '7' },
  { value: 'at', label: '11A', tables: '11A' },
  { value: 'atadj', label: '11B', tables: '11B' },
  { value: 'cdnr', label: 'CDNR', tables: '9B' },
  { value: 'cdnur', label: 'CDNUR', tables: '9B' },
  { value: 'nil', label: 'NIL', tables: '8' },
  { value: 'exp', label: 'EXP', tables: '6A' },
  { value: 'hsn', label: 'HSN', tables: '12' },
  { value: 'docs', label: 'DOCS', tables: '13' },
  { value: 'amend', label: 'AMEND', tables: '9A, 9C, 10' },
];

/** The section the summary's total liabilities line follows: what comes after restates, not adds. */
export const LIABILITY_AFTER: Gstr1Section = 'exp';

export const isGstr1Section = (v: unknown): v is Gstr1Section => GSTR1_SECTIONS.some((s) => s.value === v);

const AMEND_TABLES: AmendTable[] = ['b2ba', 'b2cla', 'expa', 'cdnra', 'cdnura'];
/** Every view but NIL and DOCS carries a column per tax head. */
const TAX_HEADS = ['IGST', 'CGST', 'SGST'];

// The exported file keeps the GSTN offline tool's English column names and
// values, so it lines up with what the portal expects; the screen translates.
const NATURE_LABEL = { invoice: 'Invoices', creditNote: 'Credit notes', debitNote: 'Debit notes' } as const;
const NATURE_KEY = { invoice: 'compliance:gstr1.invoices', creditNote: 'compliance:gstr1.creditNotes', debitNote: 'compliance:gstr1.debitNotes' } as const;

/** One section's line in the summary: how many records it holds and their value, in minor units. */
export type SectionTotals = { section: Gstr1Section; records: number; taxable: number | null; igst: number | null; cgst: number | null; sgst: number | null; cess: number | null };

/** One section laid out as a table: the screen's columns, the file's, and the document behind each row. */
export type SectionDetail = {
  headers: string[];
  rows: string[][];
  widths: number[];
  kinds: ('text' | 'num')[];
  minWidth: number;
  count: number;
  note: string;
  /** The document a row is, where it is one (B2B, B2CL, EXP, CDNR, CDNUR). */
  documents: ({ id: string; kind: DocumentKind } | undefined)[];
  /** Under a document's number: its date, party and GSTIN or place of supply. */
  subtitles?: string[];
  /** The section's totals, under its rows. */
  total?: string[];
  exportRows: () => ReturnType<typeof reportTable>;
};

const distinct = (rows: Gstr1Row[]) => new Set(rows.map((r) => r.documentId)).size;
const sum = <T>(rows: T[], pick: (r: T) => number) => rows.reduce((a, r) => a + pick(r), 0);

/**
 * GSTR-1 as the books lay it out: a line per section with its totals, and each section's own
 * rows behind it. Shared by the return's summary and the page each section opens.
 */
export function useGstr1Sections(summary: Gstr1Summary) {
  const { t: tr } = useTranslation(['compliance', 'common']);
  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const homeState = company.taxRegistration?.placeOfSupplyStateCode;

  // Table 7 is filed per place of supply and rate, net of the credit notes against it.
  const b2cs = useMemo(() => consolidateB2cs(summary.b2cs, homeState, baseCurrency), [summary.b2cs, homeState, baseCurrency]);
  // 11A and 11B, each its own line and page.
  const advances = useMemo(
    () => ({ at: summary.advances.received.map((r) => ({ table: '11A', ...r })), atadj: summary.advances.adjusted.map((r) => ({ table: '11B', ...r })) }),
    [summary.advances],
  );
  const amend = summary.amendments;
  // Each amended document as reported again (B2BA … CDNURA), then B2CSA by original month, place and rate.
  const amendRows = useMemo(() => AMEND_TABLES.flatMap((table) => (amend?.[table] ?? []).map((r) => ({ table: table.toUpperCase(), r }))), [amend]);
  const b2csa = useMemo(
    () => (amend?.b2csa ?? []).flatMap((x) => consolidateB2cs(x.rows, homeState, baseCurrency).map((l) => ({ originalPeriod: x.originalPeriod, l }))),
    [amend, homeState, baseCurrency],
  );

  const totals = useMemo<SectionTotals[]>(() => {
    const docRows = (table: Gstr1Table): SectionTotals => {
      const rows = summary[table];
      return {
        section: table,
        records: distinct(rows),
        taxable: sum(rows, (r) => r.taxableValue.minor),
        igst: sum(rows, (r) => r.igst.minor),
        cgst: sum(rows, (r) => r.cgst.minor),
        sgst: sum(rows, (r) => r.sgst.minor),
        cess: sum(rows, (r) => r.cess.minor),
      };
    };
    const amendLines = [...amendRows.map((a) => a.r), ...b2csa.map((b) => b.l)];
    const advanceLine = (section: 'at' | 'atadj'): SectionTotals => {
      const rows = advances[section];
      return {
        section,
        records: rows.length,
        taxable: sum(rows, (r) => r.taxable),
        igst: sum(rows, (r) => r.igst),
        cgst: sum(rows, (r) => r.cgst),
        sgst: sum(rows, (r) => r.sgst),
        cess: sum(rows, (r) => r.cess),
      };
    };
    const lines: SectionTotals[] = [
      docRows('b2b'),
      docRows('b2cl'),
      {
        section: 'b2cs',
        records: distinct(summary.b2cs),
        taxable: sum(b2cs, (l) => l.taxableValue.minor),
        igst: sum(b2cs, (l) => l.igst.minor),
        cgst: sum(b2cs, (l) => l.cgst.minor),
        sgst: sum(b2cs, (l) => l.sgst.minor),
        cess: sum(b2cs, (l) => l.cess.minor),
      },
      docRows('exp'),
      docRows('cdnr'),
      docRows('cdnur'),
      // Nil rated, exempt and non-GST carry no tax.
      { section: 'nil', records: summary.nil.length, taxable: sum(summary.nil, (n) => n.nilRated.minor + n.exempt.minor + n.nonGst.minor), igst: null, cgst: null, sgst: null, cess: null },
      advanceLine('at'),
      advanceLine('atadj'),
      {
        section: 'hsn',
        records: summary.hsn.length,
        taxable: sum(summary.hsn, (h) => h.taxableValue.minor),
        igst: sum(summary.hsn, (h) => h.igst.minor),
        cgst: sum(summary.hsn, (h) => h.cgst.minor),
        sgst: sum(summary.hsn, (h) => h.sgst.minor),
        cess: sum(summary.hsn, (h) => h.cess.minor),
      },
      // Documents issued is a count, not an amount.
      { section: 'docs', records: sum(summary.docs, (d) => d.total - d.cancelled), taxable: null, igst: null, cgst: null, sgst: null, cess: null },
      {
        section: 'amend',
        records: amendLines.length,
        taxable: sum(amendLines, (l) => l.taxableValue.minor),
        igst: sum(amendLines, (l) => l.igst.minor),
        cgst: sum(amendLines, (l) => l.cgst.minor),
        sgst: sum(amendLines, (l) => l.sgst.minor),
        cess: sum(amendLines, (l) => l.cess.minor),
      },
    ];
    // In the order the summary lists them.
    return GSTR1_SECTIONS.map((s) => lines.find((l) => l.section === s.value)!);
  }, [summary, b2cs, advances, amendRows, b2csa]);

  const detail = (view: Gstr1Section): SectionDetail => {
    const m = (minor: number) => formatMoney(money(minor, baseCurrency));
    const f = (x: { minor: number }) => formatMoney(money(x.minor, baseCurrency));
    /** IGST, CGST, SGST and cess, the four columns each table ends in. */
    const taxCells = (igst: number, cgst: number, sgst: number, cess: number) => [m(igst), m(cgst), m(sgst), m(cess)];
    const taxHeads = [...TAX_HEADS, tr('compliance:gstr1.col.cess')];
    const shortGstin = (g?: string) => (g ? g.slice(0, 2) + '…' + g.slice(-4) : undefined);
    const T = 'text' as const;
    const N = 'num' as const;
    const label = GSTR1_SECTIONS.find((s) => s.value === view)?.label ?? view;
    const none = (n: number) => Array.from({ length: n }, () => undefined);

    switch (view) {
      case 'at':
      case 'atadj': {
        const advanceRows = advances[view];
        return {
          headers: [tr('compliance:gstr1.col.table'), tr('compliance:gstr1.col.pos'), tr('compliance:gstr1.col.rate'), tr('compliance:gstr1.col.taxable'), ...taxHeads],
          rows: advanceRows.map((r) => [r.table, r.placeOfSupply, formatPercent(r.rate), m(r.taxable), ...taxCells(r.igst, r.cgst, r.sgst, r.cess)]),
          total: [tr('common:table.total'), '', '', m(sum(advanceRows, (r) => r.taxable)), ...taxCells(sum(advanceRows, (r) => r.igst), sum(advanceRows, (r) => r.cgst), sum(advanceRows, (r) => r.sgst), sum(advanceRows, (r) => r.cess))],
          widths: [1.4, 1.1, 0.6, 1.1, 1, 1, 1, 0.8],
          kinds: [T, T, N, N, N, N, N, N],
          minWidth: 760,
          count: advanceRows.length,
          note: tr('compliance:gstr1.advancesNote'),
          documents: none(advanceRows.length),
          exportRows: () =>
            reportTable(
              ['Table', 'Place of supply', 'Rate', 'Gross advance', 'IGST', 'CGST', 'SGST', 'Cess'],
              advanceRows.map((r) => [r.table, r.placeOfSupply, r.rate, r.taxable / 100, r.igst / 100, r.cgst / 100, r.sgst / 100, r.cess / 100]),
            ),
        };
      }
      case 'b2cs':
        return {
          headers: [tr('compliance:gstr1.col.pos'), tr('compliance:gstr1.col.supply'), tr('compliance:gstr1.col.rate'), tr('compliance:gstr1.col.taxable'), ...taxHeads],
          rows: b2cs.map((l) => [l.placeOfSupplyName, l.supplyType, formatPercent(l.rate), formatMoney(l.taxableValue), ...taxCells(l.igst.minor, l.cgst.minor, l.sgst.minor, l.cess.minor)]),
          total: [tr('common:table.total'), '', '', m(sum(b2cs, (l) => l.taxableValue.minor)), ...taxCells(sum(b2cs, (l) => l.igst.minor), sum(b2cs, (l) => l.cgst.minor), sum(b2cs, (l) => l.sgst.minor), sum(b2cs, (l) => l.cess.minor))],
          widths: [1.4, 1.1, 0.6, 1.1, 1, 1, 1, 0.8],
          kinds: [T, T, N, N, N, N, N, N],
          minWidth: 760,
          count: b2cs.length,
          note: `${label} — ${tr('compliance:gstr1.table.b2cs')}`,
          documents: none(b2cs.length),
          exportRows: () =>
            reportTable(
              ['Type', 'Place of supply', 'Rate', 'Taxable value', 'IGST', 'CGST', 'SGST', 'Cess'],
              b2cs.map((l) => ['OE', l.placeOfSupplyName, l.rate, toMajor(l.taxableValue), toMajor(l.igst), toMajor(l.cgst), toMajor(l.sgst), toMajor(l.cess)]),
            ),
        };
      case 'hsn':
        return {
          headers: ['HSN', tr('compliance:gstr1.col.qty'), tr('compliance:gstr1.col.taxable'), ...taxHeads, tr('common:table.total')],
          rows: summary.hsn.map((h) => [h.hsnCode, formatQty(h.quantity), formatMoney(h.taxableValue), ...taxCells(h.igst.minor, h.cgst.minor, h.sgst.minor, h.cess.minor), formatMoney(h.totalValue)]),
          // Under each code, what it is and the unit it is counted in.
          subtitles: summary.hsn.map((h) => [h.description, h.unit].filter(Boolean).join(' · ')),
          total: [
            tr('common:table.total'),
            '',
            m(sum(summary.hsn, (h) => h.taxableValue.minor)),
            ...taxCells(sum(summary.hsn, (h) => h.igst.minor), sum(summary.hsn, (h) => h.cgst.minor), sum(summary.hsn, (h) => h.sgst.minor), sum(summary.hsn, (h) => h.cess.minor)),
            m(sum(summary.hsn, (h) => h.totalValue.minor)),
          ],
          widths: [1.1, 0.7, 1.1, 1, 1, 1, 0.8, 1.1],
          kinds: [T, N, N, N, N, N, N, N],
          minWidth: 760,
          count: summary.hsn.length,
          note: tr('compliance:gstr1.hsnNote'),
          documents: none(summary.hsn.length),
          exportRows: () =>
            reportTable(
              ['HSN', 'Description', 'UQC', 'Quantity', 'Taxable value', 'IGST', 'CGST', 'SGST', 'Cess', 'Total'],
              summary.hsn.map((h) => [h.hsnCode, h.description, h.unit, h.quantity, toMajor(h.taxableValue), toMajor(h.igst), toMajor(h.cgst), toMajor(h.sgst), toMajor(h.cess), toMajor(h.totalValue)]),
            ),
        };
      case 'nil':
        return {
          headers: [tr('compliance:gstr1.col.supply'), tr('compliance:gstr1.col.nilRated'), tr('compliance:gstr1.col.exempt'), tr('compliance:gstr1.col.nonGst')],
          rows: summary.nil.map((n) => [tr(`compliance:gstr1.nil.${n.supplyType}`), formatMoney(n.nilRated), formatMoney(n.exempt), formatMoney(n.nonGst)]),
          total: [tr('common:table.total'), m(sum(summary.nil, (n) => n.nilRated.minor)), m(sum(summary.nil, (n) => n.exempt.minor)), m(sum(summary.nil, (n) => n.nonGst.minor))],
          widths: [1.4, 1.2, 0.8, 0.8],
          kinds: [T, N, N, N],
          minWidth: 480,
          count: summary.nil.length,
          note: tr('compliance:gstr1.nilNote'),
          documents: none(summary.nil.length),
          exportRows: () =>
            reportTable(
              ['Supply type', 'Nil rated', 'Exempted', 'Non-GST'],
              summary.nil.map((n) => [NIL_SUPPLY_LABELS[n.supplyType], toMajor(n.nilRated), toMajor(n.exempt), toMajor(n.nonGst)]),
            ),
        };
      case 'docs':
        return {
          headers: [tr('compliance:gstr1.col.nature'), tr('compliance:gstr1.col.series'), tr('common:table.total'), tr('compliance:gstr1.col.cancelled'), tr('compliance:gstr1.col.net')],
          rows: summary.docs.map((d) => [tr(NATURE_KEY[d.nature]), `${d.from} – ${d.to}`, String(d.total), String(d.cancelled), String(d.total - d.cancelled)]),
          total: [tr('common:table.total'), '', String(sum(summary.docs, (d) => d.total)), String(sum(summary.docs, (d) => d.cancelled)), String(sum(summary.docs, (d) => d.total - d.cancelled))],
          widths: [1.4, 1.2, 0.8, 0.8, 0.8],
          kinds: [T, T, N, N, N],
          minWidth: 560,
          count: summary.docs.length,
          note: tr('compliance:gstr1.docsNote'),
          documents: none(summary.docs.length),
          exportRows: () =>
            reportTable(
              ['Nature of document', 'From', 'To', 'Total number', 'Cancelled', 'Net issued'],
              summary.docs.map((d) => [NATURE_LABEL[d.nature], d.from, d.to, d.total, d.cancelled, d.total - d.cancelled]),
            ),
        };
      case 'amend':
        return {
          headers: [tr('compliance:gstr1.col.table'), tr('compliance:gstr1.col.original'), 'GSTIN / PoS', tr('compliance:gstr1.col.rate'), tr('compliance:gstr1.col.taxable'), ...taxHeads],
          rows: [
            ...amendRows.map(({ table, r }) => [table, `${r.originalNumber} · ${periodLabel(r.originalPeriod)}`, shortGstin(r.gstin) ?? r.placeOfSupplyName, formatPercent(r.rate), f(r.taxableValue), ...taxCells(r.igst.minor, r.cgst.minor, r.sgst.minor, r.cess.minor)]),
            ...b2csa.map(({ originalPeriod, l }) => ['B2CSA', periodLabel(originalPeriod), l.placeOfSupplyName, formatPercent(l.rate), formatMoney(l.taxableValue), ...taxCells(l.igst.minor, l.cgst.minor, l.sgst.minor, l.cess.minor)]),
          ],
          total: (() => {
            const lines = [...amendRows.map((a) => a.r), ...b2csa.map((b) => b.l)];
            return [tr('common:table.total'), '', '', '', m(sum(lines, (l) => l.taxableValue.minor)), ...taxCells(sum(lines, (l) => l.igst.minor), sum(lines, (l) => l.cgst.minor), sum(lines, (l) => l.sgst.minor), sum(lines, (l) => l.cess.minor))];
          })(),
          widths: [0.8, 1.6, 1.1, 0.6, 1.1, 1, 1, 1, 0.8],
          kinds: [T, T, T, N, N, N, N, N, N],
          minWidth: 760,
          count: amendRows.length + b2csa.length,
          note: tr('compliance:gstr1.amendNote'),
          documents: [...amendRows.map(({ r }) => (r.documentId ? { id: r.documentId, kind: r.kind } : undefined)), ...none(b2csa.length)],
          exportRows: () =>
            reportTable(
              ['Table', 'Original number', 'Original date', 'Original period', 'GSTIN', 'Revised number', 'Revised date', 'Place of supply', 'Rate', 'Taxable value', 'IGST', 'CGST', 'SGST', 'Cess', 'Invoice value'],
              [
                ...amendRows.map(({ table, r }) => [table, r.originalNumber, r.originalDate, r.originalPeriod, r.gstin ?? 'URP', r.number, r.date, r.placeOfSupplyName, r.rate, toMajor(r.taxableValue), toMajor(r.igst), toMajor(r.cgst), toMajor(r.sgst), toMajor(r.cess), toMajor(r.invoiceValue)]),
                ...b2csa.map(({ originalPeriod, l }) => ['B2CSA', '', '', originalPeriod, '', '', '', l.placeOfSupplyName, l.rate, toMajor(l.taxableValue), toMajor(l.igst), toMajor(l.cgst), toMajor(l.sgst), toMajor(l.cess), '']),
              ],
            ),
        };
      default: {
        const rows = summary[view];
        return {
          headers: [tr('compliance:gstr1.col.document'), tr('compliance:gstr1.col.rate'), tr('compliance:gstr1.col.taxable'), ...taxHeads, tr('compliance:gstr1.col.invoiceValue')],
          rows: rows.map((r) => [r.number, formatPercent(r.rate), formatMoney(r.taxableValue), ...taxCells(r.igst.minor, r.cgst.minor, r.sgst.minor, r.cess.minor), formatMoney(r.invoiceValue)]),
          // Each document says when, who and (registered) their GSTIN or (not) the place of supply.
          subtitles: rows.map((r) => [formatDate(r.date), r.partyName, r.gstin ?? r.placeOfSupplyName].filter(Boolean).join(' · ')),
          total: [
            tr('common:table.total'),
            '',
            m(sum(rows, (r) => r.taxableValue.minor)),
            ...taxCells(sum(rows, (r) => r.igst.minor), sum(rows, (r) => r.cgst.minor), sum(rows, (r) => r.sgst.minor), sum(rows, (r) => r.cess.minor)),
            '',
          ],
          widths: [2.2, 0.6, 1.1, 1, 1, 1, 0.8, 1.1],
          kinds: [T, N, N, N, N, N, N, N],
          minWidth: 960,
          count: rows.length,
          note: `${label} — ${tr(`compliance:gstr1.table.${view}`)}`,
          documents: rows.map((r) => ({ id: r.documentId, kind: r.kind })),
          exportRows: () =>
            reportTable(
              ['GSTIN', 'Customer', 'Document', 'Date', 'Place of supply', 'Rate', 'Taxable value', 'IGST', 'CGST', 'SGST', 'Cess', 'Invoice value'],
              rows.map((r) => [r.gstin ?? 'URP', r.partyName, r.number, r.date, r.placeOfSupplyName, r.rate, toMajor(r.taxableValue), toMajor(r.igst), toMajor(r.cgst), toMajor(r.sgst), toMajor(r.cess), toMajor(r.invoiceValue)]),
            ),
        };
      }
    }
  };

  return { totals, detail };
}
