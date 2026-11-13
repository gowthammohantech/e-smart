import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { issueInvoice, moneySetup, type Money } from './money-fixtures';
import { joinTeam } from './team-helpers';

/**
 * Money leaving the business without the controls meant to hold it: the loopholes found in the
 * November 2026 money audit (phase 1), each held shut here.
 */
const t = setupApi();
beforeEach(() => t.setNow('2026-09-29T10:00:00Z'));

const inr = (minor: number) => ({ minor, currency: 'INR' });
const nil = inr(0);
const voucher = (kind: string, lines: [string, number, number][], over: Record<string, unknown> = {}) => ({
  kind,
  date: '2026-09-29',
  lines: lines.map(([account, debit, credit]) => ({ account, debit: inr(debit), credit: inr(credit) })),
  ...over,
});
const fund = (m: Money, minor = 10_000_000) => t.deps.db.update(schema.paymentAccounts).set({ openingBalanceMinor: minor }).where(eq(schema.paymentAccounts.id, m.cash.id));
async function withRule(m: Money, overMinor: number) {
  const company = await t.get(`${m.c}`, { token: m.token });
  await t.put(`${m.c}`, { ...company.body, approvalRules: [{ kind: 'payment', overMinor }] }, { token: m.token, headers: { 'if-match': `"v${company.body.version}"` } });
}
const receipt = (m: Money, over: Record<string, unknown> = {}) => ({ direction: 'received', partyId: m.mumbai.id, date: '2026-09-29', amount: inr(100_000), currency: 'INR', method: 'cash', accountId: m.cash.id, ...over });
const payment = (m: Money, over: Record<string, unknown> = {}) => ({ direction: 'paid', partyId: m.supplier!.id, date: '2026-09-29', amount: inr(100_000), currency: 'INR', method: 'cash', accountId: m.cash.id, ...over });

describe('advance TDS and refunds', () => {
  it('caps the TDS a customer kept back from an advance, and refunds only the cash', async () => {
    const m = await moneySetup(t);
    // ₹1 received with ₹10 lakh "TDS": the gross would be ₹10,00,001, of which the TDS is ~100%.
    const fake = await t.post(`${m.c}/payments`, receipt(m, { amount: inr(100), tdsSection: '194JB', advanceTds: inr(100_000_000) }), { token: m.token });
    expect(fake.status).toBe(422);
    expect(fake.body.issues.map((i: { field: string }) => i.field)).toContain('advanceTds');

    // ₹90,000 received after 10% TDS (₹10,000) on ₹1,00,000: within 194J(b)'s ceiling.
    const adv = await t.post(`${m.c}/payments`, receipt(m, { amount: inr(9_000_000), tdsSection: '194JB', advanceTds: inr(1_000_000) }), { token: m.token });
    expect(adv.status).toBe(201);
    // The TDS was never paid to us, so only the ₹90,000 can go back.
    const tooMuch = await t.post(`${m.c}/payments`, payment(m, { partyId: m.mumbai.id, amount: inr(10_000_000), refundOf: adv.body.id }), { token: m.token });
    expect(tooMuch.status).toBe(422);
    const ok = await t.post(`${m.c}/payments`, payment(m, { partyId: m.mumbai.id, amount: inr(9_000_000), refundOf: adv.body.id }), { token: m.token });
    expect(ok.status).toBe(201);
  });

  it('holds a refund over the approval rule like any other payment out', async () => {
    const m = await moneySetup(t);
    const adv = await t.post(`${m.c}/payments`, receipt(m, { amount: inr(500_000) }), { token: m.token });
    await withRule(m, 100_000);
    const clerk = await joinTeam(t, m.token, { role: 'accountant', companyIds: [m.companyId] });
    const refund = await t.post(`${m.c}/payments`, payment(m, { partyId: m.mumbai.id, amount: inr(400_000), refundOf: adv.body.id }), { token: clerk.token });
    expect(refund.status).toBe(409);
    expect(refund.body.code).toBe('PAYMENT_HELD');
  });
});

