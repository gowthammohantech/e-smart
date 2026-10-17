import { createHmac } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { accountTypesFor } from '@esmart/core/domain/paymentAccounts';
import type { PaymentMethod, PlanTier } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { AuthUser, WebhookCtx, WebhookHandlers } from '../../context';
import { unauthorized } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { safeEqual, sha256 } from '../../lib/crypto';
import { newId } from '../../lib/ids';
import { today } from '../documents/lifecycle';
import { writePayment } from '../payments/engine';

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const header = (ctx: WebhookCtx, name: string) => str(ctx.req.headers[name]);

const PLANS: PlanTier[] = ['free', 'basic', 'pro', 'business'];

/**
 * Writes made on behalf of a gateway still need a user behind them (audit
 * and `created_by` reference users): the person who created the link, or the
 * account owner, named after the source so the audit trail reads true.
 */
async function actorFor(db: DbOrTx, userId: string | null | undefined, source: string): Promise<AuthUser | null> {
  if (!userId) return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) return null;
  return { id: u.id, accountId: u.accountId, name: source, email: u.email, role: u.role, platformRole: null, status: u.status, locale: u.locale, companyIds: [], branchIds: [], sessionId: '' };
}

async function ownerOf(db: DbOrTx, companyId: string, source: string): Promise<AuthUser | null> {
  const [row] = await db
    .select({ owner: schema.accounts.ownerUserId })
    .from(schema.companies)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.companies.accountId))
    .where(eq(schema.companies.id, companyId));
  return actorFor(db, row?.owner, source);
}

/**
 * Stores the event once per (source, event id) and runs `process` in the same
 * transaction. A duplicate delivery is acknowledged without running again; a
 * failure rolls the whole thing back so the sender's retry is processed.
 */
async function once(ctx: WebhookCtx, source: 'razorpay' | 'whatsapp', externalId: string, eventType: string, process: (tx: DbOrTx, eventId: string) => Promise<string | void>) {
  await ctx.db.transaction(async (tx) => {
    const id = newId('whe');
    const inserted = await tx
      .insert(schema.webhookEvents)
      .values({ id, source, externalEventId: externalId.slice(0, 200), eventType: eventType.slice(0, 60), signatureValid: true, payload: ctx.body, receivedAt: ctx.now })
      .onConflictDoNothing()
      .returning({ id: schema.webhookEvents.id });
    if (!inserted.length) return;
    const problem = await process(tx, id);
    await tx.update(schema.webhookEvents).set({ processedAt: ctx.now, error: problem ?? null }).where(eq(schema.webhookEvents.id, id));
  });
}

/** Keeps a record of a delivery that failed verification; it is never processed. */
async function rejected(ctx: WebhookCtx, source: 'razorpay' | 'whatsapp', externalId: string, eventType: string): Promise<never> {
  await ctx.db.insert(schema.webhookEvents).values({
    id: newId('whe'),
    source,
    // Suffixed so a genuine delivery of the same event id is still accepted.
    externalEventId: `${externalId.slice(0, 150)}#rejected:${newId('r')}`,
    eventType: eventType.slice(0, 60),
    signatureValid: false,
    payload: ctx.body,
    error: 'invalid signature',
    receivedAt: ctx.now,
  });
  throw unauthorized('INVALID_SIGNATURE', 'The webhook signature does not match');
}

// ------------------------------------------------------------ razorpay

function methodOf(gatewayMethod: string | undefined): PaymentMethod {
  switch (gatewayMethod) {
    case 'upi':
      return 'upi';
    case 'card':
    case 'emi':
      return 'card';
    case 'netbanking':
    case 'bank_transfer':
      return 'bank';
    case 'wallet':
      return 'wallet';
    default:
      return 'other';
  }
}

