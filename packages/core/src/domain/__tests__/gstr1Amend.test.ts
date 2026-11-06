import { gstr1Amendments, type ReportedRow } from '../gstr1Amend';
import type { Gstr1Row } from '../gstr1';
import { fromMajor } from '../../lib/money';

const inr = (major: string) => fromMajor(major, 'INR');
const row = (over: Partial<Gstr1Row> = {}): Gstr1Row => ({
  documentId: 'inv1',
  kind: 'invoice',
  table: 'b2b',
  gstin: '29AABCA1111A1ZB',
  partyName: 'Anand',
  number: 'INV-1',
  date: '2026-08-10',
  placeOfSupply: '29',
  placeOfSupplyName: 'Karnataka',
  rate: 18,
  taxableValue: inr('1000'),
  cgst: inr('0'),
  sgst: inr('0'),
  igst: inr('180'),
  cess: inr('0'),
  invoiceValue: inr('1180'),
  ...over,
});
const reported = (r: Gstr1Row, period = '082026'): ReportedRow => ({ ...r, period });

describe('GSTR-1 amendments', () => {
  it('reports a changed B2B invoice in B2BA with its original number, and the difference for 3B', () => {
    const was = row();
    const now = row({ number: 'INV-1', taxableValue: inr('1200'), igst: inr('216'), invoiceValue: inr('1416') });
    const a = gstr1Amendments([reported(was)], [now], '092026');
    expect(a.b2ba).toEqual([expect.objectContaining({ originalNumber: 'INV-1', originalPeriod: '082026', taxableValue: inr('1200') })]);
    expect(a.delta).toEqual({ taxable: 20_000, igst: 3_600, cgst: 0, sgst: 0, cess: 0 });
  });

  it('reports a cancelled invoice at nil, and nothing for one unchanged', () => {
    const a = gstr1Amendments([reported(row()), reported(row({ documentId: 'inv2', number: 'INV-2' }))], [row({ documentId: 'inv2', number: 'INV-2' })], '092026');
    expect(a.b2ba).toHaveLength(1);
    expect(a.b2ba[0]).toMatchObject({ documentId: 'inv1', taxableValue: inr('0'), igst: inr('0') });
    expect(a.delta.igst).toBe(-18_000);
  });

  it('takes the latest report of a document, so an amendment once filed is not repeated', () => {
    const amended = row({ taxableValue: inr('1200'), igst: inr('216'), invoiceValue: inr('1416') });
    const a = gstr1Amendments([reported(row()), reported(amended, '092026')], [amended], '102026');
    expect(a.rows).toEqual([]);
  });

  it('restates a B2CS month by place and rate in B2CSA', () => {
    const small = (id: string, taxable: string, igst: string) => row({ documentId: id, table: 'b2cs', gstin: undefined, number: id, taxableValue: inr(taxable), igst: inr(igst), invoiceValue: inr(taxable) });
    const a = gstr1Amendments([reported(small('s1', '100', '18')), reported(small('s2', '200', '36'))], [small('s1', '150', '27'), small('s2', '200', '36')], '092026');
    expect(a.b2csa).toEqual([{ originalPeriod: '082026', rows: [expect.objectContaining({ documentId: 's1' }), expect.objectContaining({ documentId: 's2' })] }]);
    expect(a.delta.taxable).toBe(5_000);
  });
});
