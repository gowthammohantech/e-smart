import { accepts, assignColumn, base64OfDataUrl, extensionOf, fileColumns, initialMapping, missingRequired, readsOnDevice, trimRows, type ImportField } from '../importMapping';

const fields: ImportField[] = [
  { key: 'date', label: 'Date', required: true },
  { key: 'description', label: 'Narration', required: true },
  { key: 'amount', label: 'Amount' },
];
const untitled = (n: number) => `Column ${n}`;

describe('fileColumns', () => {
  it('names columns from the header row, and blank ones by number', () => {
    const rows = [['Account 1234'], ['Date', '', ' Withdrawal  Amt '], ['01/04/2025', 'x', '100', '200']];
    expect(fileColumns(rows, 1, untitled)).toEqual([
      { index: 0, label: 'Date' },
      { index: 1, label: 'Column 2' },
      { index: 2, label: 'Withdrawal Amt' },
      { index: 3, label: 'Column 4' },
    ]);
  });

  it('numbers every column of a file with no header row', () => {
    expect(fileColumns([['a', 'b']], -1, untitled).map((c) => c.label)).toEqual(['Column 1', 'Column 2']);
  });
});

describe('initialMapping', () => {
  it('keeps what was detected for the fields asked about, within the file', () => {
    expect(initialMapping(fields, { date: 0, description: 2, amount: 9, balance: 3 }, 4)).toEqual({ date: 0, description: 2, amount: undefined });
  });

  it('gives a column to the first field that claims it', () => {
    expect(initialMapping(fields, { date: 1, description: 1 }, 3)).toEqual({ date: 1, description: undefined, amount: undefined });
  });
});

describe('assignColumn', () => {
  it('moves a column from the field that had it', () => {
    expect(assignColumn({ date: 0, description: 1, amount: undefined }, 'amount', 1)).toEqual({ date: 0, description: undefined, amount: 1 });
  });

  it('clears a field', () => {
    expect(assignColumn({ date: 0, description: 1 }, 'date', undefined)).toEqual({ date: undefined, description: 1 });
  });
});

describe('missingRequired', () => {
  it('lists required fields without a column', () => {
    expect(missingRequired(fields, { date: 0, description: undefined, amount: undefined }).map((f) => f.key)).toEqual(['description']);
    expect(missingRequired(fields, { date: 0, description: 1 })).toEqual([]);
  });
});

describe('file kinds', () => {
  it('reads extensions', () => {
    expect(extensionOf('Statement Apr.CSV')).toBe('.csv');
    expect(extensionOf('noext')).toBe('');
    expect(accepts('a.xlsx', ['.csv', '.xlsx'])).toBe(true);
    expect(accepts('a.xls', ['.csv', '.xlsx'])).toBe(false);
    expect(readsOnDevice('a.csv')).toBe(true);
    expect(readsOnDevice('a.xlsx')).toBe(false);
  });

  it('takes the payload of a data URL', () => {
    expect(base64OfDataUrl('data:application/octet-stream;base64,QUJD')).toBe('QUJD');
    expect(base64OfDataUrl('QUJD')).toBe('QUJD');
  });

  it('drops trailing blank rows', () => {
    expect(trimRows([['a'], ['', ' '], []])).toEqual([['a']]);
  });
});
