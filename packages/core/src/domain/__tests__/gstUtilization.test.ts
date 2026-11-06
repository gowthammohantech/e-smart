import { cashLedgerBalance, cashUsed, outputCheck, prefillSetOff, setOffIssues, setOffLines, zeroHeads, type SetOffInput } from '../gstUtilization';
import type { Posting } from '../ledger/postings';

const h = (igst = 0, cgst = 0, sgst = 0, cess = 0) => ({ igst, cgst, sgst, cess });
const input = (over: Partial<SetOffInput> = {}): SetOffInput => ({
  forward: h(10000, 5000, 5000, 0),
  reverseCharge: h(0, 900, 900, 0),
  available: h(12000, 1000, 4000, 0),
  cashBalance: h(0, 10000, 10000, 0),
  oldReverseChargeOpen: zeroHeads(),
  interest: zeroHeads(),
  lateFee: h(0, 2500, 2500, 0),
  ...over,
});
const sumLines = (ls: { debitMinor: number; creditMinor: number }[]) => ls.reduce((a, l) => a + l.debitMinor - l.creditMinor, 0);

describe('GST set-off', () => {
  it('prefills in the rule 88A order, with reverse charge and the late fee in cash', () => {
    const i = input();
    const s = prefillSetOff(i);
    expect(s.credit.igst.igst).toBe(10000);
    expect(s.credit.igst.cgst + s.credit.igst.sgst).toBe(2000);
    expect(s.credit.cgst.sgst).toBe(0);
    expect(s.reverseCharge).toEqual(i.reverseCharge);
    expect(setOffIssues(i, s)).toEqual([]);
    const lines = setOffLines(s);
    expect(sumLines(lines)).toBe(0);
    const cash = cashUsed(s);
    expect(lines.find((l) => l.account === 'sys:gstCashLedger:cgst')?.creditMinor).toBe(cash.cgst);
    expect(lines.find((l) => l.account === 'sys:gstLateFee')?.debitMinor).toBe(5000);
    expect(lines.find((l) => l.account === 'sys:inputIgst')?.creditMinor).toBe(12000);
  });

  it('refuses CGST credit for SGST, CGST credit before IGST is used, unpaid tax and reverse charge by credit', () => {
    const i = input();
    const s = prefillSetOff(i);
    const cross = { ...s, credit: { ...s.credit, cgst: { ...s.credit.cgst, sgst: 100 } } };
    expect(setOffIssues(i, cross).map((x) => x.field)).toContain('credit.cgst.sgst');
    const early = { ...s, credit: { ...s.credit, igst: h(9000, 0, 0, 0), cgst: h(0, 1000, 0, 0) } };
    expect(setOffIssues(i, early).some((x) => /rule 88A/.test(x.message))).toBe(true);
    const unpaid = { ...s, cash: { ...s.cash, sgst: 0 } };
    expect(setOffIssues(i, unpaid).map((x) => x.field)).toContain('cash.sgst');
    const rcm = { ...s, reverseCharge: zeroHeads() };
    expect(setOffIssues(i, rcm).map((x) => x.field)).toContain('reverseCharge.cgst');
  });

  it('says to record a challan when the cash ledger is short', () => {
    const i = input({ cashBalance: h(0, 100, 100, 0) });
    const issues = setOffIssues(i, prefillSetOff(i));
    expect(issues.some((x) => x.code === 'CASH_LEDGER_SHORT')).toBe(true);
  });

  it('pays older reverse charge payable from the cash ledger', () => {
    const i = input({ oldReverseChargeOpen: h(0, 300, 300, 0) });
    const s = { ...prefillSetOff(i), oldReverseCharge: h(0, 300, 300, 0) };
    expect(setOffIssues(i, s)).toEqual([]);
    const lines = setOffLines(s);
    expect(lines.find((l) => l.account === 'sys:rcmPayableCgst')?.debitMinor).toBe(300);
    expect(sumLines(lines)).toBe(0);
    expect(setOffIssues(i, { ...s, oldReverseCharge: h(0, 301, 0, 0) }).map((x) => x.field)).toContain('oldReverseCharge.cgst');
  });

  it('reads the cash ledger and checks Output against 3B', () => {
    const p = (account: string, debit: number, credit: number, date = '2026-10-10', kind?: string): Posting => ({ date, account, debit, credit, source: { type: 'voucher', id: kind ?? 'x', number: '1', kind } });
    const ps = [p('sys:gstCashLedger:cgst', 5000, 0), p('sys:gstCashLedger:cgst', 0, 1000, '2026-11-05'), p('sys:outputCgst', 0, 5900), p('sys:outputCgst', 5900, 0, '2026-10-31', 'setoff')];
    expect(cashLedgerBalance(ps, '2026-11-30').cgst).toBe(4000);
    expect(cashLedgerBalance(ps, '2026-10-31').cgst).toBe(5000);
    const liability = { forward: h(0, 5000, 0, 0), reverseCharge: h(0, 900, 0, 0) };
    const ok = outputCheck(ps, { from: '2026-10-01', to: '2026-10-31' }, liability, { isSetOff: (x) => x.source.id === 'setoff' });
    expect(ok.ok).toBe(true);
    const off = outputCheck(ps, { from: '2026-10-01', to: '2026-10-31' }, { ...liability, reverseCharge: zeroHeads() }, { isSetOff: (x) => x.source.id === 'setoff' });
    expect(off.ok).toBe(false);
    expect(off.difference.cgst).toBe(900);
  });
});
