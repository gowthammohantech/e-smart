import { calculateDocument } from '../lineCalc';
import { buildTaxContext } from '../taxEngine';
import { allPostings, postDocument, postExpense, postPayment, postVoucher, Posting, RCM_OUTPUT_FROM } from '../ledger/postings';
import { balanceSheet, ledgerStatement, profitAndLoss, profitAndLossStatement, profitFigures, trialBalance, type StatementLabels } from '../ledger/reports';
import { balanceSheetColumns, comparisonPeriod, profitAndLossColumns, splitPeriods, variance } from '../ledger/comparative';
import { Book, chartOfAccounts, groupTree } from '../ledger/accounts';
import { BusinessDocument, Company, DocumentKind, DocumentLine, Expense, GstFlags, Item, Party, Payment, PaymentAccount, StockMovement, Voucher } from '../../types';
import { fromMajor, zero } from '../../lib/money';

const inr = (major: string) => fromMajor(major, 'INR');

const company = {
  id: 'c',
  baseCurrency: 'INR',
  address: { line1: '', city: '', state: '', stateCode: '27', postalCode: '', country: 'IN' },
  taxRegistration: { regime: 'GST', identifierLabel: 'GSTIN', registered: true, placeOfSupplyStateCode: '27' },
  fiscalYearStartMonth: 4,
} as Company;

const customer = { id: 'cus', kind: 'customer', name: 'Sunrise Retail', openingBalance: inr('5000'), billingAddress: { stateCode: '27' } } as Party;
const supplier = { id: 'sup', kind: 'supplier', name: 'Konkan Steel', openingBalance: inr('2000'), billingAddress: { stateCode: '27' } } as Party;
const cash = { id: 'cash', name: 'Cash', type: 'cash', openingBalance: inr('100000'), currency: 'INR' } as PaymentAccount;
const bank = { id: 'bank', name: 'HDFC', type: 'bank', openingBalance: inr('0'), currency: 'INR' } as PaymentAccount;

const line = (over: Partial<DocumentLine> & { gst?: GstFlags } = {}): DocumentLine => ({
  id: Math.random().toString(36).slice(2),
  name: 'Steel rod',
  itemId: 'itm',
  quantity: 10,
  unit: 'NOS',
  unitPrice: inr('100'),
  discountMode: 'percent',
  discountValue: 0,
  taxCategoryId: 'tax_18',
  taxRate: 18,
  taxInclusive: false,
  ...over,
});

function doc(kind: DocumentKind, over: Partial<BusinessDocument> = {}): BusinessDocument {
  const lines = over.lines ?? [line()];
  const purchase = ['purchaseBill', 'purchaseReturn', 'supplierCreditNote', 'supplierDebitNote'].includes(kind);
  const party = purchase ? supplier : customer;
  const totals = calculateDocument({
    lines,
    currency: 'INR',
    baseCurrency: 'INR',
    exchangeRate: 1,
    documentDiscountMode: 'amount',
    documentDiscountValue: over.documentDiscountValue ?? 0,
    charges: over.charges ?? zero('INR'),
    applyRoundOff: true,
    taxCategories: [],
    taxContext: buildTaxContext(company, { party, placeOfSupply: '27', date: '2026-06-01', purchase, reverseCharge: over.reverseCharge }),
  });
  return {
    id: `${kind}-${Math.random().toString(36).slice(2, 7)}`,
    companyId: 'c',
    branchId: 'b',
    kind,
    number: `${kind.toUpperCase()}-1`,
    status: 'issued',
    partyId: party.id,
    date: '2026-06-01',
    currency: 'INR',
    exchangeRate: 1,
    documentDiscountMode: 'amount',
    documentDiscountValue: 0,
    charges: zero('INR'),
    applyRoundOff: true,
    attachmentIds: [],
    createdBy: 'u',
    createdAt: '',
    updatedAt: '',
    ...over,
    lines,
    totals,
  };
}

const balanced = (ps: Posting[]) => ps.reduce((a, p) => a + p.debit - p.credit, 0);
const net = (ps: Posting[], account: string) => ps.filter((p) => p.account === account).reduce((a, p) => a + p.debit - p.credit, 0);

const item = { id: 'itm', name: 'Steel rod', trackInventory: true, purchasePrice: inr('60') } as Item;
const move = (type: StockMovement['type'], quantity: number, date: string, cost = '60'): StockMovement =>
  ({ id: Math.random().toString(36), itemId: 'itm', branchId: 'b', type, quantity, date, unitCost: inr(cost), createdAt: date }) as StockMovement;

const book: Book = { parties: [customer, supplier], paymentAccounts: [cash, bank], expenseCategories: [{ id: 'rent', name: 'Rent' }], ledgerAccounts: [{ id: 'loan', name: 'Loan from director', group: 'loans' }] };

