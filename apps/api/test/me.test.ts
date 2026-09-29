import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { ownerWithCompany, setupApi, signUpOwner } from './helpers';

const t = setupApi();

describe('me', () => {
  it('updates the profile, and refuses a phone number someone else has', async () => {
    const other = await signUpOwner(t, { phone: '+919800000001' });
    const { token } = await ownerWithCompany(t);
    const res = await t.patch('/me', { name: 'Priya S.', avatarColor: '#34C88A', locale: 'ta', phone: '+919800000002' }, { token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Priya S.', avatarColor: '#34C88A', phone: '+919800000002' });
    const [row] = await t.deps.db.select().from(schema.users).where(eq(schema.users.id, res.body.id));
    expect(row.locale).toBe('ta');
    expect(row.version).toBe(2);

    const taken = await t.patch('/me', { phone: '+919800000001' }, { token });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('PHONE_TAKEN');
    const badColour = await t.patch('/me', { avatarColor: 'blue' }, { token });
    expect(badColour.status).toBe(422);
    void other;
  });

  it('completes onboarding for the companies that lack it', async () => {
    const lonely = await signUpOwner(t);
    const none = await t.post('/me/onboarding/complete', {}, { token: lonely.token });
    expect(none.status).toBe(409);

    const { token } = await ownerWithCompany(t);
    expect((await t.get('/me', { token })).body.onboardingComplete).toBe(false);
    t.setNow('2026-09-01T10:00:00Z');
    expect((await t.post('/me/onboarding/complete', {}, { token })).status).toBe(204);
    expect((await t.get('/me', { token })).body.onboardingComplete).toBe(true);

    // A second call leaves the first timestamp alone.
    t.setNow('2026-09-05T10:00:00Z');
    await t.post('/me/onboarding/complete', {}, { token });
    const [c] = await t.deps.db.select().from(schema.companies);
    expect(c.onboardingCompletedAt?.toISOString()).toBe('2026-09-01T10:00:00.000Z');
  });

  it('lists devices, marks the current one, and revokes only your own', async () => {
    const owner = await signUpOwner(t);
    const phone = await t.post('/auth/sign-in', { email: owner.email, password: owner.password, device: { label: "Priya's iPhone", platform: 'ios 19.0' } });
    const other = await signUpOwner(t);

    const list = await t.get('/me/devices', { token: phone.body.accessToken });
    expect(list.body.data).toHaveLength(2);
    const current = list.body.data.find((d: { current: boolean }) => d.current);
    expect(current).toMatchObject({ label: "Priya's iPhone", platform: 'ios 19.0' });
    const signUpDevice = list.body.data.find((d: { current: boolean }) => !d.current);

    const foreign = await t.del(`/me/devices/${signUpDevice.id}`, { token: other.token });
    expect(foreign.status).toBe(404);

    expect((await t.del(`/me/devices/${signUpDevice.id}`, { token: phone.body.accessToken })).status).toBe(204);
    const after = await t.get('/me/devices', { token: phone.body.accessToken });
    expect(after.body.data.map((d: { id: string }) => d.id)).toEqual([current.id]);
    // The revoked session's token no longer works, and its refresh token is dead.
    expect((await t.get('/me', { token: owner.token })).status).toBe(401);
    expect((await t.post('/auth/refresh', { refreshToken: owner.refreshToken })).status).toBe(401);
    expect((await t.del(`/me/devices/${signUpDevice.id}`, { token: phone.body.accessToken })).status).toBe(404);
  });

  it('registers and unregisters push tokens', async () => {
    const a = await signUpOwner(t);
    const b = await signUpOwner(t);
    const token = 'ExponentPushToken[abc123]';
    expect((await t.post('/me/push-tokens', { token, provider: 'expo' }, { token: a.token })).status).toBe(204);
    let [row] = await t.deps.db.select().from(schema.pushTokens).where(eq(schema.pushTokens.token, token));
    expect(row).toMatchObject({ userId: a.user.id, provider: 'expo' });

    // The phone changed hands: the token follows the new user.
    await t.post('/me/push-tokens', { token, provider: 'expo' }, { token: b.token });
    [row] = await t.deps.db.select().from(schema.pushTokens).where(eq(schema.pushTokens.token, token));
    expect(row.userId).toBe(b.user.id);

    // Someone else's token is not theirs to remove.
    await t.del(`/me/push-tokens/${encodeURIComponent(token)}`, { token: a.token });
    expect(await t.deps.db.select().from(schema.pushTokens)).toHaveLength(1);
    expect((await t.del(`/me/push-tokens/${encodeURIComponent(token)}`, { token: b.token })).status).toBe(204);
    expect(await t.deps.db.select().from(schema.pushTokens)).toHaveLength(0);
  });
});
