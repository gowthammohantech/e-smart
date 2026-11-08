import { amountProblem, chunkByDate, detectStatement, statementFields, toStatementLines } from '../statementImport';

const messages = { badAmount: (v: string) => `bad ${v}`, noColumns: 'no columns' };

const hdfc = [
  ['HDFC BANK Ltd.'],
  ['Account No : 50100012345678'],
  [],
  ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
  ['01/04/25', 'UPI-MURUGAN TRADERS', '0000412345', '01/04/25', '', '5,000.00', '15,000.00'],
  ['02/04/25', 'NEFT-RENT APRIL', 'N1234', '02/04/25', '12,000.00', '', '3,000.00'],
  ['03/04/25', 'BAD ROW', '', '03/04/25', 'abc', '', ''],
];

describe('bank statement import', () => {
  it('marks date and narration required', () => {
    const fields = statementFields((f) => f);
    expect(fields.filter((f) => f.required).map((f) => f.key)).toEqual(['date', 'description']);
    expect(fields).toHaveLength(8);
  });

  it('finds the header under the account details', () => {
    const d = detectStatement(hdfc);
    expect(d.headerRow).toBe(3);
    expect(d.mapping).toMatchObject({ date: 0, description: 1, reference: 2, debit: 4, credit: 5, balance: 6 });
    expect(d.mapping.amount).toBeUndefined();
  });

  it('reads signed lines numbered as the file numbers its rows', () => {
    const d = detectStatement(hdfc);
    const { records, errors } = toStatementLines(hdfc, d.headerRow, d.mapping, messages);
    expect(records.map((r) => [r.row, r.date, r.amountMinor, r.balanceMinor])).toEqual([
      [5, '2025-04-01', 500000, 1500000],
      [6, '2025-04-02', -1200000, 300000],
    ]);
    expect(errors).toEqual([{ row: 7, message: 'bad abc' }]);
  });

  it('keeps a column the person unmapped unmapped', () => {
    const d = detectStatement(hdfc);
    const { records } = toStatementLines(hdfc, d.headerRow, { ...d.mapping, balance: undefined }, messages);
    expect(records[0].balanceMinor).toBeUndefined();
  });

  it('reads a file with no header row from a mapping', () => {
    const rows = [
      ['01/04/2025', 'Interest', '120.50', 'Cr'],
      ['02/04/2025', 'Charges', '50', 'Dr'],
    ];
    const d = detectStatement(rows);
    expect(d.headerRow).toBe(-1);
    const { records } = toStatementLines(rows, -1, { date: 0, description: 1, amount: 2, type: 3 }, messages);
    expect(records.map((r) => [r.row, r.amountMinor])).toEqual([
      [1, 12050],
      [2, -5000],
    ]);
  });

  it('needs an amount, or a debit or credit column', () => {
    expect(amountProblem({ date: 0, description: 1 })).toBe('noAmount');
    expect(amountProblem({ date: 0, description: 1, credit: 3 })).toBeUndefined();
    expect(toStatementLines(hdfc, 3, { date: 0, description: 1 }, messages).errors).toEqual([{ row: 4, message: 'no columns' }]);
  });
});

describe('chunkByDate', () => {
  const day = (date: string, n: number) => Array.from({ length: n }, (_, i) => ({ date, i }));
  it('keeps a small statement whole', () => {
    const lines = day('2025-04-01', 3);
    expect(chunkByDate(lines, 5)).toEqual([lines]);
  });
  it('cuts only where the date changes, never splitting a day', () => {
    const lines = [...day('2025-04-01', 3), ...day('2025-04-02', 3), ...day('2025-04-03', 2)];
    const parts = chunkByDate(lines, 5);
    expect(parts.map((p) => p.length)).toEqual([3, 5]);
    expect(parts.flat()).toEqual(lines);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(5);
  });
  it('keeps a day bigger than a part whole', () => {
    const lines = [...day('2025-04-01', 2), ...day('2025-04-02', 7), ...day('2025-04-03', 1)];
    expect(chunkByDate(lines, 5).map((p) => p.length)).toEqual([2, 7, 1]);
  });
});