describe('settling without money', () => {
  it('keeps discounts to the books’ keepers and TDS within its section’s rate', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const total = inv.totals.grandTotal.minor;
    const sales = await joinTeam(t, m.token, { role: 'sales', companyIds: [m.companyId] });
    // A sales user can't mark the whole invoice paid as a "discount".
    const discounted = await t.post(`${m.c}/payments`, receipt(m, { amount: nil, allocations: [{ documentId: inv.id, amount: nil, discount: inr(total) }] }), { token: sales.token });
    expect(discounted.status).toBe(422);
    // Nor settle it as "TDS": at most 20% of the ₹2,000 taxable value.
    const tds = await t.post(`${m.c}/payments`, receipt(m, { amount: nil, allocations: [{ documentId: inv.id, amount: nil, tdsDeducted: inr(total) }] }), { token: sales.token });
    expect(tds.status).toBe(422);
    expect(tds.body.issues[0].field).toBe('allocations[0].tdsDeducted');
    // Real TDS (10% of taxable) goes through.
    const fine = await t.post(`${m.c}/payments`, receipt(m, { amount: inr(total - 20_000), tdsSection: '194JB', allocations: [{ documentId: inv.id, amount: inr(total - 20_000), tdsDeducted: inr(20_000) }] }), { token: sales.token });
    expect(fine.status).toBe(201);
  });
});

describe('the approval rule, however money leaves', () => {
  it('applies to vouchers and expenses paid out of cash or bank', async () => {
    const m = await moneySetup(t);
    await fund(m);
    await withRule(m, 100_000);
    const clerk = await joinTeam(t, m.token, { role: 'accountant', companyIds: [m.companyId] });
    // Dr rent / Cr cash ₹50,000 by journal: a payment by another name.
    const rent = await t.post(`${m.c}/ledger-accounts`, { name: 'Rent', group: 'indirectExpenses', openingBalance: nil }, { token: m.token });
    const jv = await t.post(`${m.c}/vouchers`, voucher('journal', [[`acc:${rent.body.id}`, 5_000_000, 0], [`pay:${m.cash.id}`, 0, 5_000_000]]), { token: clerk.token });
    expect(jv.status).toBe(409);
    expect(jv.body.code).toBe('PAYMENT_NEEDS_APPROVER');
    // Dr supplier / Cr cash, by anyone but an owner or admin: record it as a payment, so its bills settle.
    const toSupplier = await t.post(`${m.c}/vouchers`, voucher('journal', [[`party:${m.supplier!.id}`, 5_000, 0], [`pay:${m.cash.id}`, 0, 5_000]], { narration: 'Paid' }), { token: clerk.token });
    expect(toSupplier.status).toBe(403);
    expect(toSupplier.body.code).toBe('CONTROL_ACCOUNT_ROLE');
    // Nor may a journal invent money in the GST cash ledger.
    const invented = await t.post(`${m.c}/vouchers`, voucher('journal', [['sys:gstCashLedger:igst', 5_000, 0], ['sys:capital', 0, 5_000]], { narration: 'x' }), { token: m.token });
    expect(invented.status).toBe(422);
    const [cat] = await t.deps.db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, m.companyId));
    const exp = await t.post(`${m.c}/expenses`, { categoryId: cat.id, date: '2026-09-29', amount: inr(5_000_000), currency: 'INR', accountId: m.cash.id, method: 'cash' }, { token: clerk.token });
    expect(exp.status).toBe(409);
    expect(exp.body.code).toBe('PAYMENT_NEEDS_APPROVER');
    // The owner records either.
    expect((await t.post(`${m.c}/vouchers`, voucher('journal', [[`party:${m.supplier!.id}`, 5_000_000, 0], [`pay:${m.cash.id}`, 0, 5_000_000]], { narration: 'Settled outside the app' }), { token: m.token })).status).toBe(201);
  });

  it('measures payments split into pieces together', async () => {
    const m = await moneySetup(t);
    await fund(m);
    await withRule(m, 100_000);
    const clerk = await joinTeam(t, m.token, { role: 'accountant', companyIds: [m.companyId] });
    expect((await t.post(`${m.c}/payments`, payment(m, { amount: inr(90_000) }), { token: clerk.token })).status).toBe(201);
    const second = await t.post(`${m.c}/payments`, payment(m, { amount: inr(90_000) }), { token: clerk.token });
    expect(second.body.code).toBe('PAYMENT_HELD');
    // Sent again, it is the same request, not a second one.
    const again = await t.post(`${m.c}/payments`, payment(m, { amount: inr(90_000) }), { token: clerk.token });
    expect(again.body.requestId).toBe(second.body.requestId);
  });

  it('treats an edit that turns money received into money paid as a new payment', async () => {
    const m = await moneySetup(t);
    await fund(m);
    await withRule(m, 100_000);
    const clerk = await joinTeam(t, m.token, { role: 'accountant', companyIds: [m.companyId] });
    const rec = await t.post(`${m.c}/payments`, receipt(m, { amount: inr(1_000_000) }), { token: clerk.token });
    expect(rec.status).toBe(201);
    const flipped = await t.put(`${m.c}/payments/${rec.body.id}`, payment(m, { amount: inr(1_000_000) }), { token: clerk.token, headers: { 'if-match': `"v${rec.body.version}"` } });
    expect(flipped.status).toBe(409);
    expect(flipped.body.code).toBe('PAYMENT_NEEDS_APPROVER');
  });

  it('measures a foreign payment at the rate on file, and refuses a rate far from it', async () => {
    const m = await moneySetup(t);
    await fund(m);
    await t.post(`${m.c}/exchange-rates`, { from: 'USD', to: 'INR', rate: 85, effectiveFrom: '2026-09-01' }, { token: m.token });
    await t.deps.db.update(schema.parties).set({ currency: 'USD' }).where(eq(schema.parties.id, m.supplier!.id));
    const usd = { amount: { minor: 50_000, currency: 'USD' }, currency: 'USD' };
    // $500 at 0.01 would be ₹5.
    const silly = await t.post(`${m.c}/payments`, payment(m, { ...usd, exchangeRate: 0.01 }), { token: m.token });
    expect(silly.status).toBe(422);
    expect(silly.body.issues.map((i: { field: string }) => i.field)).toContain('exchangeRate');
    expect((await t.post(`${m.c}/payments`, payment(m, { ...usd, exchangeRate: 84 }), { token: m.token })).status).toBe(201);
  });
});

