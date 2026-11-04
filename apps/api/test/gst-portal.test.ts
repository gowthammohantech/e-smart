import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { portalContext } from '../src/modules/gst/portal';
import { ReturnsSimulator } from '../src/providers/returns';
import { setupApi } from './helpers';
import { moneySetup, type Money } from './money-fixtures';

const t = setupApi();
beforeEach(() => t.setNow('2026-09-29T10:00:00Z'));

const GSTIN = '27AABCV1234F1ZO';
const sim = () => t.deps.providers.returns as ReturnsSimulator;

async function registered() {
  const m = await moneySetup(t);
  await t.deps.db.update(schema.companies).set({ taxIdentifier: GSTIN, taxRegistered: true }).where(eq(schema.companies.id, m.companyId));
  return m;
}
const connect = async (m: Money) => {
  expect((await t.post(`${m.c}/gst/portal-sessions/otp`, { gstin: GSTIN, username: 'vertex_traders' }, { token: m.token })).status).toBe(202);
  return t.post(`${m.c}/gst/portal-sessions`, { gstin: GSTIN, otp: ReturnsSimulator.OTP }, { token: m.token });
};

describe('GST portal session', () => {
  it('lists the business’s GSTINs, connects one with the OTP, and keeps the token encrypted', async () => {
    const m = await registered();
    const before = await t.get(`${m.c}/gst/portal-sessions`, { token: m.token });
    expect(before.body.data).toEqual([{ gstin: GSTIN, connected: false }]);

    const res = await connect(m);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ gstin: GSTIN, username: 'vertex_traders', connected: true, expiresAt: '2026-09-29T16:00:00.000Z' });
    const [row] = await t.deps.db.select().from(schema.gstPortalSessions).where(eq(schema.gstPortalSessions.companyId, m.companyId));
    expect(row.authTokenEncrypted!.toString('utf8')).not.toContain('sim-');
  });

  it('refuses a wrong OTP, an OTP before asking, another business’s GSTIN, and OTPs too close together', async () => {
    const m = await registered();
    const early = await t.post(`${m.c}/gst/portal-sessions`, { gstin: GSTIN, otp: '111111' }, { token: m.token });
    expect(early.body.code).toBe('GST_PORTAL_OTP_FIRST');
    const foreign = await t.post(`${m.c}/gst/portal-sessions/otp`, { gstin: '29AACFA9876P1ZH', username: 'x' }, { token: m.token });
    expect(foreign.status).toBe(422);
    await t.post(`${m.c}/gst/portal-sessions/otp`, { gstin: GSTIN, username: 'vertex_traders' }, { token: m.token });
    const again = await t.post(`${m.c}/gst/portal-sessions/otp`, { gstin: GSTIN, username: 'vertex_traders' }, { token: m.token });
    expect(again.status).toBe(429);
    const wrong = await t.post(`${m.c}/gst/portal-sessions`, { gstin: GSTIN, otp: '111111' }, { token: m.token });
    expect(wrong.status).toBe(422);
    expect(wrong.body).toMatchObject({ code: 'GST_PORTAL_REFUSED', portalCodes: ['AUTH4033'] });
  });

  it('refreshes a session past its six hours, and asks for a new OTP once the refresh window ends', async () => {
    const m = await registered();
    await connect(m);
    t.setNow('2026-09-29T17:00:00Z');
    const company = (await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.companyId)))[0];
    const ctx = await portalContext(t.deps.db, t.deps, company, GSTIN);
    expect(ctx.session.expiresAt.getTime()).toBeGreaterThan(Date.parse('2026-09-29T17:00:00Z'));
    expect(sim().calls.map((c) => c.op)).toContain('refresh');

    await t.deps.db.update(schema.gstPortalSessions).set({ refreshableUntil: new Date('2026-09-29T16:59:00Z') }).where(and(eq(schema.gstPortalSessions.companyId, m.companyId), eq(schema.gstPortalSessions.gstin, GSTIN)));
    await expect(portalContext(t.deps.db, t.deps, company, GSTIN)).rejects.toMatchObject({ code: 'GST_PORTAL_SESSION_EXPIRED' });
  });
});

describe('GST returns tracker', () => {
  it('lists returns recorded here and, when connected, those the portal knows were filed elsewhere', async () => {
    const m = await registered();
    const unconnected = await t.get(`${m.c}/gst/returns`, { token: m.token, query: { fy: '2026-27' } });
    expect(unconnected.body).toEqual({ data: [], portal: false });

    await connect(m);
    sim().filed.set(`${GSTIN}|gstr1|082026`, { arn: 'AA270826000001', filedOn: '2026-09-11' });
    const res = await t.get(`${m.c}/gst/returns`, { token: m.token, query: { fy: '2026-27' } });
    expect(res.body.portal).toBe(true);
    expect(res.body.data).toEqual([{ gstin: GSTIN, returnType: 'gstr1', period: '082026', status: 'filed', arn: 'AA270826000001', filedOn: '2026-09-11' }]);

    expect((await t.del(`${m.c}/gst/portal-sessions/${GSTIN}`, { token: m.token })).status).toBe(204);
    expect((await t.get(`${m.c}/gst/portal-sessions`, { token: m.token })).body.data[0].connected).toBe(false);
  });
});
