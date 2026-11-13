import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import type { SimulatedComplianceProvider } from '../src/providers/compliance';
import { setupApi } from './helpers';
import { documentRow, invoiceBody, issueInvoice, line, moneySetup, onHand, type Money } from './money-fixtures';

const t = setupApi();
beforeEach(() => t.setNow('2026-09-29T10:00:00Z'));
const inr = (minor: number) => ({ minor, currency: 'INR' });

/** The invoice as the app reads it: editable, and why not. */
const read = async (m: Money, id: string) => (await t.get(`${m.c}/documents/${id}`, { token: m.token })).body;

/** A full edit: the invoice body again with new lines (and whatever else). */
const edit = (m: Money, id: string, over: Record<string, unknown> = {}) => t.patch(`${m.c}/documents/${id}`, invoiceBody(m, over), { token: m.token });

describe('editing the latest invoice (RULES 6.23)', () => {
  it('holds an edit that raises what the customer owes to their credit limit, unless the user accepts going over', async () => {
    const m = await moneySetup(t);
    await m.allowNegativeStock();
    const inv = await issueInvoice(t, m);
    const party = (await read(m, inv.id)).partyId as string;
    // 2 × 1,000 + 18% = 2,360 owed; a ₹3,000 limit.
    await t.deps.db.update(schema.parties).set({ creditLimitMinor: 300000 }).where(eq(schema.parties.id, party));
    const over = await edit(m, inv.id, { partyId: party, lines: [line(m.gst(18), { quantity: 3 })] });
    expect(over.status).toBe(422);
    expect(over.body.code).toBe('CREDIT_LIMIT_EXCEEDED');
    const accepted = await edit(m, inv.id, { partyId: party, lines: [line(m.gst(18), { quantity: 3 })], overrideCreditLimit: true });
    expect(accepted.status).toBe(200);
    expect(accepted.body.totals.grandTotal.minor).toBe(354000);
  });

  it('edits the latest invoice in full: same number, totals, stock and ledger posted again, before and after audited', async () => {
    const m = await moneySetup(t);
    await m.allowNegativeStock();
    const rod = await m.item();
    const inv = await issueInvoice(t, m, { lines: [line(m.gst(18), { itemId: rod })] });
    expect(await onHand(t, rod)).toBe(-2);
    const before = await read(m, inv.id);
    expect(before).toMatchObject({ editable: true });
    expect(before.editBlock).toBeUndefined();

    const res = await edit(m, inv.id, { lines: [line(m.gst(18), { itemId: rod, quantity: 3, unitPrice: inr(120000) })], notes: 'Corrected quantity' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ number: inv.number, status: 'issued', notes: 'Corrected quantity', editable: true });
    // 3 × 1,200 = 3,600 + 18% = 4,248.
    expect(res.body.totals.grandTotal.minor).toBe(424800);
    expect(await onHand(t, rod)).toBe(-3);
    const own = await t.deps.db.select().from(schema.stockMovements).where(eq(schema.stockMovements.referenceId, inv.id));
    expect(own.map((mv) => Number(mv.quantity))).toEqual([-3]);

    const tb = await t.get(`${m.c}/reports/trial-balance`, { token: m.token, query: { from: '2026-04-01', to: '2027-03-31' } });
    const row = (account: string) => tb.body.rows.find((r: { account: string }) => r.account === account);
    expect(row('sys:sales').closing.minor).toBe(-360000);
    expect(row(`party:${m.mumbai.id}`).closing.minor).toBe(424800);

    const [audit] = await t.deps.db
      .select()
      .from(schema.auditEvents)
      .where(and(eq(schema.auditEvents.entityId, inv.id), eq(schema.auditEvents.action, 'edited after issue')));
    expect(audit.before).toMatchObject({ number: inv.number, total: inr(236000), taxable: inr(200000), lines: ['Steel rod × 2 NOS @ 1000.00, 18%'] });
    expect(audit.after).toMatchObject({ number: inv.number, total: inr(424800), taxable: inr(360000), lines: ['Steel rod × 3 NOS @ 1200.00, 18%'], notes: 'Corrected quantity' });
  });

  it('edits an earlier invoice too, once a later one is issued, keeping its number and date', async () => {
    const m = await moneySetup(t);
    const first = await issueInvoice(t, m);
    const second = await issueInvoice(t, m);
    expect(await read(m, first.id)).toMatchObject({ editable: true });
    expect(await read(m, second.id)).toMatchObject({ editable: true });
    const res = await edit(m, first.id, { lines: [line(m.gst(18), { quantity: 5 })] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ number: first.number, date: '2026-09-29' });
    expect(res.body.totals.grandTotal.minor).toBe(590000);
    // Notes alone still change on any finalised invoice.
    expect((await edit(m, first.id, { notes: 'Thanks' })).status).toBe(200);
  });

  it('refuses with a payment allocated, and with a note against it', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.mumbai.id, date: '2026-09-29', amount: inr(1000), currency: 'INR', method: 'cash', accountId: m.cash.id, allocations: [{ documentId: inv.id, amount: inr(1000) }] },
      { token: m.token },
    );
    expect(await read(m, inv.id)).toMatchObject({ editable: false, editBlock: 'hasPayments' });
    expect((await edit(m, inv.id, { lines: [line(m.gst(18), { quantity: 5 })] })).status).toBe(409);

    const other = await issueInvoice(t, m);
    const cn = await t.post(
      `${m.c}/documents`,
      { kind: 'creditNote', partyId: m.mumbai.id, sourceDocumentId: other.id, date: '2026-09-29', currency: 'INR', noteReason: 'discount', lines: [line(m.gst(18), { quantity: 1, unitPrice: inr(1000) })], status: 'issued' },
      { token: m.token },
    );
    expect(cn.status).toBe(201);
    expect(await read(m, other.id)).toMatchObject({ editable: false, editBlock: 'hasNotes' });
  });

  it('refuses with a credit note applied, and opens again once the application is undone', async () => {
    const m = await moneySetup(t);
    const cn = await t.post(
      `${m.c}/documents`,
      { kind: 'creditNote', partyId: m.mumbai.id, date: '2026-09-29', currency: 'INR', noteReason: 'discount', originalNumber: 'INV/25-26/0099', originalDate: '2026-03-15', lines: [line(m.gst(18), { quantity: 1, unitPrice: inr(10000) })], status: 'issued' },
      { token: m.token },
    );
    expect(cn.status).toBe(201);
    const inv = await issueInvoice(t, m);
    const applied = await t.post(`${m.c}/payments/adjust`, { partyId: m.mumbai.id, allocations: [{ sourceType: 'note', sourceId: cn.body.id, documentId: inv.id, amount: inr(11800) }] }, { token: m.token });
    expect(applied.status).toBe(200);
    const detail = await read(m, inv.id);
    expect(detail).toMatchObject({ editable: false, editBlock: 'hasCredit' });
    expect(detail.creditApplications).toEqual([expect.objectContaining({ noteId: cn.body.id, noteNumber: cn.body.number, documentId: inv.id, amount: inr(11800) })]);
    expect((await read(m, cn.body.id)).creditApplications).toHaveLength(1);
    expect(await documentRow(t, inv.id)).toMatchObject({ amountPaidMinor: 11800 });

    // Closed books keep it.
    await t.deps.db.update(schema.companies).set({ lockedThroughDate: '2026-09-30' }).where(eq(schema.companies.id, m.companyId));
    const locked = await t.del(`${m.c}/credit-applications/${detail.creditApplications[0].id}`, { token: m.token });
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('PERIOD_LOCKED');
    await t.deps.db.update(schema.companies).set({ lockedThroughDate: null }).where(eq(schema.companies.id, m.companyId));

    const undone = await t.del(`${m.c}/credit-applications/${detail.creditApplications[0].id}`, { token: m.token });
    expect(undone.status).toBe(204);
    expect(await documentRow(t, inv.id)).toMatchObject({ amountPaidMinor: 0 });
    expect(await read(m, inv.id)).toMatchObject({ editable: true, creditApplications: [] });
    expect((await t.del(`${m.c}/credit-applications/${detail.creditApplications[0].id}`, { token: m.token })).status).toBe(404);
  });

  it('refuses in a closed period and once its GSTR-1 month is filed', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    await t.deps.db.update(schema.companies).set({ lockedThroughDate: '2026-09-30' }).where(eq(schema.companies.id, m.companyId));
    expect(await read(m, inv.id)).toMatchObject({ editable: false, editBlock: 'periodLocked' });
    await t.deps.db.update(schema.companies).set({ lockedThroughDate: null }).where(eq(schema.companies.id, m.companyId));
    await t.deps.db.insert(schema.gstReturns).values({ id: 'gret_test_1', companyId: m.companyId, gstin: '27AAPFU0939F1ZV', returnType: 'gstr1', period: '092026', status: 'filed', arn: 'AA2709260000001', filedAt: new Date() });
    expect(await read(m, inv.id)).toMatchObject({ editable: false, editBlock: 'returnFiled' });
    const res = await edit(m, inv.id, { lines: [line(m.gst(18), { quantity: 5 })] });
    expect(res.status).toBe(409);
    expect(res.body.detail).toContain('GSTR-1');
  });

  it('keeps the date it was issued on: an edit that moves it is refused', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m, { date: '2026-09-25' });
    for (const date of ['2026-09-24', '2026-09-26']) {
      const res = await edit(m, inv.id, { date });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('DATE_LOCKED');
    }
    expect((await edit(m, inv.id, { date: '2026-09-25', lines: [line(m.gst(18), { quantity: 4 })] })).status).toBe(200);
  });

  it('with FIFO costing, refuses once its items have moved since; average costing allows it', async () => {
    const m = await moneySetup(t);
    await m.allowNegativeStock();
    const rod = await m.item();
    const inv = await issueInvoice(t, m, { lines: [line(m.gst(18), { itemId: rod })] });
    await t.deps.db.insert(schema.stockMovements).values({
      id: 'stk_test_later',
      companyId: m.companyId,
      branchId: m.branch.id,
      itemId: rod,
      type: 'adjustment',
      quantity: '10',
      currency: 'INR',
      unitCostMinor: 50000,
      date: '2026-09-30',
      adjustReason: 'other',
      createdBy: m.user.id as string,
    });
    expect(await read(m, inv.id)).toMatchObject({ editable: true });
    await t.deps.db.update(schema.companies).set({ stockCosting: 'fifo' }).where(eq(schema.companies.id, m.companyId));
    expect(await read(m, inv.id)).toMatchObject({ editable: false, editBlock: 'laterStock' });
    const res = await edit(m, inv.id, { lines: [line(m.gst(18), { itemId: rod, quantity: 1 })] });
    expect(res.status).toBe(409);
    expect(res.body.detail).toContain('FIFO');
  });

  it('refuses an invoice with an IRN or an e-way bill', async () => {
    const m = await moneySetup(t);
    (t.providers.compliance as SimulatedComplianceProvider).clearFaults();
    expect((await t.put(`${m.c}/compliance-settings`, { annualTurnover: { minor: 60_000_000_00, currency: 'INR' } }, { token: m.token })).status).toBe(200);
    await m.allowNegativeStock();
    const rod = await m.item();
    const goods = await issueInvoice(t, m, { partyId: m.bengaluru.id, lines: [line(m.gst(18), { itemId: rod, hsnCode: '721420', unitPrice: inr(50_000_00) })] });
    const eway = await t.post(
      `${m.c}/eway-bills`,
      {
        documentId: goods.id,
        subSupplyType: 'supply',
        transactionType: 1,
        from: { legalName: 'Vertex Traders', gstin: '27AAPFU0939F1ZV', address1: '12 Market Road', place: 'Mumbai', pincode: '400001', stateCode: '27' },
        to: { legalName: 'Anand Enterprises', gstin: '29AABCG4321K1ZM', address1: '4 MG Road', place: 'Bengaluru', pincode: '560001', stateCode: '29' },
        transporterId: '27AABCT5512M1Z6',
        transporterName: 'Konkan Roadlines',
        transportMode: 'road',
        vehicleNumber: 'MH04AB1234',
        vehicleType: 'regular',
        distanceKm: 450,
      },
      { token: m.token },
    );
    expect(eway.status).toBe(201);
    expect(await read(m, goods.id)).toMatchObject({ editable: false, editBlock: 'ewayBill' });

    const irn = await t.post(`${m.c}/documents/${goods.id}/e-invoice`, {}, { token: m.token });
    expect(irn.status).toBe(200);
    expect(await read(m, goods.id)).toMatchObject({ editable: false, editBlock: 'eInvoiced' });
    const res = await edit(m, goods.id, { partyId: m.bengaluru.id, lines: [line(m.gst(18), { itemId: rod, quantity: 1 })] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DOCUMENT_LOCKED');
  });
});
