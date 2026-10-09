import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { ownerWithCompany, setupApi } from './helpers';
import { documentRow, expectMoneyInvariants, pdfText, invoiceBody, issueInvoice, moneySetup, type Money } from './money-fixtures';

const t = setupApi();

/** Paid and part-paid documents fall outside the contract's create-status enum (see documents.test.ts). */

const payment = (m: Money, over: Record<string, unknown> = {}) => ({
  direction: 'received',
  partyId: m.mumbai.id,
  date: '2026-09-29',
  amount: { minor: 100000, currency: 'INR' },
  currency: 'INR',
  method: 'cash',
  accountId: m.cash.id,
  ...over,
});

const alloc = (documentId: string, minor: number) => ({ documentId, amount: { minor, currency: 'INR' } });

describe('payments', () => {
  it('moves an invoice to partiallyPaid and then paid, numbering payments and notifying', async () => {
    const m = await moneySetup(t);
    t.setNow('2026-09-29T10:00:00Z');
    const inv = await issueInvoice(t, m);
    expect(inv.totals.grandTotal.minor).toBe(236000);

    const first = await t.post(`${m.c}/payments`, payment(m, { allocations: [alloc(inv.id, 100000)] }), { token: m.token });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ number: 'PAY/26-27/0001', unallocated: { minor: 0, currency: 'INR' }, source: 'manual', allocations: [{ documentId: inv.id, documentNumber: 'INV/26-27/0001', amount: { minor: 100000 } }] });
    let doc = await t.get(`${m.c}/documents/${inv.id}`, { token: m.token });
    expect(doc.body).toMatchObject({ status: 'partiallyPaid', allocated: { minor: 100000 }, outstanding: { minor: 136000 } });
    expect(doc.body.payments.map((p: { id: string }) => p.id)).toEqual([first.body.id]);
    expect((await t.get(`${m.c}/parties/${m.mumbai.id}`, { token: m.token })).body.outstanding).toEqual({ minor: 136000, currency: 'INR' });

    const second = await t.post(`${m.c}/payments`, payment(m, { amount: { minor: 150000, currency: 'INR' }, allocations: [alloc(inv.id, 136000)] }), { token: m.token });
    expect(second.body).toMatchObject({ number: 'PAY/26-27/0002', unallocated: { minor: 14000 } });
    doc = await t.get(`${m.c}/documents/${inv.id}`, { token: m.token });
    expect(doc.body).toMatchObject({ status: 'paid', outstanding: { minor: 0 } });
    const party = await t.get(`${m.c}/parties/${m.mumbai.id}`, { token: m.token });
    expect(party.body).toMatchObject({ outstanding: { minor: 0 }, advance: { minor: 14000 } });

    const notes = await t.deps.db.select().from(schema.notifications).where(eq(schema.notifications.companyId, m.companyId));
    expect(notes.filter((n) => n.kind === 'paymentReceived')).toHaveLength(2);
    await expectMoneyInvariants(t, m.companyId);
  });

  it('validates allocations: outstanding, total, party, kind and state', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const other = await issueInvoice(t, m, { partyId: m.bengaluru.id });
    const draft = await t.post(`${m.c}/documents`, invoiceBody(m), { token: m.token });
    const quote = await t.post(`${m.c}/documents`, invoiceBody(m, { kind: 'quote', status: 'sent' }), { token: m.token });

    const over = await t.post(`${m.c}/payments`, payment(m, { amount: { minor: 300000, currency: 'INR' }, allocations: [alloc(inv.id, 236001)] }), { token: m.token });
    expect(over.status).toBe(422);
    expect(over.body.code).toBe('ALLOCATION_EXCEEDS_OUTSTANDING');
    const sum = await t.post(`${m.c}/payments`, payment(m, { allocations: [alloc(inv.id, 100001)] }), { token: m.token });
    expect(sum.status).toBe(422);
    expect(sum.body.issues[0].field).toBe('allocations');
    const wrongParty = await t.post(`${m.c}/payments`, payment(m, { allocations: [alloc(other.id, 1000)] }), { token: m.token });
    expect(wrongParty.body.issues[0]).toMatchObject({ field: 'allocations[0].documentId', message: expect.stringContaining('another party') });
    const notInvoice = await t.post(`${m.c}/payments`, payment(m, { allocations: [alloc(quote.body.id, 1000)] }), { token: m.token });
    expect(notInvoice.status).toBe(422);
    const notFinal = await t.post(`${m.c}/payments`, payment(m, { allocations: [alloc(draft.body.id, 1000)] }), { token: m.token });
    expect(notFinal.status).toBe(422);
    const upiThroughCash = await t.post(`${m.c}/payments`, payment(m, { method: 'bank' }), { token: m.token });
    expect(upiThroughCash.body.issues[0].field).toBe('accountId');

    // Nothing was written by the refusals.
    expect(await t.deps.db.select().from(schema.payments)).toHaveLength(0);
    expect((await documentRow(t, inv.id)).amountPaidMinor).toBe(0);
  });

  it('re-derives documents when a payment is edited or removed, and refuses a stale version', async () => {
    const m = await moneySetup(t);
    const a = await issueInvoice(t, m);
    const b = await issueInvoice(t, m);
    const created = await t.post(`${m.c}/payments`, payment(m, { amount: { minor: 300000, currency: 'INR' }, allocations: [alloc(a.id, 236000), alloc(b.id, 64000)] }), { token: m.token });
    const url = `${m.c}/payments/${created.body.id}`;
    expect((await documentRow(t, a.id)).status).toBe('paid');
    expect((await documentRow(t, b.id)).status).toBe('partiallyPaid');

    // Move the money from A to B.
    const saved = await t.put(url, payment(m, { amount: { minor: 300000, currency: 'INR' }, allocations: [alloc(b.id, 236000)] }), { token: m.token, headers: { 'if-match': '"v1"' } });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ version: 2, number: created.body.number, unallocated: { minor: 64000 } });
    expect(await documentRow(t, a.id)).toMatchObject({ status: 'issued', amountPaidMinor: 0 });
    expect(await documentRow(t, b.id)).toMatchObject({ status: 'paid', amountPaidMinor: 236000 });

    const stale = await t.put(url, payment(m, { amount: { minor: 300000, currency: 'INR' } }), { token: m.token, headers: { 'if-match': '"v1"' } });
    expect(stale.status).toBe(412);
    await expectMoneyInvariants(t, m.companyId);

    // The paid invoice cannot be cancelled while money sits on it.
    const cancel = await t.post(`${m.c}/documents/${b.id}/status`, { status: 'cancelled' }, { token: m.token });
    expect(cancel.status).toBe(409);

    expect((await t.del(url, { token: m.token })).status).toBe(204);
    expect(await documentRow(t, b.id)).toMatchObject({ status: 'issued', amountPaidMinor: 0 });
    expect((await t.get(url, { token: m.token })).status).toBe(404);
    await expectMoneyInvariants(t, m.companyId);
  });

  it('turns an unpaid invoice overdue after its due date and back to partly paid on payment', async () => {
    const m = await moneySetup(t);
    t.setNow('2026-09-29T10:00:00Z');
    const inv = await issueInvoice(t, m, { dueDate: '2026-10-10' });
    t.setNow('2026-10-15T10:00:00Z');
    expect((await t.get(`${m.c}/documents/${inv.id}`, { token: m.token })).body.status).toBe('overdue');
    await t.post(`${m.c}/payments`, payment(m, { date: '2026-10-15', allocations: [alloc(inv.id, 36000)] }), { token: m.token });
    // Still past due with money owing: core's statusForOutstanding keeps it overdue.
    expect((await t.get(`${m.c}/documents/${inv.id}`, { token: m.token })).body.status).toBe('overdue');
    await t.post(`${m.c}/payments`, payment(m, { date: '2026-10-15', amount: { minor: 200000, currency: 'INR' }, allocations: [alloc(inv.id, 200000)] }), { token: m.token });
    expect((await documentRow(t, inv.id)).status).toBe('paid');
  });

  it('books the FX gain on a foreign-currency invoice settled at a better rate', async () => {
    const m = await moneySetup(t);
    const usd = await t.post(
      `${m.c}/parties`,
      { kind: 'customer', name: 'Harbor Imports LLC', currency: 'USD', gstRegistrationType: 'overseas', openingBalance: { minor: 0, currency: 'USD' }, paymentTermsDays: 30, billingAddress: { line1: '1 Pier St', city: 'Boston', state: 'MA', postalCode: '02110', country: 'US' } },
      { token: m.token },
    );
    const [bank] = await t.deps.db
      .insert(schema.paymentAccounts)
      .values({ id: 'pac_usd', companyId: m.companyId, name: 'HDFC USD', type: 'bank', currency: 'USD', openingBalanceMinor: 0 })
      .returning();
    // The invoice takes the company's USD rate in effect on its date.
    await t.deps.db.insert(schema.exchangeRates).values([
      { id: 'fx_1', companyId: m.companyId, fromCurrency: 'USD', toCurrency: 'INR', rate: '82.50000000', effectiveFrom: '2026-08-01' },
      { id: 'fx_2', companyId: m.companyId, fromCurrency: 'USD', toCurrency: 'INR', rate: '83.00000000', effectiveFrom: '2026-09-15' },
    ]);
    const inv = await issueInvoice(t, m, { partyId: usd.body.id, currency: 'USD', lines: [{ name: 'Consulting', quantity: 1, unit: 'NOS', unitPrice: { minor: 10000, currency: 'USD' }, taxCategoryId: m.gst(18) }] });
    // An export: IGST (no LUT on file), no rounding for USD, and a base total at 83.
    expect(inv.totals).toMatchObject({ grandTotal: { minor: 11800, currency: 'USD' }, grandTotalBase: { minor: 979400, currency: 'INR' } });

    const paid = await t.post(
      `${m.c}/payments`,
      payment(m, { partyId: usd.body.id, currency: 'USD', amount: { minor: 11800, currency: 'USD' }, exchangeRate: 84, method: 'bank', accountId: bank.id, allocations: [{ documentId: inv.id, amount: { minor: 11800, currency: 'USD' } }] }),
      { token: m.token },
    );
    expect(paid.status).toBe(201);
    // 118.00 × (84 − 83) = ₹118.00 gained.
    expect(paid.body.fxGainLoss).toEqual({ minor: 11800, currency: 'INR' });
    expect((await documentRow(t, inv.id)).status).toBe('paid');
    expect((await documentRow(t, inv.id)).exchangeRate).toBe('83.00000000');
  });

  it('never lets two concurrent payments take the same outstanding amount', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const pay = () => t.post(`${m.c}/payments`, payment(m, { amount: { minor: 200000, currency: 'INR' }, allocations: [alloc(inv.id, 200000)] }), { token: m.token });
    const results = await Promise.all([pay(), pay(), pay()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 422, 422]);
    expect(await documentRow(t, inv.id)).toMatchObject({ amountPaidMinor: 200000, status: 'partiallyPaid' });
    await expectMoneyInvariants(t, m.companyId);
  });

  it('will not pay out more cash than the cash account holds', async () => {
    const m = await moneySetup(t);
    const toSupplier = (minor: number) => payment(m, { direction: 'paid', partyId: m.supplier!.id, amount: { minor, currency: 'INR' } });
    const empty = await t.post(`${m.c}/payments`, toSupplier(50000), { token: m.token });
    expect(empty.status).toBe(422);
    expect(empty.body).toMatchObject({ code: 'INSUFFICIENT_BALANCE', issues: [{ field: 'amount.minor', message: 'Cash holds INR 0.00; this payment needs INR 500.00' }] });

    await t.post(`${m.c}/payments`, payment(m), { token: m.token }); // ₹1,000 received in cash
    const within = await t.post(`${m.c}/payments`, toSupplier(60000), { token: m.token });
    expect(within.status).toBe(201);
    expect((await t.post(`${m.c}/payments`, toSupplier(50000), { token: m.token })).status).toBe(422);
    // Rewriting a payment does not count its own old amount against it.
    const edited = await t.put(`${m.c}/payments/${within.body.id}`, toSupplier(100000), { token: m.token, headers: { 'if-match': '"v1"' } });
    expect(edited.status).toBe(200);
  });

  it('prints a receipt, filters the list, and gates payments made on the plan', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const p = await t.post(`${m.c}/payments`, payment(m, { reference: 'UTR-7788', allocations: [alloc(inv.id, 100000)] }), { token: m.token });
    await t.post(`${m.c}/payments`, payment(m, { partyId: m.bengaluru.id }), { token: m.token });

    const pdf = await t.get(`${m.c}/payments/${p.body.id}/receipt`, { token: m.token });
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdfText(pdf.raw)).toContain('PAYMENT RECEIPT');

    expect((await t.get(`${m.c}/payments`, { token: m.token })).body.data).toHaveLength(2);
    expect((await t.get(`${m.c}/payments`, { token: m.token, query: { documentId: inv.id } })).body.data.map((x: { id: string }) => x.id)).toEqual([p.body.id]);
    expect((await t.get(`${m.c}/payments`, { token: m.token, query: { q: 'UTR-77' } })).body.data).toHaveLength(1);
    expect((await t.get(`${m.c}/payments`, { token: m.token, query: { q: 'Anand' } })).body.data).toHaveLength(1);

    const basic = await moneySetup(t, 'basic');
    const made = await t.post(`${basic.c}/payments`, payment(basic, { direction: 'paid' }), { token: basic.token });
    expect(made.status).toBe(403);
    expect(made.body.code).toBe('PLAN_UPGRADE_REQUIRED');

    // A supplier payment on Pro settles purchase bills only.
    const bill = await t.post(`${m.c}/documents`, invoiceBody(m, { kind: 'purchaseBill', partyId: m.supplier!.id, status: 'issued' }), { token: m.token });
    const toBill = await t.post(`${m.c}/payments`, payment(m, { direction: 'paid', partyId: m.supplier!.id, allocations: [alloc(bill.body.id, 50000)] }), { token: m.token });
    expect(toBill.status).toBe(201);
    expect((await documentRow(t, bill.body.id)).status).toBe('partiallyPaid');

    const outsider = await ownerWithCompany(t);
    expect((await t.get(`${outsider.c}/payments/${p.body.id}`, { token: outsider.token })).status).toBe(404);
    await expectMoneyInvariants(t, m.companyId);
  });
});