/** `payment_link.paid`: a received payment, allocated to the linked invoice up to what it still owes. */
async function paymentLinkPaid(ctx: WebhookCtx, tx: DbOrTx, payload: Json): Promise<string | void> {
  const link = obj(obj(payload.payment_link).entity);
  const pay = obj(obj(payload.payment).entity);
  const L = schema.paymentLinks;
  const linkId = str(link.id);
  if (!linkId) return 'payload has no payment_link.entity.id';
  const [pl] = await tx.select().from(L).where(eq(L.providerLinkId, linkId)).for('update');
  if (!pl) return `unknown payment link ${linkId}`;
  if (pl.paymentId) return;

  const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, pl.companyId));
  const [doc] = await tx.select().from(schema.documents).where(eq(schema.documents.id, pl.documentId));
  const actor = (await actorFor(tx, pl.createdBy, 'Razorpay')) ?? (await ownerOf(tx, pl.companyId, 'Razorpay'));
  if (!company || !doc || !actor) return 'the link no longer resolves to a document';

  const amountMinor = num(pay.amount) ?? num(link.amount_paid) ?? pl.amountMinor;
  const currency = (str(pay.currency) ?? str(link.currency) ?? pl.currency).trim();
  const createdAt = num(pay.created_at);
  const date = createdAt ? today(new Date(createdAt * 1000)) : today(ctx.now);

  // The collection lands in a bank or wallet account that fits the method, else the default one.
  let method = methodOf(str(pay.method));
  const accounts = await tx.select().from(schema.paymentAccounts).where(eq(schema.paymentAccounts.companyId, company.id));
  const fits = accounts.filter((a) => accountTypesFor(method).includes(a.type));
  let account = fits.find((a) => a.isDefault) ?? fits[0];
  if (!account) {
    method = 'other';
    account = accounts.find((a) => a.isDefault) ?? accounts[0];
  }
  if (!account) return 'the company has no payment account';

  const open = doc.kind === 'invoice' && doc.status !== 'cancelled' && doc.currency.trim() === currency;
  const allocate = open ? Math.min(amountMinor, Math.max(doc.grandTotalMinor - doc.amountPaidMinor, 0)) : 0;
  const payment = await writePayment(
    tx,
    ctx.deps,
    company,
    actor,
    {
      direction: 'received',
      partyId: doc.partyId,
      branchId: doc.branchId,
      date,
      amountMinor,
      currency,
      exchangeRate: currency === company.baseCurrency.trim() ? 1 : Number(doc.exchangeRate),
      method,
      reference: str(pay.id) ?? linkId,
      accountId: account.id,
      notes: `Paid online through payment link ${linkId}`,
      allocations: allocate > 0 ? [{ documentId: doc.id, amountMinor: allocate }] : [],
    },
    { now: ctx.now },
  );
  await tx.update(L).set({ status: 'paid', paidAt: ctx.now, paymentId: payment.id }).where(eq(L.id, pl.id));
}