describe('postings', () => {
  it('posts an invoice to the customer, sales, output tax, discount and round off', () => {
    const d = doc('invoice', { documentDiscountValue: 12.5 });
    const ps = postDocument(d, 'INR');
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'party:cus')).toBe(d.totals.grandTotal.minor);
    expect(net(ps, 'sys:sales')).toBe(-100000);
    expect(net(ps, 'sys:outputCgst')).toBe(-9000);
    expect(net(ps, 'sys:outputSgst')).toBe(-9000);
    expect(net(ps, 'sys:discountAllowed')).toBe(1250);
  });

  it('runs a credit note the other way', () => {
    const ps = postDocument(doc('creditNote', { lines: [line({ quantity: 1 })] }), 'INR');
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'party:cus')).toBe(-11800);
    expect(net(ps, 'sys:sales')).toBe(10000);
  });

  it('posts a financial credit note without GST to discount allowed, with no tax (RULES 6.24)', () => {
    const ps = postDocument(doc('creditNote', { noteGst: 'noGst', lines: [line({ quantity: 1, gst: { supplyType: 'nonGst' } })] }), 'INR');
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'party:cus')).toBe(-10000);
    expect(net(ps, 'sys:discountAllowed')).toBe(10000);
    expect(net(ps, 'sys:sales')).toBe(0);
    expect(ps.filter((p) => p.account.startsWith('sys:output'))).toEqual([]);
  });

  it('posts a supplier’s financial credit note without GST to discount received', () => {
    const ps = postDocument(doc('supplierCreditNote', { noteGst: 'noGst', lines: [line({ quantity: 1, gst: { supplyType: 'nonGst' } })] }), 'INR');
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'party:sup')).toBe(10000);
    expect(net(ps, 'sys:discountReceived')).toBe(-10000);
    expect(net(ps, 'sys:purchases')).toBe(0);
    expect(ps.filter((p) => p.account.startsWith('sys:input'))).toEqual([]);
  });

  it('still posts a direct note with GST to sales, as a return of value', () => {
    const ps = postDocument(doc('creditNote', { noteGst: 'withGst', originalNumber: 'INV-1', originalDate: '2026-05-01', lines: [line({ quantity: 1 })] }), 'INR');
    expect(net(ps, 'sys:sales')).toBe(10000);
    expect(net(ps, 'sys:outputCgst')).toBe(900);
  });

  it('posts a bill with input credit, a blocked line to cost, capital goods to assets and TDS kept back', () => {
    const d = doc('purchaseBill', {
      lines: [line(), line({ gst: { itcEligibility: 'blocked' } }), line({ gst: { capitalGoods: true } })],
      tds: { section: '194C', rate: 2, amount: inr('60') },
    });
    const ps = postDocument(d, 'INR');
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'party:sup')).toBe(-d.totals.grandTotal.minor + 6000);
    expect(net(ps, 'sys:tdsPayable:194C')).toBe(-6000);
    expect(net(ps, 'sys:fixedAssets')).toBe(100000);
    // Two claimable lines' CGST; the blocked line's 180 is cost.
    expect(net(ps, 'sys:inputCgst')).toBe(18000);
    expect(net(ps, 'sys:purchases')).toBe(200000 + 18000);
  });

  it('self-assesses reverse-charge tax before the cutover in Reverse charge payable', () => {
    const ps = postDocument(doc('purchaseBill', { reverseCharge: true }), 'INR');
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'sys:inputCgst')).toBe(9000);
    expect(net(ps, 'sys:rcmPayableCgst')).toBe(-9000);
    expect(net(ps, 'sys:outputCgst')).toBe(0);
    expect(net(ps, 'party:sup')).toBe(-100000);
  });

  it('owes reverse-charge tax as Output tax from RCM_OUTPUT_FROM (RULES 2.6)', () => {
    const ps = postDocument(doc('purchaseBill', { reverseCharge: true, date: RCM_OUTPUT_FROM }), 'INR');
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'sys:inputCgst')).toBe(9000);
    expect(net(ps, 'sys:outputCgst')).toBe(-9000);
    expect(net(ps, 'sys:outputSgst')).toBe(-9000);
    expect(net(ps, 'sys:rcmPayableCgst')).toBe(0);
    // A note against it runs the other way, on the same account.
    const note = postDocument(doc('supplierCreditNote', { reverseCharge: true, date: '2026-11-20' }), 'INR');
    expect(net(note, 'sys:outputCgst')).toBe(9000);
  });

  it('takes reversed credit out of Input on the reversal date and back on the reclaim date (rule 37, RULES 6.22)', () => {
    const d = doc('purchaseBill', { lines: [line(), line({ gst: { itcEligibility: 'blocked' } })], itcReversedOn: '2026-12-01', itcReclaimedOn: '2027-01-05' });
    const ps = postDocument(d, 'INR');
    expect(balanced(ps)).toBe(0);
    const on = (date: string) => ps.filter((p) => p.date === date);
    expect(balanced(on('2026-12-01'))).toBe(0);
    // Claimable credit only: the blocked line is cost already.
    expect(net(on('2026-12-01'), 'sys:inputCgst')).toBe(-9000);
    expect(net(on('2026-12-01'), 'sys:itcReversed')).toBe(18000);
    expect(net(on('2027-01-05'), 'sys:inputCgst')).toBe(9000);
    expect(net(ps, 'sys:itcReversed')).toBe(0);
    // Not yet paid: it stays reversed.
    const open = postDocument({ ...d, itcReclaimedOn: undefined }, 'INR');
    expect(net(open, 'sys:itcReversed')).toBe(18000);
  });

  it('owes reverse-charge tax on an expense as Output tax from the cutover, Reverse charge payable before', () => {
    const e = (date: string) => ({ id: 'e', number: 'EXP-1', categoryId: 'legal', accountId: 'cash', branchId: 'b', date, amount: inr('1000'), taxAmount: inr('180'), exchangeRate: 1, taxCategoryId: 'tax_18', reverseCharge: true }) as Expense;
    const ctx = { company, branches: [], taxCategories: [{ id: 'tax_18', rate: 18 } as never] };
    const before = postExpense(e('2026-10-31'), ctx);
    const after = postExpense(e('2026-11-01'), ctx);
    expect(balanced(before)).toBe(0);
    expect(balanced(after)).toBe(0);
    expect(net(before, 'sys:rcmPayableCgst')).toBeLessThan(0);
    expect(net(before, 'sys:outputCgst')).toBe(0);
    expect(net(after, 'sys:outputCgst')).toBe(net(before, 'sys:rcmPayableCgst'));
    expect(net(after, 'sys:rcmPayableCgst')).toBe(0);
  });

  it('posts no TDS for an invoice, even with TDS expected from the customer', () => {
    const d = doc('invoice', { tdsExpected: { section: '194JB', rate: 10, amount: inr('100') } });
    const ps = postDocument(d, 'INR');
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'party:cus')).toBe(d.totals.grandTotal.minor);
    expect(ps.some((p) => p.account.startsWith('sys:tds'))).toBe(false);
  });

  it('posts TDS a customer deducted to TDS receivable under its section, plain without one', () => {
    const p = { id: 'r', number: 'RCPT-1', direction: 'received', partyId: 'cus', accountId: 'bank', date: '2026-11-10', amount: inr('900'), exchangeRate: 1, tdsSection: '194JB', allocations: [{ documentId: 'x', documentNumber: 'X', amount: inr('900'), tdsDeducted: inr('100') }] } as Payment;
    const ps = postPayment(p);
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'sys:tdsReceivable:194JB')).toBe(10000);
    expect(net(ps, 'sys:tdsReceivable')).toBe(0);
    expect(net(postPayment({ ...p, tdsSection: undefined }), 'sys:tdsReceivable')).toBe(10000);
  });

  it('gives TCS back on a credit note against a TCS invoice: Dr TCS payable under its section', () => {
    const tcsDoc = (kind: DocumentKind) => {
      const d = doc(kind, { tcs: { section: 'scrap', rate: 1 } });
      const totals = calculateDocument({
        lines: d.lines, currency: 'INR', baseCurrency: 'INR', exchangeRate: 1, documentDiscountMode: 'amount', documentDiscountValue: 0, charges: zero('INR'), applyRoundOff: true, taxCategories: [],
        taxContext: buildTaxContext(company, { party: customer, placeOfSupply: '27', date: '2026-06-01', purchase: false }), tcsRate: 1,
      });
      return { ...d, totals };
    };
    const inv = postDocument(tcsDoc('invoice'), 'INR');
    const cn = postDocument(tcsDoc('creditNote'), 'INR');
    expect(balanced(cn)).toBe(0);
    expect(net(inv, 'sys:tcsPayable:scrap')).toBe(-1200);
    expect(net(cn, 'sys:tcsPayable:scrap')).toBe(1200);
  });

  it('posts a receipt with TDS deducted and a discount, the customer credited for all of it', () => {
    const p = {
      id: 'pay',
      number: 'PAY-1',
      direction: 'received',
      partyId: 'cus',
      accountId: 'bank',
      date: '2026-06-10',
      amount: inr('1000'),
      exchangeRate: 1,
      allocations: [{ documentId: 'x', documentNumber: 'X', amount: inr('1000'), tdsDeducted: inr('20'), discount: inr('5') }],
    } as Payment;
    const ps = postPayment(p);
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'pay:bank')).toBe(100000);
    expect(net(ps, 'sys:tdsReceivable')).toBe(2000);
    expect(net(ps, 'party:cus')).toBe(-102500);
  });

  it('posts TDS kept back on a payment under its section, for 26Q', () => {
    const p = { id: 'p2', number: 'PAY-2', direction: 'paid', partyId: 'sup', accountId: 'bank', branchId: 'b', date: '2026-06-05', amount: inr('980'), exchangeRate: 1, tdsSection: '194C', allocations: [{ documentId: 'x', documentNumber: 'X', amount: inr('980'), tdsDeducted: inr('20') }] } as Payment;
    const ps = postPayment(p);
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'sys:tdsPayable:194C')).toBe(-2000);
    expect(net(ps, 'sys:tdsPayable')).toBe(0);
  });

  it('posts an expense at its cost, with the credit it carries', () => {
    const e = { id: 'e', number: 'EXP-1', categoryId: 'rent', accountId: 'cash', branchId: 'b', date: '2026-06-05', amount: inr('1180'), taxAmount: inr('180'), exchangeRate: 1, taxCategoryId: 'tax_18' } as Expense;
    const ps = postExpense(e, { company, branches: [], taxCategories: [{ id: 'tax_18', rate: 18 } as never] });
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'exp:rent')).toBe(100000);
    expect(net(ps, 'sys:inputCgst')).toBe(9000);
    expect(net(ps, 'pay:cash')).toBe(-118000);
  });

  it('books customs IGST on a bill of entry as input credit owed to customs', () => {
    const ps = postDocument(
      { id: 'imp', kind: 'purchaseBill', status: 'issued', number: 'BILL-9', date: '2026-06-10', partyId: 'sup', branchId: 'b', currency: 'INR', exchangeRate: 1, lines: [],
        totals: { taxableAmount: inr('50000'), grandTotal: inr('50000'), documentDiscount: inr('0'), charges: inr('0'), roundOff: inr('0'), totalTax: inr('0'), taxLines: [] },
        billOfEntry: { number: '1234567', date: '2026-06-08', portCode: 'INNSA1', assessableValue: inr('50000'), igst: inr('9000') } } as never,
      'INR',
    );
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'sys:inputIgst')).toBe(900000);
    expect(net(ps, 'sys:customsPayable')).toBe(-900000);
  });

  it('keeps a billable expense out of P&L until the invoice recovers it (Rule 33)', () => {
    const e = { id: 'e', number: 'EXP-2', categoryId: 'travel', accountId: 'cash', branchId: 'b', date: '2026-06-05', amount: inr('2500'), taxAmount: inr('0'), exchangeRate: 1, billable: true } as Expense;
    const spent = postExpense(e, { company, branches: [], taxCategories: [] });
    expect(balanced(spent)).toBe(0);
    expect(net(spent, 'sys:reimbursementsRecoverable')).toBe(250000);
    expect(net(spent, 'exp:travel')).toBe(0);
    const inv = postDocument(
      { id: 'i', kind: 'invoice', status: 'issued', number: 'INV-9', date: '2026-06-10', partyId: 'cus', branchId: 'b', currency: 'INR', exchangeRate: 1, lines: [],
        totals: { taxableAmount: inr('0'), grandTotal: inr('2500'), documentDiscount: inr('0'), charges: inr('0'), roundOff: inr('0'), reimbursements: inr('2500'), totalTax: inr('0'), taxLines: [] } } as never,
      'INR',
    );
    expect(balanced(inv)).toBe(0);
    expect(net([...spent, ...inv], 'sys:reimbursementsRecoverable')).toBe(0);
    expect(net(inv, 'sys:reimbursements')).toBe(0);
  });
});

