import type { Posting } from '../ledger/postings';
import { expectedSaleTds, tdsFor } from '../tds';
import { tds26asMatch, tdsReceivable } from '../tdsReports';
import { tcsDepositDue, tcsPayableSummary, tcsRegister } from '../tcsReports';
import type { BusinessDocument } from '../../types';
import { fromMajor, zero } from '../../lib/money';

const inr = (major: string) => fromMajor(major, 'INR');
const FY = { from: '2026-04-01', to: '2027-03-31' };
const parties = [{ id: 'cus', name: 'Anand Exports', pan: 'AABCA1234F' }];
const receipt = (date: string, account: string, minor: number, id = date): Posting => ({ date, account, debit: minor, credit: 0, partyId: 'cus', source: { type: 'payment', id, number: id } });

describe('TDS a customer will deduct from an invoice (RULES 4.14)', () => {
  it('works on the taxable value at the section rate for the seller, or the rate given', () => {
    // 194J(b) is 10% for everyone; a company PAN (C) takes the "other" rate.
    expect(expectedSaleTds({ section: '194JB', sellerPan: 'AABCE1234F', date: '2026-11-10', baseMinor: 100_000_00 })).toEqual({ section: '194JB', rate: 10, amountMinor: 10_000_00 });
    expect(expectedSaleTds({ section: '194C', sellerPan: 'AABPE1234F', date: '2026-11-10', baseMinor: 100_000_00 })?.rate).toBe(1);
    expect(expectedSaleTds({ section: '194C', rate: 1.5, date: '2026-11-10', baseMinor: 100_000_00 })?.amountMinor).toBe(1_500_00);
    // No PAN on file is not the no-PAN rate: the customer has it.
    expect(expectedSaleTds({ section: '194C', date: '2026-11-10', baseMinor: 100_000_00 })?.rate).toBe(2);
    expect(expectedSaleTds({ section: 'none', date: '2026-11-10', baseMinor: 100 })).toBeUndefined();
    expect(expectedSaleTds({ section: '194C', rate: 0, date: '2026-11-10', baseMinor: 100 })).toBeUndefined();
  });
});

describe('TDS on a bill already kept back on what paid it (G11)', () => {
  it('keeps back only the rest', () => {
    const base = { section: '194C', pan: 'AABCK1234F', date: '2026-11-10', baseMinor: 50_000_00, prior: { baseMinor: 0, tdsMinor: 0 } };
    expect(tdsFor(base).amountMinor).toBe(1_000_00);
    expect(tdsFor({ ...base, deductedOnPaymentsMinor: 400_00 }).amountMinor).toBe(600_00);
    expect(tdsFor({ ...base, deductedOnPaymentsMinor: 5_000_00 }).amountMinor).toBe(0);
  });
});

describe('TDS receivable by section and quarter, and the 26AS match', () => {
  it('groups by section, customer and quarter; an older receipt without a section stays apart', () => {
    const rows = tdsReceivable(
      [receipt('2026-07-10', 'sys:tdsReceivable:194JB', 20_000), receipt('2026-08-10', 'sys:tdsReceivable:194JB', 30_000), receipt('2026-08-11', 'sys:tdsReceivable', 5_000), receipt('2026-10-10', 'sys:tdsReceivable:194C', 1_000)],
      parties,
      FY,
    );
    expect(rows.map((r) => [r.quarter, r.section, r.fy, r.tdsMinor, r.receipts])).toEqual([
      ['FY 2026-27 Q2', '', '2026-27', 5_000, 1],
      ['FY 2026-27 Q2', '194JB', '2026-27', 50_000, 2],
      ['FY 2026-27 Q3', '194C', '2026-27', 1_000, 1],
    ]);
  });

  it('matches what invoices expected against what receipts recorded, per customer and quarter', () => {
    const invoice = (id: string, date: string, tds: string, status = 'issued') =>
      ({ id, kind: 'invoice', status, partyId: 'cus', date, currency: 'INR', exchangeRate: 1, tdsExpected: { section: '194JB', rate: 10, amount: inr(tds) } }) as BusinessDocument;
    const rows = tds26asMatch(
      [receipt('2026-08-20', 'sys:tdsReceivable:194JB', 1_000_00)],
      [invoice('a', '2026-07-05', '1000'), invoice('b', '2026-11-05', '500'), invoice('c', '2026-11-06', '900', 'cancelled')],
      [{ ...parties[0], tan: 'MUMA12345B' }],
      'INR',
      FY,
    );
    expect(rows.map((r) => [r.quarter, r.tan, r.expectedMinor, r.recordedMinor, r.differenceMinor])).toEqual([
      ['FY 2026-27 Q2', 'MUMA12345B', 1_000_00, 1_000_00, 0],
      ['FY 2026-27 Q3', 'MUMA12345B', 500_00, 0, -500_00],
    ]);
  });
});

