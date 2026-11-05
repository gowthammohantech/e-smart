import { autoMatch, lineKey, parseStatementAmount, parseStatementDate, readStatement, suggestMatches, type Candidate } from '../bankStatement';

describe('parseStatementDate', () => {
  it.each([
    ['03/04/2025', '2025-04-03'],
    ['03-04-2025', '2025-04-03'],
    ['03.04.2025', '2025-04-03'],
    ['03/04/25', '2025-04-03'],
    ['3/4/2025', '2025-04-03'],
    ['03-Apr-2025', '2025-04-03'],
    ['03 Apr 2025', '2025-04-03'],
    ['03-APR-25', '2025-04-03'],
    ['3 September 2025', '2025-09-03'],
    ['2025-04-03', '2025-04-03'],
    ['2025-04-03 10:22:01', '2025-04-03'],
    ['03/04/2025 10:22', '2025-04-03'],
    ['45750', '2025-04-03'],
  ])('%s → %s', (input, out) => {
    expect(parseStatementDate(input)).toBe(out);
  });

  it('is day first, never March 4', () => {
    expect(parseStatementDate('03/04/2025')).not.toBe('2025-03-04');
    expect(parseStatementDate('13/04/2025')).toBe('2025-04-13');
    expect(parseStatementDate('04/13/2025')).toBeNull();
  });

  it.each(['', 'Opening Balance', 'Total', '31/02/2025', '12345', '1,234.00'])('%p is not a date', (s) => {
    expect(parseStatementDate(s)).toBeNull();
  });
});

describe('parseStatementAmount', () => {
  it.each([
    ['1,23,456.78', 12345678, undefined],
    ['1234', 123400, undefined],
    ['1,234.00 Cr', 123400, 'cr'],
    ['500.00 Dr', 50000, 'dr'],
    ['500.00Dr.', 50000, 'dr'],
    ['(500.00)', -50000, undefined],
    ['-500', -50000, undefined],
    ['500-', -50000, undefined],
    ['₹ 1,000', 100000, undefined],
    ['Rs. 1,000.5', 100050, undefined],
    ['INR 10.005', 1001, undefined],
    ['', 0, undefined],
    ['-', 0, undefined],
  ])('%p → %p', (input, minor, marker) => {
    const a = parseStatementAmount(input)!;
    expect(a.minor).toBe(minor);
    expect(a.marker).toBe(marker);
  });

  it('cannot read words', () => {
    expect(parseStatementAmount('abc')).toBeNull();
    expect(parseStatementAmount('12.3.4')).toBeNull();
  });
});

describe('readStatement', () => {
  const sbi = [
    ['State Bank of India'],
    ['Account Name', 'VERTEX TRADERS'],
    ['Account Number', '00000012345678901'],
    [],
    ['Txn Date', 'Value Date', 'Description', 'Ref No./Cheque No.', 'Debit', 'Credit', 'Balance'],
    ['01/04/2025', '02/04/2025', 'UPI/509112345678/Acme Retail', '509112345678', '', '11,800.00', '1,11,800.00'],
    ['02/04/2025', '02/04/2025', 'NEFT   ACME  ', '', '', '', '1,11,800.00'],
    ['03/04/2025', '03/04/2025', 'CHQ PAID 000123 SHAH SUPPLIES', '000123', '5,000.00', '', '1,06,800.00'],
    ['04/04/2025', '04/04/2025', 'BAD ROW', '', 'n/a', '', ''],
    [],
    ['', '', 'Total', '', '5,000.00', '11,800.00', ''],
    ['** End of statement **'],
  ];

  it('finds the header below the account details and reads debit/credit columns', () => {
    const r = readStatement(sbi);
    expect(r.headerRow).toBe(4);
    expect(r.mapping).toEqual({ date: 0, description: 2, reference: 3, debit: 4, credit: 5, balance: 6 });
    expect(r.lines).toEqual([
      { row: 6, date: '2025-04-01', description: 'UPI/509112345678/Acme Retail', reference: '509112345678', amountMinor: 1180000, balanceMinor: 11180000 },
      { row: 8, date: '2025-04-03', description: 'CHQ PAID 000123 SHAH SUPPLIES', reference: '000123', amountMinor: -500000, balanceMinor: 10680000 },
    ]);
    expect(r.errors).toEqual([{ row: 9, message: 'Can\'t read the amount "n/a"' }]);
  });

  it('prefers the transaction date over the value date, whatever order they come in', () => {
    const r = readStatement([['Value Date', 'Transaction Date', 'Narration', 'Withdrawal Amt (INR)', 'Deposit Amt (INR)', 'Closing Balance']]);
    expect(r.mapping.date).toBe(1);
    expect(r.mapping.debit).toBe(3);
    expect(r.mapping.credit).toBe(4);
  });

  it('reads one amount column with a Dr/Cr column, or a marker on the amount', () => {
    const r = readStatement([
      ['Date', 'Particulars', 'Amount', 'Dr/Cr', 'Balance'],
      ['05-Apr-2025', 'Interest', '120.00', 'CR', '1,000.00 Cr'],
      ['06-Apr-2025', 'Charges', '59.00', 'DR', '941.00 Cr'],
    ]);
    expect(r.lines.map((l) => [l.amountMinor, l.balanceMinor])).toEqual([
      [12000, 100000],
      [-5900, 94100],
    ]);
    const marked = readStatement([
      ['Date', 'Remarks', 'Transaction Amount'],
      ['2025-04-05', 'In', '1,000.00 Cr'],
      ['2025-04-06', 'Out', '250.00 Dr'],
      ['2025-04-07', 'Out', '(10.00)'],
    ]);
    expect(marked.lines.map((l) => l.amountMinor)).toEqual([100000, -25000, -1000]);
  });

  it('takes a mapping over what the header says', () => {
    const r = readStatement(
      [
        ['When', 'What', 'Money'],
        ['01/04/2025', 'x', '-10'],
      ],
      { date: 0, description: 1, amount: 2 },
    );
    expect(r.lines).toEqual([{ row: 2, date: '2025-04-01', description: 'x', amountMinor: -1000 }]);
  });

  it('says so when there is no header', () => {
    const r = readStatement([['hello'], ['01/04/2025', '10']]);
    expect(r.lines).toEqual([]);
    expect(r.errors[0].message).toMatch(/No header row/);
  });
});

