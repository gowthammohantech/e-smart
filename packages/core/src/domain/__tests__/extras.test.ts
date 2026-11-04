import { advanceTaxEvents, advancesForPeriod } from '../advanceTax';
import { gstr3b } from '../gstr3b';
import { postDocument, postPayment, postVoucher, Posting } from '../ledger/postings';
import { costCentreProfit } from '../ledger/reports';
import { Book } from '../ledger/accounts';
import { msmeDueDate, msmeInterest, msmePayables, sec43bh } from '../msme';
import { BusinessDocument, Company, Party, Payment, Voucher } from '../../types';
import { fromMajor } from '../../lib/money';

const inr = (major: string) => fromMajor(major, 'INR');
const balanced = (ps: Posting[]) => ps.reduce((a, p) => a + p.debit - p.credit, 0);
const net = (ps: Posting[], account: string) => ps.filter((p) => p.account === account).reduce((a, p) => a + p.debit - p.credit, 0);
const book: Book = { parties: [], paymentAccounts: [], expenseCategories: [], ledgerAccounts: [] };

/** ₹11,800 received for consulting on 10 September, at 18% within Maharashtra. */
const advance = (over: Partial<Payment> = {}): Payment =>
  ({
    id: 'adv',
    number: 'REC-1',
    branchId: 'b',
    direction: 'received',
    partyId: 'cus',
    accountId: 'bank',
    date: '2026-09-10',
    amount: inr('11800'),
    exchangeRate: 1,
    allocations: [],
    advanceTax: { taxCategoryId: 'tax_18', rate: 18, placeOfSupplyStateCode: '27' },
    ...over,
  }) as Payment;

describe('GST on advances for services', () => {
  const dates: Record<string, string> = { old: '2026-09-01', sep: '2026-09-25', oct: '2026-10-05' };
  const dateOf = (id: string) => dates[id];

  it('taxes the advance when received, inclusive of the tax', () => {
    const [received] = advanceTaxEvents(advance(), '27', dateOf);
    expect(received).toMatchObject({ kind: 'received', taxable: 1_000_000, cgst: 90_000, sgst: 90_000, igst: 0 });
    expect(advanceTaxEvents(advance(), '29', dateOf)[0]).toMatchObject({ interState: true, igst: 180_000 });
  });

  it('carries no tax on money settling an invoice already raised', () => {
    const p = advance({ allocations: [{ documentId: 'old', documentNumber: 'INV-1', amount: inr('11800') }] });
    expect(advanceTaxEvents(p, '27', dateOf)).toEqual([]);
    expect(advanceTaxEvents(advance({ direction: 'paid' }), '27', dateOf)).toEqual([]);
    expect(advanceTaxEvents(advance({ advanceTax: undefined }), '27', dateOf)).toEqual([]);
  });

  it('takes the tax back on the date of each invoice raised against it, to the paisa', () => {
    const p = advance({ allocations: [{ documentId: 'sep', documentNumber: 'INV-2', amount: inr('5900') }, { documentId: 'oct', documentNumber: 'INV-3', amount: inr('5900') }] });
    const events = advanceTaxEvents(p, '27', dateOf);
    expect(events.map((e) => [e.kind, e.date, e.cgst + e.sgst])).toEqual([
      ['received', '2026-09-10', 180_000],
      ['adjusted', '2026-09-25', 90_000],
      ['adjusted', '2026-10-05', 90_000],
    ]);
    // September reports only what is still unadjusted at its end; October reports its adjustment.
    expect(advancesForPeriod(events, '2026-09-01', '2026-09-30')).toEqual({ received: [{ placeOfSupply: '27', rate: 18, interState: false, taxable: 500_000, igst: 0, cgst: 45_000, sgst: 45_000, cess: 0 }], adjusted: [] });
    expect(advancesForPeriod(events, '2026-10-01', '2026-10-31')).toEqual({ received: [], adjusted: [{ placeOfSupply: '27', rate: 18, interState: false, taxable: 500_000, igst: 0, cgst: 45_000, sgst: 45_000, cess: 0 }] });

    const ps = postPayment(p, { homeState: '27', documentDate: dateOf });
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'sys:gstOnAdvances')).toBe(0);
    expect(net(ps.filter((x) => x.date === '2026-09-10'), 'sys:outputCgst')).toBe(-90_000);
    expect(net(ps, 'pay:bank')).toBe(1_180_000);
  });

  it('takes back the tax on what is refunded, on the day of the refund (Rule 51)', () => {
    const p = advance({ refunds: [{ paymentId: 'ref', date: '2026-10-05', amount: inr('5900') }] });
    const events = advanceTaxEvents(p, '27', dateOf);
    expect(events.map((e) => [e.kind, e.date, e.cgst + e.sgst, e.refundId])).toEqual([
      ['received', '2026-09-10', 180_000, undefined],
      ['refunded', '2026-10-05', 90_000, 'ref'],
    ]);
    // October reports the refund as an adjustment of September's advance (table 11B).
    expect(advancesForPeriod(events, '2026-10-01', '2026-10-31').adjusted).toEqual([{ placeOfSupply: '27', rate: 18, interState: false, taxable: 500_000, igst: 0, cgst: 45_000, sgst: 45_000, cess: 0 }]);
    const ps = postPayment(p, { homeState: '27', documentDate: dateOf });
    expect(balanced(ps)).toBe(0);
    expect(net(ps.filter((x) => x.date === '2026-10-05'), 'sys:outputCgst')).toBe(45_000);
  });

  it('shows each advance in the 3B breakup of 3.1(a), net of what was invoiced the same month', () => {
    const p = advance({ allocations: [{ documentId: 'sep', documentNumber: 'INV-2', amount: inr('5900') }, { documentId: 'oct', documentNumber: 'INV-3', amount: inr('5900') }] });
    const events = advanceTaxEvents(p, '27', dateOf);
    const run = (period: string) => gstr3b({ period, company: { id: 'c', baseCurrency: 'INR' } as Company, gstin: '27AABCV1234F1ZO', baseCurrency: 'INR', documents: [], expenses: [], parties: [], expenseSplit: new Map(), advances: events });
    const sep = run('092026');
    expect(sep.sources['3.1a']).toEqual([expect.objectContaining({ type: 'advance', id: 'adv', taxable: 500_000, cgst: 45_000 })]);
    expect(sep.outward.taxable).toMatchObject({ taxable: 500_000, cgst: 45_000, sgst: 45_000 });
    expect(run('102026').sources['3.1a']).toEqual([expect.objectContaining({ type: 'advance', taxable: -500_000 })]);
  });
});

