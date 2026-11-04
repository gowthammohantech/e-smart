import { calculateDocument } from '../lineCalc';
import { buildTaxContext } from '../taxEngine';
import { allPostings, postDocument, postExpense, postPayment, Posting } from '../ledger/postings';
import { balanceSheet, ledgerStatement, profitAndLoss, trialBalance } from '../ledger/reports';
import { Book, chartOfAccounts } from '../ledger/accounts';
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

  it('self-assesses reverse-charge tax: credit taken, the same owed', () => {
    const ps = postDocument(doc('purchaseBill', { reverseCharge: true }), 'INR');
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'sys:inputCgst')).toBe(9000);
    expect(net(ps, 'sys:rcmPayableCgst')).toBe(-9000);
    expect(net(ps, 'party:sup')).toBe(-100000);
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

  it('posts an expense at its cost, with the credit it carries', () => {
    const e = { id: 'e', number: 'EXP-1', categoryId: 'rent', accountId: 'cash', branchId: 'b', date: '2026-06-05', amount: inr('1180'), taxAmount: inr('180'), exchangeRate: 1, taxCategoryId: 'tax_18' } as Expense;
    const ps = postExpense(e, { company, branches: [], taxCategories: [{ id: 'tax_18', rate: 18 } as never] });
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'exp:rent')).toBe(100000);
    expect(net(ps, 'sys:inputCgst')).toBe(9000);
    expect(net(ps, 'pay:cash')).toBe(-118000);
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

  it('has a trial balance whose debits equal its credits', () => {
    const tb = trialBalance(postings, book, { from: '2026-04-01', to: '2027-03-31' });
    expect(tb.totals.closingDebit).toBe(tb.totals.closingCredit);
    expect(tb.totals.debit).toBe(tb.totals.credit);
    expect(tb.rows.find((r) => r.account.key === 'pay:bank')?.closing).toBe(7000000);
  });

  it('works out gross profit from sales, purchases and the change in stock', () => {
    const pl = profitAndLoss(postings, book, { from: '2026-04-01', to: '2027-03-31' }, stock);
    // Sales 1,000; purchases 1,200; stock 5 → 15 units at ₹60 average.
    expect(pl.trading.openingStock).toBe(30000);
    expect(pl.trading.closingStock).toBe(90000);
    expect(pl.grossProfit).toBe(100000 - 120000 + 90000 - 30000);
    expect(pl.netProfit).toBe(pl.grossProfit);
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

  it('names every account in the chart', () => {
    const keys = chartOfAccounts(book).map((a) => a.key);
    expect(keys).toEqual(expect.arrayContaining(['sys:sales', 'party:cus', 'pay:bank', 'exp:rent', 'acc:loan', 'sys:inputIgst']));
  });
});
