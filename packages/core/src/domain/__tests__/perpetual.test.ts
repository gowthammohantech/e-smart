import { calculateDocument } from '../lineCalc';
import { buildTaxContext } from '../taxEngine';
import { allPostings, Posting } from '../ledger/postings';
import { balanceSheet, costCentreProfit, profitAndLoss, trialBalance } from '../ledger/reports';
import { Book } from '../ledger/accounts';
import { perpetualStock } from '../stockLedger';
import { integrityChecks } from '../ledger/integrity';
import { BusinessDocument, Company, DocumentKind, DocumentLine, Item, Party, StockMovement } from '../../types';
import { fromMajor, zero } from '../../lib/money';

const inr = (major: string) => fromMajor(major, 'INR');
const company = {
  id: 'c',
  baseCurrency: 'INR',
  address: { line1: '', city: '', state: '', stateCode: '27', postalCode: '', country: 'IN' },
  taxRegistration: { regime: 'GST', identifierLabel: 'GSTIN', registered: true, placeOfSupplyStateCode: '27' },
  fiscalYearStartMonth: 4,
} as Company;
const customer = { id: 'cus', kind: 'customer', name: 'Sunrise Retail', openingBalance: inr('0'), billingAddress: { stateCode: '27' } } as Party;
const supplier = { id: 'sup', kind: 'supplier', name: 'Konkan Steel', openingBalance: inr('0'), billingAddress: { stateCode: '27' } } as Party;
const book: Book = { parties: [customer, supplier], paymentAccounts: [], expenseCategories: [], ledgerAccounts: [] };

const line = (quantity: number, price: string): DocumentLine => ({
  id: Math.random().toString(36).slice(2),
  name: 'Steel rod',
  itemId: 'itm',
  quantity,
  unit: 'NOS',
  unitPrice: inr(price),
  discountMode: 'percent',
  discountValue: 0,
  taxCategoryId: 'tax_18',
  taxRate: 18,
  taxInclusive: false,
});

let n = 0;
function doc(kind: DocumentKind, date: string, lines: DocumentLine[], over: Partial<BusinessDocument> = {}): BusinessDocument {
  const purchase = kind === 'purchaseBill' || kind === 'purchaseReturn';
  const totals = calculateDocument({
    lines,
    currency: 'INR',
    baseCurrency: 'INR',
    exchangeRate: 1,
    documentDiscountMode: 'amount',
    documentDiscountValue: 0,
    charges: zero('INR'),
    applyRoundOff: true,
    taxCategories: [],
    taxContext: buildTaxContext(company, { party: purchase ? supplier : customer, placeOfSupply: '27', date, purchase }),
  });
  const id = `${kind}-${++n}`;
  return { id, companyId: 'c', branchId: 'b', kind, number: id, status: 'issued', partyId: purchase ? 'sup' : 'cus', date, currency: 'INR', exchangeRate: 1, documentDiscountMode: 'amount', documentDiscountValue: 0, charges: zero('INR'), applyRoundOff: true, attachmentIds: [], createdBy: 'u', createdAt: '', updatedAt: '', ...over, lines, totals };
}
const move = (type: StockMovement['type'], quantity: number, date: string, cost: string, ref?: BusinessDocument): StockMovement =>
  ({ id: `stk-${++n}`, itemId: 'itm', branchId: 'b', type, quantity, date, unitCost: inr(cost), referenceId: ref?.id, referenceNumber: ref?.number, createdAt: `${date}T00:00:${String(n).padStart(2, '0')}Z` }) as StockMovement;

const item = { id: 'itm', name: 'Steel rod', trackInventory: true, type: 'goods', purchasePrice: inr('60') } as Item;
const net = (ps: Posting[], account: string, to = '9999') => ps.filter((p) => p.account === account && p.date <= to).reduce((a, p) => a + p.debit - p.credit, 0);