describe('TCS register and TCS payable', () => {
  const totals = (taxable: number, tax: number, tcs: number) => ({ subtotal: inr(String(taxable)), lineDiscount: zero('INR'), taxableAmount: inr(String(taxable)), taxLines: [], totalTax: inr(String(tax)), documentDiscount: zero('INR'), charges: zero('INR'), roundOff: zero('INR'), tcs: inr(String(tcs)), grandTotal: inr(String(taxable + tax + tcs)), grandTotalBase: inr(String(taxable + tax + tcs)) });
  const doc = (id: string, kind: string, date: string, taxable: number, tax: number, tcs: number, status = 'issued') =>
    ({ id, number: id.toUpperCase(), kind, status, date, partyId: 'cus', currency: 'INR', exchangeRate: 1, tcs: { section: 'scrap', rate: 1 }, totals: totals(taxable, tax, tcs) }) as unknown as BusinessDocument;

  it('lists invoices that collected TCS and credit notes that gave it back, negative', () => {
    const rows = tcsRegister([doc('i1', 'invoice', '2026-07-10', 10_000, 1_800, 118), doc('c1', 'creditNote', '2026-08-02', 1_000, 180, 12), doc('d1', 'invoice', '2026-08-03', 1_000, 180, 12, 'draft')], parties, 'INR', FY);
    expect(rows.map((r) => [r.number, r.pan, r.sectionLabel, r.baseMinor, r.rate, r.tcsMinor])).toEqual([
      ['I1', 'AABCA1234F', '206C(1) scrap', 11_800_00, 1, 118_00],
      ['C1', 'AABCA1234F', '206C(1) scrap', -1_180_00, 1, -12_00],
    ]);
  });

  it('owes TCS by section and month, a challan settling the oldest first, with 27EQ quarter rows', () => {
    const p = (date: string, credit: number, debit = 0, kind?: string): Posting => ({ date, account: 'sys:tcsPayable:scrap', debit, credit, source: kind ? { type: 'voucher', id: date, number: date, kind } : { type: 'document', id: date, number: date } });
    const register = tcsRegister([doc('i1', 'invoice', '2026-07-10', 10_000, 1_800, 118), doc('c1', 'creditNote', '2026-08-02', 1_000, 180, 12)], parties, 'INR', FY);
    const { months, quarters } = tcsPayableSummary([p('2026-07-10', 118_00), p('2026-08-02', 0, 12_00), p('2026-08-05', 0, 100_00, 'tdsChallan')], register, FY, '2026-09-01');
    expect(months.map((r) => [r.month, r.collectedMinor, r.depositedMinor, r.balanceMinor, r.dueDate])).toEqual([
      ['2026-07', 118_00, 100_00, 18_00, '2026-08-07'],
      ['2026-08', -12_00, 0, -12_00, '2026-09-07'],
    ]);
    expect(quarters).toEqual([{ section: 'scrap', sectionLabel: '206C(1) scrap', quarter: 'FY 2026-27 Q2', collectees: 1, documents: 2, baseMinor: 10_620_00, tcsMinor: 106_00 }]);
    expect(tcsDepositDue('2027-03-15')).toBe('2027-04-07');
  });
});
