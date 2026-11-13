import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { issueInvoice, line, moneySetup, type Money } from './money-fixtures';
import { joinTeam } from './team-helpers';

/** Tax worked out as the law has it (money audit, phase 3). */
const t = setupApi();
beforeEach(() => t.setNow('2026-09-29T10:00:00Z'));

const inr = (minor: number) => ({ minor, currency: 'INR' });
const bill = (m: Money, over: Record<string, unknown> = {}) => ({ kind: 'purchaseBill', partyId: m.supplier!.id, date: '2026-09-20', currency: 'INR', supplierDocNumber: 'KS/1', lines: [line(m.gst(18), { quantity: 1 })], status: 'issued', ...over });
const tb = async (m: Money, account: string) => {
  const res = await t.get(`${m.c}/reports/trial-balance`, { token: m.token, query: { from: '2026-04-01', to: '2027-03-31' } });
  return res.body.rows.find((r: { account: string }) => r.account === account)?.closing?.minor ?? 0;
};

describe('purchases', () => {
  it('charges no GST on a bill from an unregistered or composition supplier', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.parties).set({ gstRegistrationType: 'composition' }).where(eq(schema.parties.id, m.supplier!.id));
    const res = await t.post(`${m.c}/documents`, bill(m), { token: m.token });
    expect(res.status).toBe(201);
    expect(res.body.totals.totalTax.minor).toBe(0);
    expect(res.body.totals.grandTotal.minor).toBe(100_000);
  });

  it('books a composition business’s purchase GST as cost, not input credit', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.companies).set({ compositionScheme: true }).where(eq(schema.companies.id, m.companyId));
    await t.deps.db.update(schema.parties).set({ taxId: '27AABCS2222K1ZQ' }).where(eq(schema.parties.id, m.supplier!.id));
    const res = await t.post(`${m.c}/documents`, bill(m), { token: m.token });
    expect(res.status).toBe(201);
    expect(res.body.totals.totalTax.minor).toBe(18_000);
    expect(await tb(m, 'sys:inputCgst')).toBe(0);
    expect(await tb(m, 'sys:inputSgst')).toBe(0);
  });

  it('refuses the same supplier bill entered twice in a year', async () => {
    const m = await moneySetup(t);
    expect((await t.post(`${m.c}/documents`, bill(m), { token: m.token })).status).toBe(201);
    const again = await t.post(`${m.c}/documents`, bill(m, { supplierDocNumber: 'ks/ 1' }), { token: m.token });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('DUPLICATE_SUPPLIER_BILL');
  });

  it('gives back no TDS on a credit note against a bill that kept none', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.companies).set({ tan: 'MUMV12345E' }).where(eq(schema.companies.id, m.companyId));
    await t.deps.db.update(schema.parties).set({ tdsSection: '194C', pan: 'AABCK1234L' }).where(eq(schema.parties.id, m.supplier!.id));
    // ₹1,000 of contract work: under 194C's ₹30,000 single-bill threshold, so nothing kept back.
    const b = await t.post(`${m.c}/documents`, bill(m), { token: m.token });
    expect(b.body.tds?.amount?.minor ?? 0).toBe(0);
    const note = await t.post(
      `${m.c}/documents`,
      { kind: 'supplierCreditNote', partyId: m.supplier!.id, sourceDocumentId: b.body.id, date: '2026-09-25', currency: 'INR', supplierDocNumber: 'KS/CN1', noteReason: 'discount', lines: [line(m.gst(18), { quantity: 1, unitPrice: inr(10_000) })], status: 'issued' },
      { token: m.token },
    );
    expect(note.status).toBe(201);
    expect(note.body.tds?.amount?.minor ?? 0).toBe(0);
  });
});

describe('sales documents', () => {
  it('refuses negative charges and an outsized round off', async () => {
    const m = await moneySetup(t);
    const neg = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.mumbai.id, date: '2026-09-29', currency: 'INR', lines: [line(m.gst(18))], charges: inr(-500_000) }, { token: m.token });
    expect(neg.status).toBe(422);
    expect(neg.body.issues[0].field).toBe('charges');
    const round = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.mumbai.id, date: '2026-09-29', currency: 'INR', lines: [line(m.gst(18))], roundOffManual: inr(-5_000_000) }, { token: m.token });
    expect(round.status).toBe(422);
    expect(round.body.issues[0].field).toBe('roundOffManual');
  });

  it('holds a credit note to the rates its invoice charged, and a direct one to its amount', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const at28 = await t.post(
      `${m.c}/documents`,
      { kind: 'creditNote', partyId: m.mumbai.id, sourceDocumentId: inv.id, date: '2026-09-29', currency: 'INR', noteReason: 'discount', lines: [line(m.gst(28), { name: 'Rate difference', quantity: 1, unitPrice: inr(1_000) })] },
      { token: m.token },
    );
    expect(at28.status).toBe(422);
    const direct = await t.post(
      `${m.c}/documents`,
      { kind: 'creditNote', partyId: m.mumbai.id, date: '2026-09-29', currency: 'INR', noteReason: 'discount', noteGst: 'withGst', originalNumber: inv.number, originalDate: '2026-09-29', lines: [line(m.gst(18), { name: 'Discount', quantity: 1, unitPrice: inr(10_000_000) })] },
      { token: m.token },
    );
    expect(direct.status).toBe(422);
  });

  it('keeps an edit that takes an issued invoice past the approval rule to an approver', async () => {
    const m = await moneySetup(t);
    const company = await t.get(`${m.c}`, { token: m.token });
    await t.put(`${m.c}`, { ...company.body, approvalRules: [{ kind: 'invoice', overMinor: 500_000 }] }, { token: m.token, headers: { 'if-match': `"v${company.body.version}"` } });
    const clerk = await joinTeam(t, m.token, { role: 'accountant', companyIds: [m.companyId] });
    const inv = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.mumbai.id, date: '2026-09-29', currency: 'INR', lines: [line(m.gst(18))], status: 'issued' }, { token: clerk.token });
    expect(inv.status).toBe(201);
    const raised = await t.patch(`${m.c}/documents/${inv.body.id}`, { kind: 'invoice', partyId: m.mumbai.id, date: '2026-09-29', currency: 'INR', lines: [line(m.gst(18), { quantity: 50 })] }, { token: clerk.token, headers: { 'if-match': `"v${inv.body.version}"` } });
    expect(raised.status).toBe(409);
    expect(raised.body.code).toBe('DOCUMENT_NEEDS_APPROVER');
  });
});

describe('expenses', () => {
  it('claims no input credit on an expense without the supplier’s GSTIN', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.paymentAccounts).set({ openingBalanceMinor: 1_000_000 }).where(eq(schema.paymentAccounts.id, m.cash.id));
    const [cat] = await t.deps.db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, m.companyId));
    const body = { categoryId: cat.id, date: '2026-09-12', amount: inr(11_800), currency: 'INR', taxCategoryId: m.gst(18), accountId: m.cash.id, method: 'cash' };
    const without = await t.post(`${m.c}/expenses`, body, { token: m.token });
    expect(without.body.itcEligibility).toBe('ineligible');
    const withGstin = await t.post(`${m.c}/expenses`, { ...body, supplierGstin: '27AABCS2222K1ZQ' }, { token: m.token });
    expect(withGstin.body.itcEligibility ?? 'eligible').toBe('eligible');
  });
});