/** `subscription.charged` / `.activated`: the plan the checkout asked for takes effect. */
async function subscriptionCharged(ctx: WebhookCtx, tx: DbOrTx, eventId: string, eventType: string, payload: Json): Promise<string | void> {
  const sub = obj(obj(payload.subscription).entity);
  const subId = str(sub.id);
  if (!subId) return 'payload has no subscription.entity.id';
  const notes = obj(sub.notes);
  const S = schema.subscriptions;
  const [known] = await tx.select().from(S).where(eq(S.providerSubscriptionId, subId));
  const companyId = str(notes.companyId) ?? known?.companyId;
  if (!companyId) return `unknown subscription ${subId}`;
  const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, companyId)).for('update');
  if (!company) return `unknown company ${companyId}`;
  const [current] = known?.companyId === companyId ? [known] : await tx.select().from(S).where(eq(S.companyId, companyId));
  const plan = PLANS.find((p) => p === notes.plan) ?? current?.plan;
  if (!plan) return 'the subscription does not say which plan it is for';
  const cycle = notes.cycle === 'yearly' || notes.cycle === 'monthly' ? notes.cycle : (current?.cycle ?? 'monthly');
  const at = (v: unknown) => (num(v) ? new Date(num(v)! * 1000) : null);
  const actor = await ownerOf(tx, companyId, 'Razorpay');

  const values = {
    plan,
    cycle,
    status: 'active' as const,
    provider: 'razorpay' as const,
    providerSubscriptionId: subId,
    currentPeriodStart: at(sub.current_start),
    currentPeriodEnd: at(sub.current_end),
    cancelAtPeriodEnd: false,
    updatedAt: ctx.now,
  };
  const [row] = await tx
    .insert(S)
    .values({ companyId, ...values })
    .onConflictDoUpdate({ target: S.companyId, set: { ...values, version: (current?.version ?? 0) + 1 } })
    .returning();
  await tx.insert(schema.subscriptionEvents).values({ id: newId('sev'), companyId, fromPlan: company.plan, toPlan: plan, event: eventType, webhookEventId: eventId });
  if (company.plan !== plan) {
    const [updated] = await tx.update(schema.companies).set({ plan, version: company.version + 1, updatedAt: ctx.now }).where(eq(schema.companies.id, companyId)).returning();
    if (actor) await recordChange(tx, actor, { companyId, action: `plan changed to ${plan}`, entityType: 'company', entityId: companyId, entityLabel: company.name, version: updated.version, before: { plan: company.plan }, after: { plan } });
  }
  if (actor) await recordChange(tx, actor, { companyId, action: eventType, entityType: 'subscription', entityId: companyId, entityLabel: plan, version: row.version });
}

/** `subscription.cancelled` (and `.completed`, `.halted`): back to Free; no records are lost. */
async function subscriptionEnded(ctx: WebhookCtx, tx: DbOrTx, eventId: string, eventType: string, payload: Json): Promise<string | void> {
  const sub = obj(obj(payload.subscription).entity);
  const subId = str(sub.id);
  const S = schema.subscriptions;
  const [current] = subId ? await tx.select().from(S).where(eq(S.providerSubscriptionId, subId)) : [];
  if (!current) return `unknown subscription ${subId ?? ''}`;
  const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, current.companyId)).for('update');
  if (!company) return `unknown company ${current.companyId}`;
  const actor = await ownerOf(tx, current.companyId, 'Razorpay');
  const [row] = await tx
    .update(S)
    .set({ status: eventType === 'subscription.halted' ? 'pastDue' : 'cancelled', cancelAtPeriodEnd: false, version: current.version + 1, updatedAt: ctx.now })
    .where(eq(S.companyId, current.companyId))
    .returning();
  await tx.insert(schema.subscriptionEvents).values({ id: newId('sev'), companyId: current.companyId, fromPlan: company.plan, toPlan: 'free', event: eventType, webhookEventId: eventId });
  if (company.plan !== 'free') {
    const [updated] = await tx.update(schema.companies).set({ plan: 'free', version: company.version + 1, updatedAt: ctx.now }).where(eq(schema.companies.id, company.id)).returning();
    if (actor) await recordChange(tx, actor, { companyId: company.id, action: 'plan changed to free', entityType: 'company', entityId: company.id, entityLabel: company.name, version: updated.version, before: { plan: company.plan }, after: { plan: 'free' } });
  }
  if (actor) await recordChange(tx, actor, { companyId: company.id, action: eventType, entityType: 'subscription', entityId: company.id, entityLabel: row.plan, version: row.version });
}

// ------------------------------------------------------------ whatsapp

const DELIVERY_RANK = { queued: 0, sent: 1, delivered: 2, read: 3, failed: -1 } as const;
type DeliveryStatus = keyof typeof DELIVERY_RANK;