describe('books', () => {
  const invoice = doc('invoice');
  const bill = doc('purchaseBill', { date: '2026-05-01', lines: [line({ quantity: 20, unitPrice: inr('60') })] });
  const contra: Voucher = { id: 'v', companyId: 'c', branchId: 'b', kind: 'contra', number: 'CV-1', date: '2026-06-02', lines: [{ account: 'pay:bank', debit: inr('50000'), credit: zero('INR') }, { account: 'pay:cash', debit: zero('INR'), credit: inr('50000') }], createdBy: 'u', createdAt: '' };
  const loan: Voucher = { ...contra, id: 'v2', kind: 'journal', number: 'JV-1', lines: [{ account: 'pay:bank', debit: inr('20000'), credit: zero('INR') }, { account: 'acc:loan', debit: zero('INR'), credit: inr('20000') }] };
  const movements = [move('opening', 5, '2026-04-01'), move('purchaseReceipt', 20, '2026-05-01'), move('salesIssue', -10, '2026-06-01')];
  const stock = { items: [item], movements, baseCurrency: 'INR' };
  const postings = allPostings({
    baseCurrency: 'INR',
    company,
    branches: [],
    taxCategories: [],
    documents: [invoice, bill, doc('purchaseBill', { status: 'draft' })],
    payments: [],
    expenses: [],
    vouchers: [contra, loan],
    parties: [customer, supplier],
    paymentAccounts: [cash, bank],
    ledgerAccounts: [{ id: 'loan', openingBalance: zero('INR') }],
    openingStockMinor: 5 * 6000,
  });

  it('leaves drafts off the books and balances to the paisa', () => {
    expect(postings.some((p) => p.source.kind === 'purchaseBill' && p.date === '2026-06-01')).toBe(false);
    expect(balanced(postings)).toBe(0);
  });

  it('leaves a draft voucher off the books until it is posted', () => {
    const half: Voucher = { ...loan, id: 'v3', number: 'v3', status: 'draft', lines: [{ account: 'sys:badDebts', debit: inr('999'), credit: zero('INR') }] };
    expect(postVoucher(half)).toEqual([]);
    expect(postVoucher({ ...half, status: 'posted', lines: loan.lines })).toHaveLength(2);
  });

  it('has a trial balance whose debits equal its credits', () => {
    const tb = trialBalance(postings, book, { from: '2026-04-01', to: '2027-03-31' });
    expect(tb.totals.closingDebit).toBe(tb.totals.closingCredit);
    expect(tb.totals.debit).toBe(tb.totals.credit);
    expect(tb.rows.find((r) => r.account.key === 'pay:bank')?.closing).toBe(7000000);
  });

  it('rolls the chart up Nature → group → account to the trial balance totals', () => {
    const tb = trialBalance(postings, book, { from: '2026-04-01', to: '2027-03-31' });
    const tree = groupTree(tb.rows);
    expect(tree.totals.debit).toBe(tb.totals.debit);
    expect(tree.totals.credit).toBe(tb.totals.credit);
    expect(tree.totals.closingDebit).toBe(tb.totals.closingDebit);
    expect(tree.totals.closingCredit).toBe(tb.totals.closingCredit);
    expect(tree.totals.closing).toBe(0);
    // Every account lands once, and each level is the sum of what is under it.
    const leaves = tree.natures.flatMap((n) => n.headings.flatMap((h) => [...h.accounts, ...h.subGroups.flatMap((g) => g.accounts)]));
    expect(leaves).toHaveLength(tb.rows.length);
    for (const n of tree.natures) {
      expect(n.totals.closing).toBe(n.headings.reduce((a, h) => a + h.totals.closing, 0));
      for (const h of n.headings) expect(h.totals.debit).toBe([...h.accounts, ...h.subGroups.map((g) => g.totals)].reduce((a, x) => a + x.debit, 0));
    }
    expect(tree.natures.map((n) => n.nature)).toEqual(['asset', 'liability', 'income', 'expense']);
    // The bank sits under Current Assets → Bank Accounts.
    const current = tree.natures[0].headings.find((h) => h.group === 'currentAssets');
    expect(current?.subGroups.find((g) => g.group === 'bankAccounts')?.accounts.map((a) => a.account.key)).toContain('pay:bank');
  });

  it('works out gross profit from sales, purchases and the change in stock', () => {
    const pl = profitAndLoss(postings, book, { from: '2026-04-01', to: '2027-03-31' }, stock);
    // Sales 1,000; purchases 1,200; stock 5 → 15 units at ₹60 average.
    expect(pl.trading.openingStock).toBe(30000);
    expect(pl.trading.closingStock).toBe(90000);
    expect(pl.grossProfit).toBe(100000 - 120000 + 90000 - 30000);
    expect(pl.netProfit).toBe(pl.grossProfit);
  });

  it('breaks the P&L into months that add up to the year, and each month agrees with its own report', () => {
    const year = { from: '2026-04-01', to: '2027-03-31' };
    const months = splitPeriods(year, 'month');
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ from: '2026-04-01', to: '2026-04-30', label: 'Apr 26' });
    expect(months[10].to).toBe('2027-02-28');
    const cols = profitAndLossColumns(postings, book, months, stock);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const full = profitAndLoss(postings, book, year, stock);
    expect(sum(cols.netProfit)).toBe(full.netProfit);
    expect(sum(cols.grossProfit)).toBe(full.grossProfit);
    // Periodic stock: each month opens with what the last one closed with.
    for (let i = 1; i < 12; i++) expect(cols.openingStock[i]).toBe(cols.closingStock[i - 1]);
    const may = profitAndLoss(postings, book, months[1], stock);
    expect(cols.netProfit[1]).toBe(may.netProfit);
    // A row per account, its months adding up to the year's line.
    const sales = cols.tradingIncome.find((r) => r.key === 'sys:sales')!;
    expect(sum(sales.values)).toBe(full.trading.income.find((l) => l.account.key === 'sys:sales')!.amount);
  });

  it('cuts quarters from the start of the range and sets a period beside the one before or last year', () => {
    expect(splitPeriods({ from: '2026-04-01', to: '2027-03-31' }, 'quarter').map((p) => [p.from, p.to])).toEqual([
      ['2026-04-01', '2026-06-30'],
      ['2026-07-01', '2026-09-30'],
      ['2026-10-01', '2026-12-31'],
      ['2027-01-01', '2027-03-31'],
    ]);
    expect(comparisonPeriod({ from: '2026-07-01', to: '2026-09-30' }, 'previousPeriod')).toMatchObject({ from: '2026-04-01', to: '2026-06-30' });
    expect(comparisonPeriod({ from: '2026-07-10', to: '2026-07-19' }, 'previousPeriod')).toMatchObject({ from: '2026-06-30', to: '2026-07-09' });
    expect(comparisonPeriod({ from: '2026-04-01', to: '2027-03-31' }, 'previousYear')).toMatchObject({ from: '2025-04-01', to: '2026-03-31' });
    expect(comparisonPeriod({ from: '2028-02-01', to: '2028-02-29' }, 'previousYear')).toMatchObject({ to: '2027-02-28' });
    expect(variance(150, 100)).toEqual({ amount: 50, percent: 50 });
    expect(variance(10, 0)).toEqual({ amount: 10, percent: null });
  });

  it('lines balance sheets up across dates, each one balanced', () => {
    const cols = balanceSheetColumns(postings, book, ['2026-06-30', '2026-12-31', '2027-03-31'], stock);
    cols.totalAssets.forEach((a, i) => expect(a).toBe(cols.totalLiabilities[i]));
    expect(cols.currentProfit[2]).toBe(balanceSheet(postings, book, '2027-03-31', stock).currentProfit);
  });

  it('has a balance sheet whose two sides agree', () => {
    const bs = balanceSheet(postings, book, '2027-03-31', stock);
    expect(bs.totalAssets).toBe(bs.totalLiabilities);
    expect(bs.currentProfit).toBe(40000);
  });

  it('carries last year’s profit into reserves the next year, still balanced', () => {
    const bs = balanceSheet(postings, book, '2027-06-30', stock);
    expect(bs.totalAssets).toBe(bs.totalLiabilities);
    expect(bs.currentProfit).toBe(0);
    const tb = trialBalance(postings, book, { from: '2027-04-01', to: '2028-03-31' });
    expect(tb.totals.closingDebit).toBe(tb.totals.closingCredit);
    expect(tb.rows.find((r) => r.account.key === 'sys:sales')).toBeUndefined();
  });

  it('runs an account’s balance in its statement', () => {
    const s = ledgerStatement(postings, 'pay:cash', { from: '2026-04-01', to: '2027-03-31' });
    expect(s.opening).toBe(10000000);
    expect(s.closing).toBe(5000000);
  });

  it('stands a dated opening balance at the start of its day, still balanced', () => {
    const dated = allPostings({
      baseCurrency: 'INR',
      company,
      branches: [],
      taxCategories: [],
      documents: [],
      payments: [],
      expenses: [],
      vouchers: [],
      parties: [],
      paymentAccounts: [],
      ledgerAccounts: [{ id: 'loan', openingBalance: inr('-20000'), openingBalanceDate: '2026-07-01' }],
      openingStockMinor: 0,
    });
    expect(balanced(dated)).toBe(0);
    expect(dated.filter((p) => p.account === 'acc:loan').map((p) => p.date)).toEqual(['2026-06-30']);
    // From that day on it reads as opening; a statement for June doesn't see it.
    expect(ledgerStatement(dated, 'acc:loan', { from: '2026-07-01', to: '2026-07-31' }).opening).toBe(-2000000);
    expect(ledgerStatement(dated, 'acc:loan', { from: '2026-06-01', to: '2026-06-29' }).closing).toBe(0);
  });

  it('names every account in the chart', () => {
    const keys = chartOfAccounts(book).map((a) => a.key);
    expect(keys).toEqual(expect.arrayContaining(['sys:sales', 'party:cus', 'pay:bank', 'exp:rent', 'acc:loan', 'sys:inputIgst']));
  });
});

