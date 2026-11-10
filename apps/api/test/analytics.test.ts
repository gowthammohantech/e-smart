import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { MemoryAnalytics } from '../src/analytics/client';
import { setupApi, signUpOwner } from './helpers';
import { invoiceBody, moneySetup } from './money-fixtures';

const t = setupApi();
const sent = () => t.providers.analytics as MemoryAnalytics;
beforeEach(() => sent().clear());

/** Anything that would identify a person, a customer or an amount, anywhere in what was sent. */
function expectNothingSensitive(values: string[]) {
  const all = JSON.stringify({ events: sent().events, groups: sent().groups });
  for (const v of values) expect(all).not.toContain(v);
}

describe('product analytics', () => {
  it('uses the in-memory stand-in without a PostHog key', () => {
    expect(sent()).toBeInstanceOf(MemoryAnalytics);
  });

  it('records sign-up, business, first invoice and payment, tied to the business, with no names, GSTINs or amounts', async () => {
    const m = await moneySetup(t);
    const created = sent().named('business_created');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ groups: { company: m.companyId }, properties: { businessType: 'wholesale', taxRegime: 'GST', stateCode: '27', branchCount: 1 } });
    expect(sent().named('signed_up')).toHaveLength(1);
    expect(sent().named('signed_up')[0]!.properties.$set).toMatchObject({ role: 'owner' });
    expect(sent().groups.find((g) => g.groupKey === m.companyId)?.properties).toMatchObject({ plan: 'free', businessType: 'wholesale' });

    const first = await t.post(`${m.c}/documents`, invoiceBody(m, { status: 'issued' }), { token: m.token });
    expect(first.status).toBe(201);
    const second = await t.post(`${m.c}/documents`, invoiceBody(m, { status: 'issued' }), { token: m.token });
    expect(second.status).toBe(201);
    const docs = sent().named('document_created');
    expect(docs.map((e) => e.properties)).toEqual([
      expect.objectContaining({ kind: 'invoice', isFirst: true, hasTds: false, template: 'standard' }),
      expect.objectContaining({ kind: 'invoice', isFirst: false }),
    ]);
    expect(docs[0]!.distinctId).toBe(m.user.id);
    expect(docs[0]!.groups).toEqual({ company: m.companyId });

    const pay = await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.mumbai.id, date: '2026-09-29', amount: { minor: 50000, currency: 'INR' }, currency: 'INR', method: 'cash', accountId: m.cash.id },
      { token: m.token },
    );
    expect(pay.status).toBe(201);
    expect(sent().named('payment_recorded')[0]!.properties).toMatchObject({ direction: 'received', mode: 'cash', fromBankLine: false });

    expectNothingSensitive([m.email, 'Vertex Traders', '27AAPFU0939F1ZV', 'Sunrise Retail', '+919800000001', '236000', '50000', first.body.number]);
  });

  it('counts the app version and web client from the request header', async () => {
    const owner = await signUpOwner(t);
    await t.post('/auth/sign-in', { email: owner.email, password: owner.password }, { headers: { 'x-app-version': 'web' } });
    expect(sent().named('signed_in').at(-1)!.properties).toMatchObject({ method: 'password', source: 'app', platform: 'web' });
  });

  it('sends nothing for someone who turned "Share usage data" off', async () => {
    const m = await moneySetup(t);
    expect((await t.get('/me/privacy-preferences', { token: m.token })).body).toEqual({ shareUsageData: true });
    const off = await t.put('/me/privacy-preferences', { shareUsageData: false }, { token: m.token });
    expect(off.body).toEqual({ shareUsageData: false });
    expect(sent().named('analytics_opted_out')).toHaveLength(1);
    expect((await t.get('/me', { token: m.token })).body.shareUsageData).toBe(false);

    sent().clear();
    expect((await t.post(`${m.c}/documents`, invoiceBody(m), { token: m.token })).status).toBe(201);
    await t.post('/auth/sign-in', { email: m.email, password: m.password });
    expect(sent().events).toEqual([]);

    await t.put('/me/privacy-preferences', { shareUsageData: true }, { token: m.token });
    await t.post(`${m.c}/documents`, invoiceBody(m), { token: m.token });
    expect(sent().named('document_created')).toHaveLength(1);
  });

  it('sends nothing for the demo account or its visitors', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.accounts).set({ isDemo: true }).where(eq(schema.accounts.id, m.user.accountId!));
    sent().clear();
    const res = await t.post('/auth/sign-in', { email: m.email, password: m.password });
    expect(res.status).toBe(200);
    const me = await t.get('/me', { token: res.body.accessToken });
    expect(me.body.shareUsageData).toBe(false);
    await t.get(`${m.c}/reports/profit-and-loss`, { token: res.body.accessToken, query: { from: '2026-04-01', to: '2026-09-30' } });
    expect(sent().events).toEqual([]);
    expect(sent().groups).toEqual([]);
  });
});
