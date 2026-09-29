import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { ownerWithCompany, setupApi } from './helpers';
import { razorpay } from './money-fixtures';

const t = setupApi();

const charged = (subscriptionId: string, notes: Record<string, string>) => ({
  entity: 'event',
  event: 'subscription.charged',
  payload: { subscription: { entity: { id: subscriptionId, status: 'active', current_start: 1790000000, current_end: 1792592000, notes } } },
});

describe('billing', () => {
  it('lists the plan catalogue without signing in', async () => {
    const res = await t.get('/plans');
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { key: string }) => p.key)).toEqual(['free', 'basic', 'pro', 'business']);
    expect(res.body.data[2]).toMatchObject({ key: 'pro', name: 'Smart Pro', monthly: 899, yearly: 8990, popular: true });
    expect(res.body.data[2].modules).toEqual(expect.arrayContaining(['purchases', 'inventory', 'payables']));
    expect(res.body.data[0].modules).toEqual([]);
  });

  it('upgrades only when the charge webhook arrives, then schedules and completes a cancellation', async () => {
    const o = await ownerWithCompany(t);
    const before = await t.get(`${o.c}/subscription`, { token: o.token });
    expect(before.body).toEqual({ companyId: o.company.id, plan: 'free', status: 'none', cancelAtPeriodEnd: false });

    const checkout = await t.post(`${o.c}/subscription/checkout`, { plan: 'pro', cycle: 'monthly' }, { token: o.token });
    expect(checkout.status).toBe(200);
    expect(checkout.body).toMatchObject({ provider: 'razorpay', keyId: 'rzp_test_simulator' });
    expect(checkout.body.checkoutUrl).toBe(`http://localhost:4000/checkout/${checkout.body.subscriptionId}`);
    // Nothing changes until Razorpay confirms the charge.
    expect((await t.get(`${o.c}`, { token: o.token })).body.plan).toBe('free');

    const hook = await razorpay(t, charged(checkout.body.subscriptionId, { companyId: o.company.id!, plan: 'pro', cycle: 'monthly' }), { eventId: 'evt_charge_1' });
    expect(hook.status).toBe(200);
    expect((await t.get(`${o.c}`, { token: o.token })).body.plan).toBe('pro');
    const sub = await t.get(`${o.c}/subscription`, { token: o.token });
    expect(sub.body).toMatchObject({ plan: 'pro', cycle: 'monthly', status: 'active', provider: 'razorpay', cancelAtPeriodEnd: false, currentPeriodEnd: new Date(1792592000 * 1000).toISOString() });
    // The purchases module is open now.
    expect((await t.get(`${o.c}/payables`, { token: o.token })).status).toBe(200);

    const again = await t.post(`${o.c}/subscription/checkout`, { plan: 'pro', cycle: 'monthly' }, { token: o.token });
    expect(again.status).toBe(409);

    const cancel = await t.post(`${o.c}/subscription/cancel`, {}, { token: o.token });
    expect(cancel.body).toMatchObject({ plan: 'pro', status: 'active', cancelAtPeriodEnd: true });

    await razorpay(t, { event: 'subscription.cancelled', payload: { subscription: { entity: { id: checkout.body.subscriptionId, status: 'cancelled' } } } }, { eventId: 'evt_cancel_1' });
    expect((await t.get(`${o.c}`, { token: o.token })).body.plan).toBe('free');
    expect((await t.get(`${o.c}/subscription`, { token: o.token })).body.status).toBe('cancelled');

    const events = await t.deps.db.select().from(schema.subscriptionEvents).where(eq(schema.subscriptionEvents.companyId, o.company.id!)).orderBy(schema.subscriptionEvents.createdAt);
    expect(events.map((e) => `${e.event}:${e.fromPlan}->${e.toPlan}`)).toEqual([
      'checkout.started:free->pro',
      'subscription.charged:free->pro',
      'cancel.requested:pro->free',
      'subscription.cancelled:pro->free',
    ]);
    const audit = await t.deps.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityType, 'company'));
    expect(audit.map((a) => [a.action, a.actorName])).toEqual(expect.arrayContaining([['plan changed to pro', 'Razorpay']]));
  });

  it('refuses checkout for non-owners and cancelling with nothing to cancel', async () => {
    const o = await ownerWithCompany(t);
    expect((await t.post(`${o.c}/subscription/cancel`, {}, { token: o.token })).status).toBe(409);
    expect((await t.post(`${o.c}/subscription/checkout`, { plan: 'free', cycle: 'monthly' }, { token: o.token })).status).toBe(422);
    await t.deps.db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, o.user.id!));
    const res = await t.post(`${o.c}/subscription/checkout`, { plan: 'pro', cycle: 'yearly' }, { token: o.token });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROLE_FORBIDDEN');
  });
});
