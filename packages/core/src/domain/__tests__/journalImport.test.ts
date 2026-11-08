import { parseCsv } from '../../lib/csv';
import { guessJournalColumns, isoDate, journalsFromCsv } from '../journalImport';

const accounts = [
  { key: 'sys:rent', name: 'Rent' },
  { key: 'pay:cash', name: 'Cash' },
  { key: 'acc:dep', name: 'Depreciation' },
  { key: 'sys:fixedAssets', name: 'Fixed assets' },
];

describe('journals from a CSV', () => {
  it('groups lines by reference and finds accounts by name', () => {
    const rows = parseCsv(
      [
        'Date,Voucher No,Ledger,Debit,Credit,Narration',
        '31/03/2026,JV1,Rent,"12,000",,March rent',
        '31/03/2026,JV1,cash,,12000,',
        '2026-03-31,JV2,Depreciation,5000,,Year-end',
        '2026-03-31,JV2,Fixed Assets,,4000,',
        '31/02/2026,JV3,Nowhere,1,,',
      ].join('\n'),
    );
    const out = journalsFromCsv(rows, guessJournalColumns(rows[0]), accounts, 'INR');
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ reference: 'JV1', date: '2026-03-31', narration: 'March rent', problems: [] });
    expect(out[0].lines).toEqual([
      { account: 'sys:rent', debitMinor: 1_200_000, creditMinor: 0, narration: 'March rent' },
      { account: 'pay:cash', debitMinor: 0, creditMinor: 1_200_000 },
    ]);
    expect(out[1].problems).toEqual(['Debits (5000.00) and credits (4000.00) differ']);
    expect(out[2].problems).toContain('Line 6: "31/02/2026" is not a date');
    expect(out[2].problems).toContain('Line 6: no account called "Nowhere"');
  });

  it('runs rows without a reference into one journal only while they are next to each other', () => {
    const rows = parseCsv(
      [
        'Date,Voucher No,Ledger,Debit,Credit',
        '31/03/2026,,Rent,100,',
        '31/03/2026,,Cash,,100',
        '31/03/2026,JV9,Depreciation,50,',
        '31/03/2026,JV9,Fixed Assets,,50',
        '31/03/2026,,Rent,70,',
        '31/03/2026,,Cash,,70',
      ].join('\n'),
    );
    const out = journalsFromCsv(rows, guessJournalColumns(rows[0]), accounts, 'INR');
    expect(out).toHaveLength(3);
    expect(out.map((j) => j.lines.length)).toEqual([2, 2, 2]);
    expect(out.every((j) => j.problems.length === 0)).toBe(true);
  });

  it('reads the dates people type', () => {
    expect(isoDate('5/4/2026')).toBe('2026-04-05');
    expect(isoDate('2026-04-05')).toBe('2026-04-05');
    expect(isoDate('31-04-2026')).toBeUndefined();
    expect(isoDate('April 5')).toBeUndefined();
  });
});