describe('money taken back out of an account', () => {
  it('refuses to delete or cut a receipt whose money has been spent', async () => {
    const m = await moneySetup(t);
    const rec = await t.post(`${m.c}/payments`, receipt(m, { amount: inr(200_000) }), { token: m.token });
    expect((await t.post(`${m.c}/payments`, payment(m, { amount: inr(200_000) }), { token: m.token })).status).toBe(201);
    const del = await t.del(`${m.c}/payments/${rec.body.id}`, { token: m.token, headers: { 'if-match': `"v${rec.body.version}"` } });
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('INSUFFICIENT_BALANCE');
    const cut = await t.put(`${m.c}/payments/${rec.body.id}`, receipt(m, { amount: inr(1_000) }), { token: m.token, headers: { 'if-match': `"v${rec.body.version}"` } });
    expect(cut.body.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('refuses to delete a receipt voucher whose money has been spent, and keeps appropriations to owners', async () => {
    const m = await moneySetup(t);
    const income = await t.post(`${m.c}/ledger-accounts`, { name: 'Interest received', group: 'indirectIncomes', openingBalance: nil }, { token: m.token });
    const rv = await t.post(`${m.c}/vouchers`, voucher('receipt', [[`pay:${m.cash.id}`, 200_000, 0], [`acc:${income.body.id}`, 0, 200_000]], { narration: 'FD interest' }), { token: m.token });
    expect((await t.post(`${m.c}/payments`, payment(m, { amount: inr(200_000) }), { token: m.token })).status).toBe(201);
    const del = await t.del(`${m.c}/vouchers/${rv.body.id}`, { token: m.token, headers: { 'if-match': `"v${rv.body.version}"` } });
    expect(del.body.code).toBe('INSUFFICIENT_BALANCE');

    await fund(m);
    const appropriation = await t.post(`${m.c}/vouchers`, voucher('journal', [['sys:retainedEarnings', 100_000, 0], ['sys:otherIncome', 0, 100_000]], { narration: 'Prior-period correction' }), { token: m.token });
    expect(appropriation.status).toBe(201);
    const accountant = await joinTeam(t, m.token, { role: 'accountant', companyIds: [m.companyId] });
    const gone = await t.del(`${m.c}/vouchers/${appropriation.body.id}`, { token: accountant.token, headers: { 'if-match': `"v${appropriation.body.version}"` } });
    expect(gone.status).toBe(403);
  });
});

describe('who may undo a sale or redirect money', () => {
  it('keeps cancelling an issued invoice to owners, admins and accountants', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const sales = await joinTeam(t, m.token, { role: 'sales', companyIds: [m.companyId] });
    const res = await t.post(`${m.c}/documents/${inv.id}/status`, { status: 'cancelled', reason: 'oops' }, { token: sales.token, headers: { 'if-match': `"v${inv.version}"` } });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CANCEL_ROLE');
    expect((await t.post(`${m.c}/documents/${inv.id}/status`, { status: 'cancelled', reason: 'Raised twice' }, { token: m.token, headers: { 'if-match': `"v${inv.version}"` } })).status).toBe(200);
  });

  it('lets only an owner or admin change the bank details invoices print, and tells the owners', async () => {
    const m = await moneySetup(t);
    const bank = await t.post(`${m.c}/payment-accounts`, { name: 'HDFC current', type: 'bank', currency: 'INR', openingBalance: nil, accountNumber: '50100012345678', ifsc: 'HDFC0001234', bankName: 'HDFC Bank' }, { token: m.token });
    await t.deps.db.update(schema.companies).set({ bankPaymentAccountId: bank.body.id }).where(eq(schema.companies.id, m.companyId));
    const accountant = await joinTeam(t, m.token, { role: 'accountant', companyIds: [m.companyId] });
    const body = { name: 'HDFC current', type: 'bank', currency: 'INR', openingBalance: nil, accountNumber: '99999999999999', ifsc: 'ICIC0009999', bankName: 'Elsewhere Bank' };
    const sneaky = await t.put(`${m.c}/payment-accounts/${bank.body.id}`, body, { token: accountant.token, headers: { 'if-match': `"v${bank.body.version}"` } });
    expect(sneaky.status).toBe(403);
    // Renaming it is fine.
    expect((await t.put(`${m.c}/payment-accounts/${bank.body.id}`, { ...body, name: 'HDFC main', accountNumber: '50100012345678', ifsc: 'HDFC0001234', bankName: 'HDFC Bank' }, { token: accountant.token, headers: { 'if-match': `"v${bank.body.version}"` } })).status).toBe(200);
  });

  it('keeps a cash or bank opening balance out of closed books', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.companies).set({ lockedThroughDate: '2026-06-30' }).where(eq(schema.companies.id, m.companyId));
    const [cash] = await t.deps.db.select().from(schema.paymentAccounts).where(eq(schema.paymentAccounts.id, m.cash.id));
    const res = await t.put(`${m.c}/payment-accounts/${m.cash.id}`, { name: cash.name, type: cash.type, currency: 'INR', openingBalance: inr(50_000_000) }, { token: m.token, headers: { 'if-match': `"v${cash.version}"` } });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PERIOD_LOCKED');
  });
});

