import { gstr1RateSummary, type Gstr1Row, type Gstr1Table } from '../gstr1';
import { money } from '../../lib/money';

const m = (minor: number) => money(minor, 'INR');
const row = (table: Gstr1Table, documentId: string, rate: number, taxable: number, tax: { igst?: number; cgst?: number; sgst?: number; cess?: number }, noteType?: 'C' | 'D'): Gstr1Row => ({
  documentId,
  kind: noteType ? 'creditNote' : 'invoice',
  table,
  partyName: 'x',
  number: documentId,
  date: '2026-09-10',
  placeOfSupply: '29',
  placeOfSupplyName: 'Karnataka',
  rate,
  taxableValue: m(taxable),
  igst: m(tax.igst ?? 0),
  cgst: m(tax.cgst ?? 0),
  sgst: m(tax.sgst ?? 0),
  cess: m(tax.cess ?? 0),
  invoiceValue: m(0),
  ...(noteType && { noteType }),
});

describe('gstr1RateSummary', () => {
  it('adds each rate up across the tables, net of credit notes', () => {
    const empty = { b2b: [], b2cl: [], b2cs: [], exp: [], cdnr: [], cdnur: [] };
    const lines = gstr1RateSummary(
      {
        ...empty,
        b2b: [row('b2b', 'a', 18, 100_000, { igst: 18_000 }), row('b2b', 'a', 5, 20_000, { igst: 1_000 })],
        b2cs: [row('b2cs', 'b', 18, 50_000, { cgst: 4_500, sgst: 4_500, cess: 500 })],
        cdnr: [row('cdnr', 'c', 18, 10_000, { igst: 1_800 }, 'C')],
      },
      'INR',
    );
    expect(lines.map((l) => l.rate)).toEqual([5, 18]);
    expect(lines[1]).toEqual({ rate: 18, taxableValue: m(140_000), igst: m(16_200), cgst: m(4_500), sgst: m(4_500), cess: m(500), documents: 3 });
    expect(lines[0].documents).toBe(1);
  });
});
