import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { documentRow, expectMoneyInvariants, issueInvoice, moneySetup, razorpay } from './money-fixtures';

const t = setupApi();

afterEach(() => vi.restoreAllMocks());

describe('sending a document', () => {
  it('sends once when a retry arrives under a new key, and again after the window', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const spy = vi.spyOn(t.deps.providers.whatsapp, 'send');
    const send = () => t.post(`${m.c}/documents/${inv.id}/send`, { channel: 'whatsapp', to: ['+919876543210'], attachPdf: false }, { token: m.token, headers: { 'idempotency-key': randomUUID() } });

    const first = await send();
    const again = await send();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(again.body.messageId).toBe(first.body.messageId);

    t.setNow(new Date(t.deps.now().getTime() + 3 * 60_000));
    await send();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('records a failed send, and holds no transaction open while sending', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const locked: boolean[] = [];
    vi.spyOn(t.deps.providers.whatsapp, 'send').mockImplementation(async () => {
      const rows = await t.deps.db.select().from(schema.messageDeliveries).where(eq(schema.messageDeliveries.documentId, inv.id));
      locked.push(rows.length === 0);
      throw new Error('Meta is down');
    });
    await t.post(`${m.c}/documents/${inv.id}/send`, { channel: 'whatsapp', to: ['+919876543210'], attachPdf: false }, { token: m.token });

    // Visible from another connection during the send: the row was already committed.
    expect(locked).toEqual([false]);
    const [row] = await t.deps.db.select().from(schema.messageDeliveries).where(eq(schema.messageDeliveries.documentId, inv.id));
    expect(row).toMatchObject({ status: 'failed', error: 'Meta is down' });
  });
});

describe('webhooks: razorpay ordering and refunds', () => {
  const linkPaid = (linkId: string, amount: number, paymentId: string) => ({
    entity: 'event',
    event: 'payment_link.paid',
    contains: ['payment_link', 'payment'],
    payload: {
      payment_link: { entity: { id: linkId, amount, amount_paid: amount, currency: 'INR', status: 'paid' } },
      payment: { entity: { id: paymentId, amount, currency: 'INR', method: 'upi', status: 'captured', created_at: 1790000000 } },
    },
  });

  async function paidInvoice() {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const link = await t.post(`${m.c}/documents/${inv.id}/payment-link`, {}, { token: m.token });
    const [pl] = await t.deps.db.select().from(schema.paymentLinks).where(eq(schema.paymentLinks.url, link.body.url));
    expect((await razorpay(t, linkPaid(pl.providerLinkId, inv.totals.grandTotal.minor, 'pay_R1'), { eventId: 'evt_paid' })).status).toBe(200);
    return { m, inv };
  }
  const refund = (amount: number) => ({ entity: 'event', event: 'refund.processed', contains: ['refund'], payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_R1', amount } } } });

  it('a full refund undoes the payment and reopens the invoice', async () => {
    const { inv } = await paidInvoice();
    expect((await documentRow(t, inv.id)).amountPaidMinor).toBe(inv.totals.grandTotal.minor);
    await razorpay(t, refund(inv.totals.grandTotal.minor), { eventId: 'evt_refund' });
    expect((await documentRow(t, inv.id)).amountPaidMinor).toBe(0);
    expect(await t.deps.db.select().from(schema.payments)).toHaveLength(0);
  });

  it('a partial refund shrinks the payment, reopens that much of the invoice, and tells the owner', async () => {
    const { inv } = await paidInvoice();
    const total = inv.totals.grandTotal.minor;
    const thirty = Math.round(total * 0.3);
    await razorpay(t, refund(thirty), { eventId: 'evt_refund' });
    expect((await documentRow(t, inv.id)).amountPaidMinor).toBe(total - thirty);
    const [payment] = await t.deps.db.select().from(schema.payments);
    expect(payment.amountMinor).toBe(total - thirty);
    expect(payment.notes).toContain('refunded online');
    const notes = await t.deps.db.select().from(schema.notifications);
    expect(notes.some((n) => n.title === 'Partial refund recorded')).toBe(true);
    // The same event delivered again changes nothing.
    await razorpay(t, refund(thirty), { eventId: 'evt_refund' });
    expect((await t.deps.db.select().from(schema.payments))[0].amountMinor).toBe(total - thirty);
  });

  it('takes a partial refund off the newest invoice a payment covers, leaving the older one paid', async () => {
    const m = await moneySetup(t);
    const older = await issueInvoice(t, m, { date: '2026-09-20' });
    const newer = await issueInvoice(t, m, { date: '2026-09-28' });
    const a = older.totals.grandTotal.minor;
    const b = newer.totals.grandTotal.minor;
    const paid = await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.mumbai.id, date: '2026-09-29', amount: { minor: a + b, currency: 'INR' }, currency: 'INR', method: 'cash', reference: 'pay_R2', accountId: m.cash.id, allocations: [{ documentId: older.id, amount: { minor: a, currency: 'INR' } }, { documentId: newer.id, amount: { minor: b, currency: 'INR' } }] },
      { token: m.token },
    );
    expect(paid.status).toBe(201);
    const refunded = Math.round((a + b) * 0.3);
    await razorpay(t, { entity: 'event', event: 'refund.processed', contains: ['refund'], payload: { refund: { entity: { id: 'rfnd_2', payment_id: 'pay_R2', amount: refunded } } } }, { eventId: 'evt_refund_2' });
    expect((await documentRow(t, older.id)).amountPaidMinor).toBe(a);
    expect((await documentRow(t, newer.id)).amountPaidMinor).toBe(b - refunded);
    await expectMoneyInvariants(t, m.companyId);
  });

  it('a late charge does not undo a cancelled subscription', async () => {
    const m = await moneySetup(t);
    const sub = (event: string) => ({ entity: 'event', event, contains: ['subscription'], payload: { subscription: { entity: { id: 'sub_1', notes: { companyId: m.company.id, plan: 'pro', cycle: 'monthly' } } } } });
    await razorpay(t, sub('subscription.charged'), { eventId: 'evt_a' });
    await razorpay(t, sub('subscription.cancelled'), { eventId: 'evt_b' });
    await razorpay(t, sub('subscription.charged'), { eventId: 'evt_c' });
    const [company] = await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.company.id!));
    expect(company.plan).toBe('free');
  });
});