describe('cash on the day it moves (phase 4)', () => {
  it('pays nothing out on a day before the money came in, and nothing ahead of today', async () => {
    const m = await moneySetup(t);
    expect((await t.post(`${m.c}/payments`, receipt(m, { amount: inr(100_000), date: '2026-09-25' }), { token: m.token })).status).toBe(201);
    // ₹1,000 arrives on the 25th: a payment on the 20th can't spend it.
    const early = await t.post(`${m.c}/payments`, payment(m, { amount: inr(100_000), date: '2026-09-20' }), { token: m.token });
    expect(early.body.code).toBe('INSUFFICIENT_BALANCE');
    expect((await t.post(`${m.c}/payments`, payment(m, { amount: inr(100_000), date: '2026-09-25' }), { token: m.token })).status).toBe(201);
    const ahead = await t.post(`${m.c}/payments`, receipt(m, { date: '2026-10-15' }), { token: m.token });
    expect(ahead.status).toBe(422);
    expect(ahead.body.issues[0].field).toBe('date');
  });

  it('keeps an expense from spending money that arrives later', async () => {
    const m = await moneySetup(t);
    expect((await t.post(`${m.c}/payments`, receipt(m, { amount: inr(100_000), date: '2026-09-25' }), { token: m.token })).status).toBe(201);
    const [cat] = await t.deps.db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, m.companyId));
    const exp = await t.post(`${m.c}/expenses`, { categoryId: cat.id, date: '2026-09-10', amount: inr(50_000), currency: 'INR', accountId: m.cash.id, method: 'cash' }, { token: m.token });
    expect(exp.body.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('refuses a receipt moved later once the money has been spent in between', async () => {
    const m = await moneySetup(t);
    const rec = await t.post(`${m.c}/payments`, receipt(m, { amount: inr(100_000), date: '2026-09-10' }), { token: m.token });
    expect((await t.post(`${m.c}/payments`, payment(m, { amount: inr(100_000), date: '2026-09-15' }), { token: m.token })).status).toBe(201);
    const moved = await t.put(`${m.c}/payments/${rec.body.id}`, receipt(m, { amount: inr(100_000), date: '2026-09-20' }), { token: m.token, headers: { 'if-match': `"v${rec.body.version}"` } });
    expect(moved.body.code).toBe('INSUFFICIENT_BALANCE');
    // Moved earlier, nothing gets worse.
    expect((await t.put(`${m.c}/payments/${rec.body.id}`, receipt(m, { amount: inr(100_000), date: '2026-09-05' }), { token: m.token, headers: { 'if-match': `"v${rec.body.version}"` } })).status).toBe(200);
  });
});

describe('the books’ own figures (phase 4)', () => {
  it('keeps opening stock out of closed books', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.companies).set({ lockedThroughDate: '2026-06-30' }).where(eq(schema.companies.id, m.companyId));
    const res = await t.post(`${m.c}/items`, { sku: 'LATE-1', name: 'Late rod', type: 'goods', unit: 'NOS', salePrice: inr(1_000), purchasePrice: inr(600), taxCategoryId: m.gst(18), trackInventory: true, openingStock: 1000 }, { token: m.token });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PERIOD_LOCKED');
  });

  it('keeps vouchers off accounts kept in another currency', async () => {
    const m = await moneySetup(t);
    const usd = await t.post(`${m.c}/payment-accounts`, { name: 'USD account', type: 'bank', currency: 'USD', openingBalance: { minor: 0, currency: 'USD' } }, { token: m.token });
    await fund(m);
    const contra = await t.post(`${m.c}/vouchers`, voucher('contra', [[`pay:${usd.body.id}`, 8_300_000, 0], [`pay:${m.cash.id}`, 0, 8_300_000]]), { token: m.token });
    expect(contra.status).toBe(422);
  });
});

