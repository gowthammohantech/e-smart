import { parseCsv } from '../../lib/csv';
import { guessOpeningColumns, openingRecords } from '../openingImport';

const text = {
  noParty: 'No party',
  noNumber: 'No number',
  badDate: (v: string) => `Date "${v}"`,
  badDueDate: (v: string) => `Due date "${v}"`,
  badAmount: (v: string) => `Amount "${v}"`,
};

describe('opening invoices from a spreadsheet', () => {
  it('reads a Tally-style outstanding list: day-first dates, Indian amounts, Dr/Cr', () => {
    const rows = parseCsv(
      ['Party Name,Bill No,Date,Due On,Pending Amount', 'Sunrise Retail,OLD/101,10/03/2026,09-Apr-2026,"1,20,000.50 Dr"', 'Anand Enterprises,OLD/102,20-03-2026,,(2500)', ',X,bad,,0'].join('\n'),
    );
    const mapping = guessOpeningColumns(rows[0]);
    expect(mapping).toEqual({ party: 0, number: 1, date: 2, dueDate: 3, amount: 4 });
    const { records, errors } = openingRecords(rows, 0, mapping, 'INR', text);
    expect(records).toEqual([
      { row: 2, party: 'Sunrise Retail', number: 'OLD/101', date: '2026-03-10', dueDate: '2026-04-09', amount: { minor: 12_000_050, currency: 'INR' } },
      { row: 3, party: 'Anand Enterprises', number: 'OLD/102', date: '2026-03-20', amount: { minor: 250_000, currency: 'INR' } },
    ]);
    expect(errors).toEqual([{ row: 4, message: 'No party · Date "bad" · Amount "0"' }]);
  });
});