describe('the statements agree with each other (browser walk, 9 Nov 2026)', () => {
  const invoice = doc('invoice');
  const bill = doc('purchaseBill', { date: '2026-05-01', lines: [line({ quantity: 20, unitPrice: inr('60') })] });
  // A second branch's sale, and indirect income: interest taken in on a receipt voucher.
  const pune = doc('invoice', { branchId: 'b2', date: '2026-07-15', lines: [line({ quantity: 2 })] });
  const interest: Voucher = { id: 'vi', companyId: 'c', branchId: 'b', kind: 'receipt', number: 'RV-1', date: '2026-08-10', lines: [{ account: 'pay:bank', debit: inr('500'), credit: zero('INR') }, { account: 'sys:discountReceived', debit: zero('INR'), credit: inr('500') }], createdBy: 'u', createdAt: '' };
  const rent = { id: 'e1', number: 'EXP-1', categoryId: 'rent', accountId: 'bank', branchId: 'b', date: '2026-06-05', amount: inr('3000'), taxAmount: inr('0'), exchangeRate: 1 } as Expense;
  const movements = [move('opening', 5, '2026-04-01'), move('purchaseReceipt', 20, '2026-05-01'), move('salesIssue', -10, '2026-06-01'), { ...move('salesIssue', -2, '2026-07-15'), branchId: 'b2' }];
  const stock = { items: [item], movements, baseCurrency: 'INR' };
  const postings = allPostings({
    baseCurrency: 'INR',
    company,
    branches: [],
    taxCategories: [],
    documents: [invoice, bill, pune],
    payments: [],
    expenses: [rent],
    vouchers: [interest],
    parties: [customer, supplier],
    paymentAccounts: [cash, bank],
    ledgerAccounts: [],
    openingStockMinor: 5 * 6000,
  });
  const year = { from: '2026-04-01', to: '2027-03-31' };

  it('totals every column of the trial balance from its rows: opening, the period, and closing debit and credit balances', () => {
    const tb = trialBalance(postings, book, year);
    const sum = (f: (r: (typeof tb.rows)[number]) => number) => tb.rows.reduce((a, r) => a + f(r), 0);
    expect(tb.totals.openingDebit).toBe(sum((r) => Math.max(r.opening, 0)));
    expect(tb.totals.openingCredit).toBe(sum((r) => Math.max(-r.opening, 0)));
    expect(tb.totals.closingDebit).toBe(sum((r) => Math.max(r.closing, 0)));
    expect(tb.totals.closingCredit).toBe(sum((r) => Math.max(-r.closing, 0)));
    expect(tb.totals.openingDebit).toBe(tb.totals.openingCredit);
    expect(tb.totals.closingDebit).toBe(tb.totals.closingCredit);
    // The period's movements are a different total from the closing balances: the screen must label them apart.
    expect(tb.totals.debit).toBe(tb.totals.credit);
    expect(tb.totals.debit).not.toBe(tb.totals.closingDebit);
  });

  it('gives the profit report the books’ profit: periodic cost of goods from purchases and the change in stock (RULES 6.2)', () => {
    const pl = profitAndLoss(postings, book, year, stock);
    const f = profitFigures(postings, book, year, stock);
    expect(f.grossProfit.minor).toBe(pl.grossProfit);
    expect(f.netProfit.minor).toBe(pl.netProfit);
    // Sales 1,200; cost of goods = opening 300 + purchases 1,200 − closing 780 (13 units at ₹60) = 720.
    expect(f.revenue.minor).toBe(120000);
    expect(f.costOfGoods.minor).toBe(30000 + 120000 - 78000);
    expect(f.revenue.minor - f.costOfGoods.minor).toBe(f.grossProfit.minor);
    // Indirect income is its own line, so net profit = gross profit + other income − expenses.
    expect(f.otherIncome?.minor).toBe(50000);
    expect(f.expenses.minor).toBe(300000);
    expect(f.grossProfit.minor + (f.otherIncome?.minor ?? 0) - f.expenses.minor).toBe(f.netProfit.minor);
    // Its months add up to the year (each month's stock change telescopes).
    expect(f.byMonth.reduce((a, m) => a + m.profit.minor, 0)).toBe(f.netProfit.minor);
    // May only bought goods into stock: nothing reaches profit, so it has no row.
    expect(f.byMonth.map((m) => m.key)).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('splits the profit by branch, stock at the company’s cost, and the branches add up to the whole', () => {
    const whole = profitFigures(postings, book, year, stock);
    const mumbai = profitFigures(postings, book, year, stock, ['b']);
    const puneOnly = profitFigures(postings, book, year, stock, ['b2']);
    expect(puneOnly.revenue.minor).toBe(20000);
    for (const k of ['revenue', 'costOfGoods', 'grossProfit', 'expenses', 'netProfit'] as const) expect(mumbai[k].minor + puneOnly[k].minor).toBe(whole[k].minor);
  });

  const labels: StatementLabels = { account: (a) => a.name, openingStock: 'Opening stock', closingStock: 'Closing stock', grossProfit: 'Gross profit', grossLoss: 'Gross loss', netProfit: 'Net profit', netLoss: 'Net loss' };

  it('shows a net loss on the income side as the balancing figure, so both columns total the same', () => {
    const pl = profitAndLoss(postings, book, year, stock);
    expect(pl.netProfit).toBeLessThan(0);
    const st = profitAndLossStatement(pl, labels);
    const last = st.indirect.rows[st.indirect.rows.length - 1];
    expect(last).toEqual({ label: 'Net loss', income: -pl.netProfit, result: true });
    expect(st.indirect.total.income).toBe(st.indirect.total.expense);
    expect(st.trading.total.income).toBe(st.trading.total.expense);
    // A gross profit closes the trading account on the expenses side and opens the P&L on the income side.
    expect(st.trading.rows[st.trading.rows.length - 1]).toEqual({ label: 'Gross profit', expense: pl.grossProfit, result: true });
    expect(st.indirect.rows[0]).toEqual({ label: 'Gross profit', income: pl.grossProfit, result: true });
  });

  it('shows a net profit on the expenses side, and a gross loss carried down as an expense', () => {
    const pl = { trading: { income: [], expense: [], openingStock: 500, closingStock: 0 }, grossProfit: -500, indirect: { income: [{ group: 'indirectIncomes' as const, account: { key: 'sys:otherIncome', name: 'Written back', group: 'indirectIncomes' as const, kind: 'system' as const }, amount: 2000 }], expense: [] }, netProfit: 1500 };
    const st = profitAndLossStatement(pl, labels);
    expect(st.trading.rows[st.trading.rows.length - 1]).toEqual({ label: 'Gross loss', income: 500, result: true });
    expect(st.indirect.rows[0]).toEqual({ label: 'Gross loss', expense: 500, result: true });
    expect(st.indirect.rows[st.indirect.rows.length - 1]).toEqual({ label: 'Net profit', expense: 1500, result: true });
    expect(st.indirect.total).toEqual({ income: 2000, expense: 2000 });
  });

  it('keeps an overdrawn bank and a customer in credit on the assets side, as negatives (RULES has no reclassification)', () => {
    const ps: Posting[] = [
      { date: '2026-06-01', account: 'exp:rent', debit: 500000, credit: 0, source: { type: 'expense', id: 'x', number: 'x' } },
      { date: '2026-06-01', account: 'pay:bank', debit: 0, credit: 500000, source: { type: 'expense', id: 'x', number: 'x' } },
      { date: '2026-06-02', account: 'pay:cash', debit: 300000, credit: 0, source: { type: 'payment', id: 'p', number: 'p' } },
      { date: '2026-06-02', account: 'party:cus', debit: 0, credit: 300000, source: { type: 'payment', id: 'p', number: 'p' } },
    ];
    const bs = balanceSheet(ps, book, '2027-03-31', { items: [], movements: [], baseCurrency: 'INR' });
    const assets = bs.assets.flatMap((s) => s.lines.map((l) => [l.account.key, l.amount]));
    expect(assets).toEqual(expect.arrayContaining([['pay:bank', -500000], ['party:cus', -300000], ['pay:cash', 300000]]));
    expect(bs.liabilities.flatMap((s) => s.lines.map((l) => l.account.key))).not.toEqual(expect.arrayContaining(['pay:bank']));
    expect(bs.liabilities.flatMap((s) => s.lines.map((l) => l.account.key))).not.toContain('party:cus');
    expect(bs.totalAssets).toBe(bs.totalLiabilities);
  });
});

describe('opening invoices and bills (RULES 6.12)', () => {
  const opening = (kind: 'openingInvoice' | 'openingBill', status = 'issued') =>
    ({
      id: `${kind}-1`,
      kind,
      status,
      number: 'OLD/1',
      date: '2026-03-10',
      partyId: 'p1',
      branchId: 'b',
      currency: 'INR',
      exchangeRate: 1,
      lines: [],
      totals: { grandTotal: { minor: 50_000, currency: 'INR' }, taxableAmount: { minor: 50_000, currency: 'INR' }, taxLines: [], documentDiscount: { minor: 0, currency: 'INR' }, charges: { minor: 0, currency: 'INR' }, roundOff: { minor: 0, currency: 'INR' } },
    }) as never;

  it('posts only to the party and Opening balances, on its own date', () => {
    const inv = postDocument(opening('openingInvoice'), 'INR');
    expect(inv.map((p) => [p.account, p.debit, p.credit])).toEqual([
      ['party:p1', 50_000, 0],
      ['sys:openingDifference', 0, 50_000],
    ]);
    expect(inv.every((p) => p.date === '2026-03-10')).toBe(true);
    const bill = postDocument(opening('openingBill'), 'INR');
    expect(bill.map((p) => [p.account, p.debit, p.credit])).toEqual([
      ['party:p1', 0, 50_000],
      ['sys:openingDifference', 50_000, 0],
    ]);
  });

  it('posts nothing once cancelled', () => {
    expect(postDocument(opening('openingInvoice', 'cancelled'), 'INR')).toEqual([]);
  });
});

describe('TCS on a sale', () => {
  it('adds TCS to what the buyer owes, on the price with GST, and owes it to the government', () => {
    const lines = [line({ quantity: 10, unitPrice: inr('1000') })];
    const totals = calculateDocument({ lines, currency: 'INR', baseCurrency: 'INR', exchangeRate: 1, documentDiscountMode: 'amount', documentDiscountValue: 0, charges: zero('INR'), applyRoundOff: false, taxCategories: [], taxContext: buildTaxContext(company, { party: customer, placeOfSupply: '27', date: '2026-06-01', purchase: false }), tcsRate: 1 });
    // ₹10,000 + 18% GST = ₹11,800; 1% TCS = ₹118.
    expect(totals.tcs).toEqual(inr('118'));
    expect(totals.grandTotal).toEqual(inr('11918'));
    const sale = { ...doc('invoice', { lines, tcs: { section: 'scrap', rate: 1 } }), totals };
    const ps = postDocument(sale, 'INR');
    const net = (a: string) => ps.filter((p) => p.account === a).reduce((s, p) => s + p.debit - p.credit, 0);
    expect(net(`party:${customer.id}`)).toBe(1191800);
    expect(net('sys:tcsPayable:scrap')).toBe(-11800);
    expect(net('sys:sales')).toBe(-1000000);
    expect(ps.reduce((s, p) => s + p.debit - p.credit, 0)).toBe(0);
  });
});