describe('cost centres', () => {
  it('tags a document’s postings and splits a voucher by centre', () => {
    const sale = {
      id: 'inv',
      kind: 'invoice',
      status: 'issued',
      number: 'INV-1',
      date: '2026-09-10',
      partyId: 'cus',
      branchId: 'b',
      currency: 'INR',
      exchangeRate: 1,
      costCentreId: 'cc_a',
      lines: [],
      totals: { grandTotal: inr('1180'), taxableAmount: inr('1000'), taxLines: [{ components: [{ type: 'CGST', amount: inr('90') }, { type: 'SGST', amount: inr('90') }] }], documentDiscount: inr('0'), charges: inr('0'), roundOff: inr('0') },
    } as unknown as BusinessDocument;
    const rent = {
      id: 'v',
      kind: 'journal',
      number: 'JV-1',
      date: '2026-09-15',
      branchId: 'b',
      lines: [
        { account: 'sys:roundOff', debit: inr('300'), credit: inr('0'), costCentreId: 'cc_a' },
        { account: 'sys:roundOff', debit: inr('200'), credit: inr('0'), costCentreId: 'cc_b' },
        { account: 'pay:cash', debit: inr('0'), credit: inr('500') },
      ],
    } as Voucher;
    const ps = [...postDocument(sale, 'INR'), ...postVoucher(rent)];
    expect(ps.filter((p) => p.source.id === 'inv').every((p) => p.costCentreId === 'cc_a')).toBe(true);
    expect(ps.filter((p) => p.account === 'sys:roundOff').map((p) => [p.costCentreId, p.debit])).toEqual([
      ['cc_a', 30_000],
      ['cc_b', 20_000],
    ]);
    const rows = costCentreProfit(ps, book, { from: '2026-09-01', to: '2026-09-30' });
    expect(rows.map((r) => [r.costCentreId, r.income, r.expense, r.profit])).toEqual([
      ['cc_a', 100_000, 30_000, 70_000],
      ['cc_b', 0, 20_000, -20_000],
    ]);
  });
});

describe('paying micro and small suppliers (MSMED s.15, s.43B(h))', () => {
  const micro = { id: 'm', kind: 'supplier', msmeType: 'micro' } as Party;
  const medium = { id: 'big', kind: 'supplier', msmeType: 'medium' } as Party;
  const bill = (id: string, partyId: string, date: string, dueDate?: string) =>
    ({ id, kind: 'purchaseBill', status: 'issued', number: id, partyId, date, dueDate, currency: 'INR', totals: { grandTotal: inr('10000') } }) as unknown as BusinessDocument;
  const pay = (documentId: string, date: string, major: string) => ({ id: `p-${documentId}-${date}`, date, allocations: [{ documentId, documentNumber: documentId, amount: inr(major) }] }) as unknown as Payment;

  it('is due on the agreed day, never more than 45 days on, or in 15 days if nothing was agreed', () => {
    expect(msmeDueDate({ date: '2026-09-01', dueDate: '2026-09-30' })).toBe('2026-09-30');
    expect(msmeDueDate({ date: '2026-09-01', dueDate: '2026-11-30' })).toBe('2026-10-16');
    expect(msmeDueDate({ date: '2026-09-01' })).toBe('2026-09-16');
    expect(msmeDueDate({ date: '2026-09-01', dueDate: '2026-09-01' })).toBe('2026-09-16');
  });

  it('lists covered suppliers’ unpaid bills, most urgent first, with interest once late', () => {
    const bills = [bill('a', 'm', '2026-09-01'), bill('b', 'm', '2026-09-20', '2026-10-30'), bill('c', 'big', '2026-09-01'), bill('d', 'm', '2026-09-05')];
    const rows = msmePayables('2026-10-01', bills, [micro, medium], [pay('a', '2026-09-20', '4000'), pay('d', '2026-09-10', '10000')]);
    expect(rows.map((r) => [r.documentId, r.daysLeft, r.outstandingMinor])).toEqual([
      ['a', -15, 600_000],
      ['b', 29, 1_000_000],
    ]);
    expect(rows[0].interestMinor).toBe(msmeInterest(600_000, 15));
    expect(msmeInterest(1_000_000, 30)).toBe(13_750);
  });

  it('lists for the CA what wasn’t paid in time, which can’t be deducted this year', () => {
    const bills = [bill('late', 'm', '2027-02-01'), bill('ontime', 'm', '2027-02-01'), bill('notyet', 'm', '2027-03-25')];
    const rows = sec43bh('2027-03-31', bills, [micro], [pay('late', '2027-03-01', '10000'), pay('ontime', '2027-02-10', '10000')]);
    expect(rows.map((r) => [r.documentId, r.notPaidInTimeMinor])).toEqual([['late', 1_000_000]]);
  });
});
