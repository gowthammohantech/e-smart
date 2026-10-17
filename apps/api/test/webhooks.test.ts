import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { documentRow, expectMoneyInvariants, issueInvoice, moneySetup, razorpay } from './money-fixtures';

const t = setupApi();

const linkPaid = (linkId: string, amount: number, paymentId = 'pay_RZP123') => ({
  entity: 'event',
  event: 'payment_link.paid',
  contains: ['payment_link', 'payment'],
  payload: {
    payment_link: { entity: { id: linkId, amount, amount_paid: amount, currency: 'INR', status: 'paid' } },
    payment: { entity: { id: paymentId, amount, currency: 'INR', method: 'upi', status: 'captured', created_at: 1790000000 } },
  },
});

describe('webhooks: razorpay', () => {
  it('rejects a bad signature without touching anything', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const link = await t.post(`${m.c}/documents/${inv.id}/payment-link`, {}, { token: m.token });
    const [pl] = await t.deps.db.select().from(schema.paymentLinks).where(eq(schema.paymentLinks.url, link.body.url));

    const res = await razorpay(t, linkPaid(pl.providerLinkId, 236000), { signature: 'deadbeef', eventId: 'evt_1' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
    expect(await t.deps.db.select().from(schema.payments)).toHaveLength(0);
    const [stored] = await t.deps.db.select().from(schema.webhookEvents);
    expect(stored).toMatchObject({ signatureValid: false, processedAt: null });

    // The genuine delivery of the same event is still processed.
    expect((await razorpay(t, linkPaid(pl.providerLinkId, 236000), { eventId: 'evt_1' })).status).toBe(200);
    expect(await t.deps.db.select().from(schema.payments)).toHaveLength(1);
  });

  it('records a gateway payment for payment_link.paid, allocates it, and ignores the retry', async () => {
    const m = await moneySetup(t);
    await t.deps.db.insert(schema.paymentAccounts).values({ id: 'pac_bank', companyId: m.companyId, name: 'HDFC Current', type: 'bank', currency: 'INR' });
    const inv = await issueInvoice(t, m);
    const link = await t.post(`${m.c}/documents/${inv.id}/payment-link`, {}, { token: m.token });
    const [pl] = await t.deps.db.select().from(schema.paymentLinks).where(eq(schema.paymentLinks.url, link.body.url));

    const res = await razorpay(t, linkPaid(pl.providerLinkId, 236000), { eventId: 'evt_paid' });
    expect(res.status).toBe(200);
    expect(await documentRow(t, inv.id)).toMatchObject({ status: 'paid', amountPaidMinor: 236000 });

    const [linkRow] = await t.deps.db.select().from(schema.paymentLinks).where(eq(schema.paymentLinks.id, pl.id));
    expect(linkRow.status).toBe('paid');
    const payment = await t.get(`${m.c}/payments/${linkRow.paymentId}`, { token: m.token });
    expect(payment.body).toMatchObject({ direction: 'received', source: 'gateway', method: 'upi', accountId: 'pac_bank', reference: 'pay_RZP123', number: 'PAY/26-27/0001', amount: { minor: 236000 } });

    // Razorpay retries: same event id, nothing new.
    expect((await razorpay(t, linkPaid(pl.providerLinkId, 236000), { eventId: 'evt_paid' })).status).toBe(200);
    expect(await t.deps.db.select().from(schema.payments)).toHaveLength(1);
    const events = await t.deps.db.select().from(schema.webhookEvents);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ source: 'razorpay', eventType: 'payment_link.paid', signatureValid: true, error: null });
    expect(events[0].processedAt).not.toBeNull();
    const notes = await t.deps.db.select().from(schema.notifications).where(eq(schema.notifications.kind, 'paymentReceived'));
    expect(notes).toHaveLength(1);
    await expectMoneyInvariants(t, m.companyId);
  });

  it('keeps an overpayment through a link as the customer’s advance', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const link = await t.post(`${m.c}/documents/${inv.id}/payment-link`, { amount: { minor: 100000, currency: 'INR' } }, { token: m.token });
    const [pl] = await t.deps.db.select().from(schema.paymentLinks).where(eq(schema.paymentLinks.url, link.body.url));
    // Meanwhile the customer paid most of it in cash.
    await t.post(`${m.c}/payments`, { direction: 'received', partyId: m.mumbai.id, date: '2026-09-29', amount: { minor: 200000, currency: 'INR' }, currency: 'INR', method: 'cash', accountId: m.cash.id, allocations: [{ documentId: inv.id, amount: { minor: 200000, currency: 'INR' } }] }, { token: m.token });

    await razorpay(t, linkPaid(pl.providerLinkId, 100000), { eventId: 'evt_over' });
    expect(await documentRow(t, inv.id)).toMatchObject({ status: 'paid', amountPaidMinor: 236000 });
    const [gateway] = await t.deps.db.select().from(schema.payments).where(eq(schema.payments.reference, 'pay_RZP123'));
    // No bank account on file: the collection goes to the default account as "other".
    expect(gateway).toMatchObject({ amountMinor: 100000, unallocatedMinor: 64000, method: 'other', accountId: m.cash.id });
    await expectMoneyInvariants(t, m.companyId);
  });

  it('acknowledges events it does not handle, and unknown links, without failing', async () => {
    await moneySetup(t);
    expect((await razorpay(t, { event: 'order.paid', payload: {} }, { eventId: 'evt_x' })).status).toBe(200);
    expect((await razorpay(t, linkPaid('plink_unknown', 100), { eventId: 'evt_y' })).status).toBe(200);
    const events = await t.deps.db.select().from(schema.webhookEvents).orderBy(schema.webhookEvents.externalEventId);
    expect(events.map((e) => e.error)).toEqual(['ignored order.paid', 'unknown payment link plink_unknown']);
  });
});

describe('webhooks: whatsapp', () => {
  const sign = (raw: string) => `sha256=${createHmac('sha256', t.deps.config.WHATSAPP_WEBHOOK_SECRET).update(raw).digest('hex')}`;
  const post = (event: object, signature?: string) => {
    const raw = JSON.stringify(event);
    return t.call('POST', '/webhooks/whatsapp', { body: raw, headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature ?? sign(raw) } });
  };
  const statusEvent = (id: string, status: string, timestamp = '1790000000') => ({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba', changes: [{ field: 'messages', value: { statuses: [{ id, status, timestamp, recipient_id: '919800000001' }] } }] }],
  });

  it('moves a sent document through delivered and read, never backwards, and checks the signature', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const sent = await t.post(`${m.c}/documents/${inv.id}/send`, { channel: 'whatsapp', attachPdf: false }, { token: m.token });
    const [row] = await t.deps.db.select().from(schema.messageDeliveries).where(eq(schema.messageDeliveries.id, sent.body.messageId));
    const wamid = row.providerMessageId!;

    expect((await post(statusEvent(wamid, 'read'), 'sha256=bad')).status).toBe(401);
    expect((await post(statusEvent(wamid, 'delivered'))).status).toBe(200);
    let [now] = await t.deps.db.select().from(schema.messageDeliveries).where(eq(schema.messageDeliveries.id, row.id));
    expect(now.status).toBe('delivered');
    expect(now.deliveredAt).toEqual(new Date(1790000000 * 1000));

    await post(statusEvent(wamid, 'read', '1790000100'));
    await post(statusEvent(wamid, 'delivered', '1790000200'));
    [now] = await t.deps.db.select().from(schema.messageDeliveries).where(eq(schema.messageDeliveries.id, row.id));
    expect(now).toMatchObject({ status: 'read', readAt: new Date(1790000100 * 1000) });
  });
});