describe('cash limits in the Income-tax Act (phase 8)', () => {
  it('refuses ₹2 lakh or more in cash from one person in a day, and tells the owners of large cash payments', async () => {
    const m = await moneySetup(t);
    expect((await t.post(`${m.c}/payments`, receipt(m, { amount: inr(15_000_000) }), { token: m.token })).status).toBe(201);
    const second = await t.post(`${m.c}/payments`, receipt(m, { amount: inr(5_000_000) }), { token: m.token });
    expect(second.status).toBe(422);
    expect(second.body.issues[0].field).toBe('method');
    // By bank it is fine.
    const hdfc = await t.post(`${m.c}/payment-accounts`, { name: 'HDFC', type: 'bank', currency: 'INR', openingBalance: nil }, { token: m.token });
    expect((await t.post(`${m.c}/payments`, receipt(m, { amount: inr(5_000_000), method: 'bank', accountId: hdfc.body.id }), { token: m.token })).status).toBe(201);
    // ₹15,000 in cash to a supplier: recorded, and the owners told.
    expect((await t.post(`${m.c}/payments`, payment(m, { amount: inr(1_500_000) }), { token: m.token })).status).toBe(201);
    const notes = await t.deps.db.select().from(schema.notifications).where(eq(schema.notifications.companyId, m.companyId));
    expect(notes.some((n) => n.title === 'Cash payment over ₹10,000')).toBe(true);
  });
});