function books(documents: BusinessDocument[], movements: StockMovement[], perpetualFrom: string) {
  const openingStockMinor = 5 * 6000;
  const sourceOf = new Map(documents.filter((d) => d.sourceDocumentId).map((d) => [d.id, d.sourceDocumentId!]));
  const postings = allPostings({
    baseCurrency: 'INR', company, branches: [], taxCategories: [], documents, payments: [], expenses: [], vouchers: [], parties: [customer, supplier], paymentAccounts: [], ledgerAccounts: [],
    openingStockMinor,
    stock: perpetualStock([item], movements, perpetualFrom, 'INR', (id) => sourceOf.get(id)),
  });
  return { postings, stock: { items: [item], movements, baseCurrency: 'INR', perpetualFrom, sourceOf: (id: string) => sourceOf.get(id) } };
}

describe('perpetual stock', () => {
  // 5 counted at the start at ₹60, 20 bought at ₹60, 10 sold for ₹100, then 10 bought at ₹90 and 10 sold.
  const bill = doc('purchaseBill', '2026-05-01', [line(20, '60')], { costCentreId: 'shop' });
  const invoice = doc('invoice', '2026-06-01', [line(10, '100')], { costCentreId: 'shop' });
  const bill2 = doc('purchaseBill', '2026-07-01', [line(10, '90')]);
  const invoice2 = doc('invoice', '2026-08-01', [line(10, '100')], { costCentreId: 'shop' });
  const ret = doc('salesReturn', '2026-08-05', [line(2, '100')], { sourceDocumentId: invoice2.id });
  const movements = [
    move('opening', 5, '2026-04-01', '60'),
    move('purchaseReceipt', 20, '2026-05-01', '60', bill),
    move('salesIssue', -10, '2026-06-01', '60', invoice),
    move('purchaseReceipt', 10, '2026-07-01', '90', bill2),
    move('salesIssue', -10, '2026-08-01', '60', invoice2),
    move('salesReturn', 2, '2026-08-05', '60', ret),
  ];
  const { postings, stock } = books([bill, invoice, bill2, invoice2, ret], movements, '2026-04-01');
  const fy = { from: '2026-04-01', to: '2027-03-31' };

  it('posts goods bought to stock and goods sold to cost of goods sold, at the moving average', () => {
    expect(postings.reduce((a, p) => a + p.debit - p.credit, 0)).toBe(0);
    // Stock in hand: 5 + 20 − 10 = 15 at ₹60 (₹900), + 10 at ₹90 → 25 at ₹72; 10 out at ₹72; 2 back at ₹72.
    expect(net(postings, 'sys:cogs')).toBe(60000 + 72000 - 14400);
    expect(net(postings, 'sys:openingStock')).toBe(30000 + 120000 - 60000 + 90000 - 72000 + 14400);
    // Purchases keep nothing of the goods: they are in stock.
    expect(net(postings, 'sys:purchases')).toBe(0);
    // The goods sold post under the invoice, with its cost centre.
    expect(postings.filter((p) => p.account === 'sys:cogs' && p.source.id === invoice.id).map((p) => p.costCentreId)).toEqual(['shop']);
  });

  it('works out gross profit from the cost of goods sold, without valuing stock at the end', () => {
    const pl = profitAndLoss(postings, book, fy, stock);
    expect(pl.trading.openingStock).toBe(0);
    expect(pl.trading.closingStock).toBe(0);
    expect(pl.grossProfit).toBe(100000 + 100000 - 20000 - (60000 + 72000 - 14400));
    const bs = balanceSheet(postings, book, '2027-03-31', stock);
    expect(bs.totalAssets).toBe(bs.totalLiabilities);
    expect(bs.assets.flatMap((s) => s.lines).find((l) => l.account.key === 'sys:openingStock')?.amount).toBe(122400);
  });

  it('splits the goods sold by cost centre, so the centres add up to the profit', () => {
    const rows = costCentreProfit(postings, book, fy);
    expect(rows.reduce((a, r) => a + r.profit, 0)).toBe(profitAndLoss(postings, book, fy, stock).netProfit);
  });

  it('carries the periodic years’ closing stock onto the books when perpetual stock begins', () => {
    // Periodic through FY 26-27, perpetual from 1 Apr 2027: 15 in stock at ₹60 then.
    const later = doc('invoice', '2027-05-01', [line(5, '100')]);
    const ms = [...movements.slice(0, 3), move('salesIssue', -5, '2027-05-01', '60', later)];
    const { postings: ps, stock: st } = books([bill, invoice, later], ms, '2027-04-01');
    // FY 26-27 is as the periodic books had it: the change in stock, nothing posted to cost of goods sold.
    const before = profitAndLoss(ps, book, fy, st);
    expect(before.trading.closingStock).toBe(90000);
    expect(before.grossProfit).toBe(100000 - 120000 + 90000 - 30000);
    expect(balanceSheet(ps, book, '2027-03-31', st).totalAssets).toBe(balanceSheet(ps, book, '2027-03-31', st).totalLiabilities);
    // On 1 Apr 2027 Stock in hand is brought up to ₹900, against earlier years' profit.
    expect(net(ps, 'sys:openingStock', '2027-04-01')).toBe(90000);
    const after = profitAndLoss(ps, book, { from: '2027-04-01', to: '2028-03-31' }, st);
    expect(after.grossProfit).toBe(50000 - 30000);
    const bs = balanceSheet(ps, book, '2027-06-30', st);
    expect(bs.totalAssets).toBe(bs.totalLiabilities);
    expect(bs.assets.flatMap((s) => s.lines).find((l) => l.account.key === 'sys:openingStock')?.amount).toBe(60000);
    const tb = trialBalance(ps, book, { from: '2027-04-01', to: '2028-03-31' });
    expect(tb.totals.closingDebit).toBe(tb.totals.closingCredit);
  });

  it('moves no value for a cancelled sale', () => {
    const gone = doc('invoice', '2026-09-01', [line(3, '100')], { status: 'cancelled' });
    const ms = [...movements, move('salesIssue', -3, '2026-09-01', '60', gone), move('adjustment', 3, '2026-09-01', '0', gone)];
    const { postings: ps } = books([bill, invoice, bill2, invoice2, ret, gone], ms, '2026-04-01');
    expect(net(ps, 'sys:cogs')).toBe(net(postings, 'sys:cogs'));
  });
  it('holds goods received before their bill as owed, and the bill moves them into purchases', () => {
    // 10 come in on a goods receipt on 1 Sep at ₹70; the bill made from it on 20 Sep is for ₹72 each.
    const grn = doc('goodsReceipt', '2026-09-01', [line(10, '70')], { status: 'received', partyId: 'sup' });
    const late = doc('purchaseBill', '2026-09-20', [line(10, '72')], { sourceDocumentId: grn.id });
    const unbilled = doc('goodsReceipt', '2026-09-25', [line(4, '70')], { status: 'received', partyId: 'sup' });
    const ms = [...movements, move('purchaseReceipt', 10, '2026-09-01', '70', grn), move('purchaseReceipt', 4, '2026-09-25', '70', unbilled)];
    const docs = [bill, invoice, bill2, invoice2, ret, grn, late, unbilled];
    const { postings: ps, stock: st } = books(docs, ms, '2026-04-01');
    // Before the bill: in stock, owed as goods received, nothing in purchases for it.
    expect(net(ps, 'sys:goodsReceivedNotBilled', '2026-09-19')).toBe(-70000);
    expect(net(ps, 'sys:purchases', '2026-09-19')).toBe(net(postings, 'sys:purchases'));
    // After: the bill's ₹720 less the ₹700 already in stock stays in purchases; the unbilled receipt is still owed.
    expect(net(ps, 'sys:goodsReceivedNotBilled')).toBe(-28000);
    expect(net(ps, 'sys:purchases') - net(postings, 'sys:purchases')).toBe(2000);
    const tb = trialBalance(ps, book, fy);
    expect(tb.totals.closingDebit).toBe(tb.totals.closingCredit);
    const checks = integrityChecks({ postings: ps, asOf: '2027-03-31', stock: st, partyStatements: [], allocations: [] });
    expect(checks.find((c) => c.key === 'stock')).toMatchObject({ ok: true });
    expect(checks.find((c) => c.key === 'sourcesBalance')).toMatchObject({ ok: true });
  });
});
