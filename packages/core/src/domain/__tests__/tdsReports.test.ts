import type { Posting } from '../ledger/postings';
import { tdsDepositDue, tdsPayableSummary, tdsReceivable, tdsReturnRows } from '../tdsReports';
import { BusinessDocument, Voucher } from '../../types';
import { fromMajor, zero } from '../../lib/money';

const inr = (major: string) => fromMajor(major, 'INR');
const FY = { from: '2026-04-01', to: '2027-03-31' };
const posting = (over: Partial<Posting>): Posting => ({ date: '2026-09-10', account: 'sys:tdsPayable:194C', debit: 0, credit: 0, source: { type: 'document', id: 'b1', number: 'B1', kind: 'purchaseBill' }, ...over });
const challan = (id: string, date: string, section: string, major: string, depositedOn = date): Voucher => ({
  id,
  companyId: 'c',
  branchId: 'b',
  kind: 'tdsChallan',
  number: `TDS-${id}`,
  date,
  challan: { bsrCode: '0510308', serial: '00042', depositedOn },
  lines: [
    { account: `sys:tdsPayable:${section}`, debit: inr(major), credit: zero('INR') },
    { account: 'pay:bank', debit: zero('INR'), credit: inr(major) },
  ],
  createdBy: 'u',
  createdAt: '',
});
const bill = (id: string, date: string, tds: string, over: Partial<BusinessDocument> = {}): BusinessDocument =>
  ({
    id,
    kind: 'purchaseBill',
    status: 'issued',
    number: `PB-${id}`,
    supplierDocNumber: `S-${id}`,
    date,
    partyId: 'sup',
    currency: 'INR',
    exchangeRate: 1,
    tds: { section: '194C', rate: 2, amount: inr(tds) },
    totals: { taxableAmount: inr(String(Number(tds) * 50)) },
    ...over,
  }) as BusinessDocument;
const parties = [{ id: 'sup', name: 'Kaveri Transport', pan: 'AAACK1234K' }, { id: 'cus', name: 'Anand Exports', pan: 'AABCA1111A' }];

describe('TDS deposit due dates (Rule 30)', () => {
  it('falls on the 7th of the next month, and 30 April for March', () => {
    expect(tdsDepositDue('2026-09-18')).toBe('2026-10-07');
    expect(tdsDepositDue('2026-12-02')).toBe('2027-01-07');
    expect(tdsDepositDue('2027-03-31')).toBe('2027-04-30');
  });
});

describe('TDS payable summary', () => {
  it('shows each month’s deductions, settles the oldest first from challans, and flags what is overdue', () => {
    const postings = [
      posting({ date: '2026-08-20', credit: 100_000 }),
      posting({ date: '2026-09-10', credit: 60_000 }),
      // A supplier credit note gives some back.
      posting({ date: '2026-09-25', debit: 10_000, source: { type: 'document', id: 'cn', number: 'CN', kind: 'supplierCreditNote' } }),
      posting({ date: '2026-09-05', debit: 100_000, source: { type: 'voucher', id: 'v1', number: 'TDS-1', kind: 'tdsChallan' } }),
      // TDS kept back on a payment names no section.
      posting({ date: '2026-09-12', account: 'sys:tdsPayable', credit: 5_000, source: { type: 'payment', id: 'p', number: 'PAY-1' } }),
    ];
    const rows = tdsPayableSummary(postings, FY, '2026-10-15');
    expect(rows.map((r) => [r.section, r.month, r.deductedMinor, r.depositedMinor, r.balanceMinor, r.overdue])).toEqual([
      ['194C', '2026-08', 100_000, 100_000, 0, false],
      ['', '2026-09', 5_000, 0, 5_000, true],
      ['194C', '2026-09', 50_000, 0, 50_000, true],
    ]);
    expect(rows[2].dueDate).toBe('2026-10-07');
  });
});

describe('TDS receivable', () => {
  it('adds up what each customer kept back, by quarter', () => {
    const rows = tdsReceivable(
      [
        posting({ account: 'sys:tdsReceivable', date: '2026-07-10', debit: 20_000, partyId: 'cus', source: { type: 'payment', id: 'r1', number: 'R1' } }),
        posting({ account: 'sys:tdsReceivable', date: '2026-08-10', debit: 30_000, partyId: 'cus', source: { type: 'payment', id: 'r2', number: 'R2' } }),
        posting({ account: 'sys:tdsReceivable', date: '2026-10-10', debit: 5_000, partyId: 'cus', source: { type: 'payment', id: 'r3', number: 'R3' } }),
      ],
      parties,
      FY,
    );
    expect(rows.map((r) => [r.partyName, r.quarter, r.tdsMinor, r.receipts])).toEqual([
      ['Anand Exports', 'FY 2026-27 Q2', 50_000, 2],
      ['Anand Exports', 'FY 2026-27 Q3', 5_000, 1],
    ]);
  });
});

describe('Form 26Q rows and the challan register', () => {
  it('names the challan that deposited each deduction, oldest first, and counts them on the challan', () => {
    const { deductees, challans } = tdsReturnRows(
      [bill('a', '2026-08-20', '1000'), bill('b', '2026-09-10', '600'), bill('c', '2026-09-28', '400')],
      [challan('1', '2026-09-05', '194C', '1000'), challan('2', '2026-10-06', '194C', '600')],
      parties,
      'INR',
      FY,
    );
    expect(deductees.map((d) => [d.number, d.pan, d.amountMinor, d.tdsMinor, d.challan?.number])).toEqual([
      ['S-a', 'AAACK1234K', 5_000_000, 100_000, 'TDS-1'],
      ['S-b', 'AAACK1234K', 3_000_000, 60_000, 'TDS-2'],
      ['S-c', 'AAACK1234K', 2_000_000, 40_000, undefined],
    ]);
    expect(challans.map((c) => [c.number, c.bsrCode, c.totalMinor, c.deductions])).toEqual([
      ['TDS-1', '0510308', 100_000, 1],
      ['TDS-2', '0510308', 60_000, 1],
    ]);
  });
});
