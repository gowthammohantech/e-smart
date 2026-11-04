import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { issueInvoice, line, moneySetup, type Money } from './money-fixtures';

const t = setupApi();
beforeEach(() => t.setNow('2026-09-29T10:00:00Z'));

const inr = (minor: number) => ({ minor, currency: 'INR' });
const nil = inr(0);

async function bank(m: Money) {
  const res = await t.post(`${m.c}/payment-accounts`, { name: 'HDFC current', type: 'bank', currency: 'INR', openingBalance: inr(0) }, { token: m.token });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const voucher = (kind: string, lines: [string, number, number][], over: Record<string, unknown> = {}) => ({
  kind,
  date: '2026-09-29',
  lines: lines.map(([account, debit, credit]) => ({ account, debit: inr(debit), credit: inr(credit) })),
  ...over,
});

describe('books: accounts', () => {
  it('adds an account, refuses a second of the same name, and keeps one a voucher uses', async () => {
    const m = await moneySetup(t);
    const loan = await t.post(`${m.c}/ledger-accounts`, { name: 'Loan from director', group: 'loans', openingBalance: nil }, { token: m.token });
    expect(loan.status).toBe(201);
    expect(loan.body).toMatchObject({ name: 'Loan from director', group: 'loans' });
    const twice = await t.post(`${m.c}/ledger-accounts`, { name: 'Loan from director', group: 'loans', openingBalance: nil }, { token: m.token });
    expect(twice.status).toBe(422);
    const debtors = await t.post(`${m.c}/ledger-accounts`, { name: 'Debtors', group: 'sundryDebtors', openingBalance: nil }, { token: m.token });
    expect(debtors.status).toBe(422);

    const jv = await t.post(`${m.c}/vouchers`, voucher('journal', [[`pay:${m.cash.id}`, 0, 0], [`acc:${loan.body.id}`, 0, 0]]), { token: m.token });
    expect(jv.status).toBe(422);
    await t.deps.db.update(schema.paymentAccounts).set({ openingBalanceMinor: 0 }).where(eq(schema.paymentAccounts.id, m.cash.id));
    const borrowed = await t.post(`${m.c}/vouchers`, voucher('journal', [[`pay:${m.cash.id}`, 5_000_000, 0], [`acc:${loan.body.id}`, 0, 5_000_000]], { narration: 'Loan received' }), { token: m.token });
    expect(borrowed.status).toBe(201);
    expect(borrowed.body.number).toBe('JV/26-27/0001');
    const remove = await t.del(`${m.c}/ledger-accounts/${loan.body.id}`, { token: m.token });
    expect(remove.status).toBe(409);
    expect(remove.body.code).toBe('ACCOUNT_IN_USE');
  });
});

describe('books: vouchers', () => {
  it('moves cash to the bank with a contra, and the bank can then pay', async () => {
    const m = await moneySetup(t);
    const hdfc = await bank(m);
    await t.deps.db.update(schema.paymentAccounts).set({ openingBalanceMinor: 10_000_000 }).where(eq(schema.paymentAccounts.id, m.cash.id));
    const contra = await t.post(`${m.c}/vouchers`, voucher('contra', [[`pay:${hdfc}`, 4_000_000, 0], [`pay:${m.cash.id}`, 0, 4_000_000]]), { token: m.token });
    expect(contra.status).toBe(201);
    expect(contra.body.number).toBe('CV/26-27/0001');

    // The bank now holds 40,000: a payment of 30,000 goes through, one of 50,000 doesn't.
    const pay = (minor: number) =>
      t.post(`${m.c}/payments`, { direction: 'paid', partyId: m.supplier!.id, date: '2026-09-29', amount: inr(minor), currency: 'INR', method: 'bank', accountId: hdfc }, { token: m.token });
    expect((await pay(5_000_000)).body.code).toBe('INSUFFICIENT_BALANCE');
    expect((await pay(3_000_000)).status).toBe(201);
    // And no contra can take more out of cash than it holds.
    const over = await t.post(`${m.c}/vouchers`, voucher('contra', [[`pay:${hdfc}`, 7_000_000, 0], [`pay:${m.cash.id}`, 0, 7_000_000]]), { token: m.token });
    expect(over.body.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('refuses an unbalanced voucher, a contra through a non-cash account, and a voucher in a closed period', async () => {
    const m = await moneySetup(t);
    const unbalanced = await t.post(`${m.c}/vouchers`, voucher('journal', [['sys:roundOff', 100, 0], ['sys:otherIncome', 0, 99]]), { token: m.token });
    expect(unbalanced.status).toBe(422);
    expect(unbalanced.body.code).toBe('VOUCHER_UNBALANCED');
    const contra = await t.post(`${m.c}/vouchers`, voucher('contra', [['sys:roundOff', 100, 0], [`pay:${m.cash.id}`, 0, 100]]), { token: m.token });
    expect(contra.status).toBe(422);
    const unknown = await t.post(`${m.c}/vouchers`, voucher('journal', [['sys:nope', 100, 0], ['sys:otherIncome', 0, 100]]), { token: m.token });
    expect(unknown.body.issues[0].field).toBe('lines[0].account');

    await t.deps.db.update(schema.companies).set({ lockedThroughDate: '2026-09-30' }).where(eq(schema.companies.id, m.companyId));
    const locked = await t.post(`${m.c}/vouchers`, voucher('journal', [['sys:roundOff', 100, 0], ['sys:otherIncome', 0, 100]]), { token: m.token });
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('PERIOD_LOCKED');
  });

  it('closes payments and expenses with the books too', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    await t.deps.db.update(schema.companies).set({ lockedThroughDate: '2026-09-30' }).where(eq(schema.companies.id, m.companyId));
    const pay = await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.mumbai.id, date: '2026-09-29', amount: inr(100_000), currency: 'INR', method: 'cash', accountId: m.cash.id, allocations: [{ documentId: inv.id, amount: inr(100_000) }] },
      { token: m.token },
    );
    expect(pay.body.code).toBe('PERIOD_LOCKED');
    const [cat] = await t.deps.db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, m.companyId));
    const exp = await t.post(`${m.c}/expenses`, { categoryId: cat.id, date: '2026-09-10', amount: inr(1000), currency: 'INR', accountId: m.cash.id, method: 'cash' }, { token: m.token });
    expect(exp.body.code).toBe('PERIOD_LOCKED');
  });

  it('puts a refund journal on the customer’s statement', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.paymentAccounts).set({ openingBalanceMinor: 1_000_000 }).where(eq(schema.paymentAccounts.id, m.cash.id));
    const refund = await t.post(`${m.c}/vouchers`, voucher('journal', [[`party:${m.mumbai.id}`, 50_000, 0], [`pay:${m.cash.id}`, 0, 50_000]], { narration: 'Advance refunded' }), { token: m.token });
    expect(refund.status).toBe(201);
    const statement = await t.get(`${m.c}/parties/${m.mumbai.id}/statement`, { token: m.token });
    expect(statement.body.entries.map((e: { entityType: string }) => e.entityType)).toContain('voucher');
    expect(statement.body.closingBalance.minor).toBe(50_000);
  });
});

