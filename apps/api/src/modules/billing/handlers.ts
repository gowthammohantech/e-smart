import { asc, eq } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { conflict, invalid } from '../../http/errors';
import { recordChange } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { compact, iso } from '../../lib/wire';

type SubscriptionRow = typeof schema.subscriptions.$inferSelect;
const S = schema.subscriptions;

/** The company's subscription; a company that never subscribed reads as its plan with status `none`. */
export function subscriptionToWire(companyId: string, plan: Schema<'PlanTier'>, row: SubscriptionRow | undefined): Schema<'Subscription'> {
  if (!row) return { companyId, plan, status: 'none', cancelAtPeriodEnd: false };
  return compact({
    companyId,
    plan: row.plan,
    cycle: row.cycle,
    status: row.status,
    currentPeriodEnd: iso(row.currentPeriodEnd),
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    provider: row.provider,
  });
}

/**
 * Billing: listPlans, getSubscription, startCheckout, cancelSubscription.
 * A plan only ever changes when the payments provider confirms it through
 * the webhook (`razorpayWebhook`); these handlers start and stop that.
 */
export const billingHandlers = defineHandlers({
  async listPlans(ctx) {
    const [plans, modules] = await Promise.all([
      ctx.db.select().from(schema.plans).orderBy(asc(schema.plans.sortOrder)),
      ctx.db.select().from(schema.planModules),
    ]);
    return {
      data: plans.map((p) =>
        compact({
          key: p.key,
          name: p.name,
          monthly: p.monthlyPriceMinor / 100,
          yearly: p.yearlyPriceMinor / 100,
          features: p.features as string[],
          modules: modules.filter((m) => m.plan === p.key).map((m) => m.module),
          popular: p.popular,
        }),
      ),
    };
  },

  async getSubscription(ctx) {
    const [row] = await ctx.db.select().from(S).where(eq(S.companyId, ctx.company.id));
    return subscriptionToWire(ctx.company.id, ctx.company.plan, row);
  },

  async startCheckout(ctx) {
    const { plan, cycle } = ctx.body;
    if (plan === 'free') throw invalid('plan', 'Free needs no checkout; cancel the subscription instead');
    const [info] = await ctx.db.select().from(schema.plans).where(eq(schema.plans.key, plan));
    if (!info) throw invalid('plan', `Unknown plan ${plan}`);
    const [current] = await ctx.db.select().from(S).where(eq(S.companyId, ctx.company.id));
    if (current?.status === 'active' && current.plan === plan && current.cycle === cycle && !current.cancelAtPeriodEnd) {
      throw conflict('ALREADY_SUBSCRIBED', `The company is already on ${info.name} (${cycle})`);
    }
    const checkout = await ctx.deps.providers.payments.createSubscriptionCheckout({
      companyId: ctx.company.id,
      plan,
      planName: info.name,
      cycle,
      amountMinor: cycle === 'yearly' ? info.yearlyPriceMinor : info.monthlyPriceMinor,
      currency: info.currency.trim(),
      customer: { name: ctx.company.name, email: ctx.company.email ?? ctx.user.email },
    });
    await ctx.db.transaction(async (tx) => {
      // A company with no live subscription remembers the checkout, so the webhook can find it.
      if (!current || current.status !== 'active') {
        const values = { plan: ctx.company.plan, cycle, status: current?.status ?? ('none' as const), provider: 'razorpay' as const, providerSubscriptionId: checkout.subscriptionId, providerCustomerId: checkout.customerId ?? null, updatedAt: ctx.now };
        const [row] = await tx
          .insert(S)
          .values({ companyId: ctx.company.id, ...values })
          .onConflictDoUpdate({ target: S.companyId, set: { ...values, version: (current?.version ?? 0) + 1 } })
          .returning();
        await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'checkout started', entityType: 'subscription', entityId: ctx.company.id, entityLabel: info.name, version: row.version });
      }
      await tx.insert(schema.subscriptionEvents).values({ id: newId('sev'), companyId: ctx.company.id, fromPlan: ctx.company.plan, toPlan: plan, event: 'checkout.started' });
    });
    return { provider: 'razorpay' as const, subscriptionId: checkout.subscriptionId, checkoutUrl: checkout.checkoutUrl, keyId: ctx.deps.providers.payments.keyId };
  },

  async cancelSubscription(ctx) {
    const [current] = await ctx.db.select().from(S).where(eq(S.companyId, ctx.company.id));
    if (!current || current.status !== 'active' || !current.providerSubscriptionId) throw conflict('NO_ACTIVE_SUBSCRIPTION', 'There is no active subscription to cancel');
    if (current.cancelAtPeriodEnd) return subscriptionToWire(ctx.company.id, ctx.company.plan, current);
    await ctx.deps.providers.payments.cancelSubscription(current.providerSubscriptionId, { atPeriodEnd: true });
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx.update(S).set({ cancelAtPeriodEnd: true, version: current.version + 1, updatedAt: ctx.now }).where(eq(S.companyId, ctx.company.id)).returning();
      await tx.insert(schema.subscriptionEvents).values({ id: newId('sev'), companyId: ctx.company.id, fromPlan: current.plan, toPlan: 'free', event: 'cancel.requested' });
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'cancellation scheduled', entityType: 'subscription', entityId: ctx.company.id, entityLabel: current.plan, version: updated.version });
      return updated;
    });
    return subscriptionToWire(ctx.company.id, ctx.company.plan, row);
  },
});