describe('lineKey', () => {
  const line = { date: '2025-04-01', amountMinor: 1180000, description: 'UPI/509112345678/Acme  Retail', balanceMinor: 11180000 };
  it('is stable and ignores case and punctuation in the narration', () => {
    expect(lineKey(line)).toBe(lineKey({ ...line, description: 'upi 509112345678 acme retail' }));
    expect(lineKey(line)).not.toBe(lineKey({ ...line, balanceMinor: 1 }));
    expect(lineKey(line, 2)).toBe(`${lineKey(line)}#2`);
  });
  it('fits 200 characters', () => {
    expect(lineKey({ ...line, description: 'x'.repeat(500) }, 3).length).toBe(200);
  });
});

describe('matching', () => {
  const line = (amountMinor: number, date: string, description = '', reference?: string, id?: string) => ({ id, date, amountMinor, description, reference });
  const pay = (id: string, amountMinor: number, date: string, extra: Partial<Candidate> = {}): Candidate => ({ type: 'payment', id, amountMinor, date, ...extra });

  it('suggests only the exact amount within the tolerance, closest first, reference hits on top', () => {
    const s = suggestMatches(line(10000, '2025-04-05', 'NEFT/UTR998877/ACME'), [
      pay('a', 10000, '2025-04-05'),
      pay('b', 10000, '2025-04-07', { reference: 'UTR998877' }),
      pay('c', 10000, '2025-04-09'),
      pay('d', 10001, '2025-04-05'),
      pay('e', -10000, '2025-04-05'),
    ]);
    expect(s.map((x) => x.id)).toEqual(['b', 'a']);
    expect(s[0].referenceHit).toBe(true);
    expect(suggestMatches(line(10000, '2025-04-05'), [pay('c', 10000, '2025-04-09')], { dayTolerance: 5 })).toHaveLength(1);
  });

  it('boosts on the party name and the record number, and caps at five', () => {
    const s = suggestMatches(line(500, '2025-04-05', 'IMPS ACME RETAIL PVT LTD'), [pay('a', 500, '2025-04-05'), pay('b', 500, '2025-04-05', { partyName: 'Acme Retail Pvt Ltd' })]);
    expect(s[0].id).toBe('b');
    expect(s[0].partyHit).toBe(true);
    const chq = suggestMatches(line(500, '2025-04-05', 'BY CHQ 123'), [pay('a', 500, '2025-04-05'), pay('b', 500, '2025-04-06', { reference: '000123' }), pay('c', 500, '2025-04-06', { reference: '001234' })]);
    expect(chq.map((x) => [x.id, x.referenceHit])).toEqual([
      ['b', true],
      ['a', false],
      ['c', false],
    ]);
    const n = suggestMatches(line(500, '2025-04-05', 'AGAINST PAY-0042'), [pay('a', 500, '2025-04-05'), pay('c', 500, '2025-04-06', { number: 'PAY/0042' })]);
    expect(n[0].id).toBe('c');
    const many = Array.from({ length: 8 }, (_, i) => pay(`p${i}`, 500, '2025-04-05'));
    expect(suggestMatches(line(500, '2025-04-05'), many)).toHaveLength(5);
  });

  it('auto-matches the only candidate, and a UTR between two equal ones', () => {
    const m = autoMatch(
      [line(10000, '2025-04-05', 'NEFT', undefined, 'l1'), line(20000, '2025-04-06', 'UPI/4455667788/X', undefined, 'l2')],
      [pay('a', 10000, '2025-04-04'), pay('b', 20000, '2025-04-06', { reference: '4455667788' }), pay('c', 20000, '2025-04-06')],
    );
    expect(m.get('l1')?.id).toBe('a');
    expect(m.get('l2')?.id).toBe('b');
  });

  it('leaves equal lines and equal records alone, and never uses a record twice', () => {
    const lines = [line(500, '2025-04-05', 'x', undefined, 'l1'), line(500, '2025-04-05', 'y', undefined, 'l2')];
    expect(autoMatch(lines, [pay('a', 500, '2025-04-05'), pay('b', 500, '2025-04-05')]).size).toBe(0);
    expect(autoMatch(lines, [pay('a', 500, '2025-04-05')]).size).toBe(0);
  });

  it('pairs the rest once a reference settles one of them', () => {
    const lines = [line(500, '2025-04-05', 'UPI 99887766', undefined, 'l1'), line(500, '2025-04-05', 'cash dep', undefined, 'l2')];
    const m = autoMatch(lines, [pay('a', 500, '2025-04-05', { reference: '99887766' }), pay('b', 500, '2025-04-05')]);
    expect(m.get('l1')?.id).toBe('a');
    expect(m.get('l2')?.id).toBe('b');
  });

  it('keys by row when lines have no id', () => {
    const m = autoMatch([{ row: 7, date: '2025-04-05', amountMinor: -300, description: '' }], [{ type: 'expense', id: 'e', date: '2025-04-05', amountMinor: -300 }]);
    expect(m.get(7)?.type).toBe('expense');
  });
});