describe('books: trial balance', () => {
  it('balances over sales, purchases with TDS, payments, expenses, vouchers and opening balances', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.companies).set({ tan: 'MUMA12345B' }).where(eq(schema.companies.id, m.companyId));
    await t.deps.db.update(schema.parties).set({ tdsSection: '194C', pan: 'AABCK1234F', openingBalanceMinor: 200_000 }).where(eq(schema.parties.id, m.supplier!.id));
    await t.deps.db.update(schema.parties).set({ openingBalanceMinor: 500_000 }).where(eq(schema.parties.id, m.mumbai.id));
    await t.deps.db.update(schema.paymentAccounts).set({ openingBalanceMinor: 10_000_000 }).where(eq(schema.paymentAccounts.id, m.cash.id));
    const inv = await issueInvoice(t, m);
    await t.post(
      `${m.c}/documents`,
      { kind: 'purchaseBill', partyId: m.supplier!.id, date: '2026-09-29', currency: 'INR', supplierDocNumber: 'KS-1', lines: [line(m.gst(18), { quantity: 1, unitPrice: inr(4_000_000) })], status: 'issued' },
      { token: m.token },
    );
    await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.mumbai.id, date: '2026-09-29', amount: inr(200_000), currency: 'INR', method: 'cash', accountId: m.cash.id, allocations: [{ documentId: inv.id, amount: inr(200_000), tdsDeducted: inr(4_000) }] },
      { token: m.token },
    );
    const [cat] = await t.deps.db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, m.companyId));
    await t.post(`${m.c}/expenses`, { categoryId: cat.id, date: '2026-09-10', amount: inr(11_800), currency: 'INR', accountId: m.cash.id, method: 'cash', taxCategoryId: m.gst(18) }, { token: m.token });
    await t.post(`${m.c}/vouchers`, voucher('journal', [['sys:badDebts', 1_000, 0], [`party:${m.mumbai.id}`, 0, 1_000]]), { token: m.token });

    const tb = await t.get(`${m.c}/reports/trial-balance`, { token: m.token, query: { from: '2026-04-01', to: '2027-03-31' } });
    expect(tb.status).toBe(200);
    expect(tb.body.totalDebit).toEqual(tb.body.totalCredit);
    const row = (account: string) => tb.body.rows.find((r: { account: string }) => r.account === account);
    expect(row('sys:tdsPayable:194C').closing.minor).toBe(-80_000);
    expect(row('sys:tdsReceivable').closing.minor).toBe(4_000);
    expect(row('sys:sales').closing.minor).toBe(-200_000);
    // 5,000 owed at the start + 2,360 invoiced − 2,000 paid − 40 TDS − 10 written off.
    expect(row(`party:${m.mumbai.id}`).closing.minor).toBe(500_000 + 236_000 - 200_000 - 4_000 - 1_000);
  });

  it('needs the books module', async () => {
    const m = await moneySetup(t, 'free');
    const res = await t.post(`${m.c}/vouchers`, voucher('journal', [['sys:roundOff', 100, 0], ['sys:otherIncome', 0, 100]]), { token: m.token });
    expect(res.body.code).toBe('PLAN_UPGRADE_REQUIRED');
  });
});