/** Meta's `X-Hub-Signature-256: sha256=<hex HMAC of the raw body>`. */
function whatsappSignatureValid(ctx: WebhookCtx): boolean {
  const sig = header(ctx, 'x-hub-signature-256');
  const expected = `sha256=${createHmac('sha256', ctx.deps.config.WHATSAPP_WEBHOOK_SECRET).update(ctx.rawBody).digest('hex')}`;
  return !!sig && safeEqual(sig, expected);
}

/** Delivery and read receipts move a message forward (sent → delivered → read); they never move it back. */
async function applyWhatsappStatuses(ctx: WebhookCtx, tx: DbOrTx): Promise<string | void> {
  const statuses = (Array.isArray(ctx.body.entry) ? ctx.body.entry : [])
    .flatMap((e) => (Array.isArray(obj(e).changes) ? (obj(e).changes as unknown[]) : []))
    .flatMap((c) => {
      const s = obj(obj(c).value).statuses;
      return Array.isArray(s) ? s.map(obj) : [];
    });
  const M = schema.messageDeliveries;
  const ids = statuses.map((s) => str(s.id)).filter((x): x is string => !!x);
  if (!ids.length) return;
  const rows = await tx.select().from(M).where(inArray(M.providerMessageId, ids)).for('update');
  for (const s of statuses) {
    const row = rows.find((r) => r.providerMessageId === s.id);
    const status = str(s.status) as DeliveryStatus | undefined;
    if (!row || !status || !(status in DELIVERY_RANK)) continue;
    const at = num(Number(s.timestamp)) ? new Date(Number(s.timestamp) * 1000) : ctx.now;
    if (status === 'failed') {
      if (DELIVERY_RANK[row.status] >= DELIVERY_RANK.delivered) continue;
      const errors = Array.isArray(s.errors) ? s.errors.map((e) => str(obj(e).title) ?? str(obj(e).message)).filter(Boolean) : [];
      row.status = 'failed';
      await tx.update(M).set({ status: 'failed', error: errors.join('; ') || 'failed' }).where(eq(M.id, row.id));
      continue;
    }
    if (row.status !== 'failed' && DELIVERY_RANK[status] <= DELIVERY_RANK[row.status]) continue;
    row.status = status;
    await tx
      .update(M)
      .set({
        status,
        deliveredAt: status === 'delivered' || status === 'read' ? (row.deliveredAt ?? at) : row.deliveredAt,
        readAt: status === 'read' ? at : row.readAt,
      })
      .where(and(eq(M.id, row.id)));
  }
}

/** Inbound webhooks: razorpayWebhook, whatsappWebhook. */
export const webhookHandlers: WebhookHandlers = {
  async razorpayWebhook(ctx) {
    const eventType = str(ctx.body.event) ?? 'unknown';
    const externalId = header(ctx, 'x-razorpay-event-id') ?? sha256(ctx.rawBody);
    if (!ctx.deps.providers.payments.verifyWebhookSignature(ctx.rawBody, header(ctx, 'x-razorpay-signature'))) {
      await rejected(ctx, 'razorpay', externalId, eventType);
    }
    const payload = obj(ctx.body.payload);
    await once(ctx, 'razorpay', externalId, eventType, async (tx, eventId) => {
      switch (eventType) {
        case 'payment_link.paid':
          return paymentLinkPaid(ctx, tx, payload);
        case 'subscription.activated':
        case 'subscription.charged':
          return subscriptionCharged(ctx, tx, eventId, eventType, payload);
        case 'subscription.cancelled':
        case 'subscription.completed':
        case 'subscription.halted':
          return subscriptionEnded(ctx, tx, eventId, eventType, payload);
        default:
          return `ignored ${eventType}`;
      }
    });
  },

  async whatsappWebhook(ctx) {
    const externalId = sha256(ctx.rawBody);
    if (!whatsappSignatureValid(ctx)) await rejected(ctx, 'whatsapp', externalId, 'status');
    await once(ctx, 'whatsapp', externalId, 'status', (tx) => applyWhatsappStatuses(ctx, tx));
  },
};
