import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi, signUpOwner } from './helpers';

// Low limits, so the limiter itself is what these tests reach.
const t = setupApi({ RATE_LIMIT_PER_MINUTE: '20', AUTH_RATE_LIMIT_PER_MINUTE: '1000' });

const userRow = async (email: string) => (await t.deps.db.select().from(schema.users).where(eq(schema.users.email, email)))[0];

describe('rate limit key', () => {
  it('counts a made-up Authorization header against the IP, not a fresh bucket', async () => {
    let limited = 0;
    for (let i = 0; i < 25; i++) {
      const res = await t.get('/plans', { headers: { authorization: `Bearer forged.${i}.${Math.random()}` }, unchecked: true });
      if (res.status === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
  });

  it('ignores X-Forwarded-For entries the client wrote, before the one the proxy added', async () => {
    let limited = 0;
    for (let i = 0; i < 25; i++) {
      // The proxy appends the address it saw (198.51.100.7); everything before it came from the client.
      const res = await t.get('/plans', { headers: { 'x-forwarded-for': `10.0.0.${i}, 203.0.113.${i}, 198.51.100.7` }, unchecked: true });
      if (res.status === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
  });
});

describe('sign-in lockout', () => {
  const bad = (email: string) => t.post('/auth/sign-in', { email, password: 'wrong wrong wrong' });

  it('locks after five wrong passwords, even for the right one, and says when to retry', async () => {
    const owner = await signUpOwner(t);
    t.setNow('2026-11-02T10:00:00Z');
    for (let i = 0; i < 4; i++) expect((await bad(owner.email)).body.code).toBe('INVALID_CREDENTIALS');
    const fifth = await bad(owner.email);
    expect(fifth.status).toBe(429);
    expect(fifth.body.code).toBe('ACCOUNT_LOCKED');
    expect(fifth.headers['retry-after']).toBe('900');

    const right = await t.post('/auth/sign-in', { email: owner.email, password: owner.password });
    expect(right.status).toBe(429);
    expect(right.body.code).toBe('ACCOUNT_LOCKED');

    // Fifteen minutes later the right password works and clears the count.
    t.setNow('2026-11-02T10:15:01Z');
    expect((await t.post('/auth/sign-in', { email: owner.email, password: owner.password })).status).toBe(200);
    expect(await userRow(owner.email)).toMatchObject({ failedSignInCount: 0, lockedUntil: null });
  });

  it('doubles the lock each time, up to a day', async () => {
    const owner = await signUpOwner(t);
    let now = new Date('2026-11-02T10:00:00Z').getTime();
    const minutes: number[] = [];
    for (let round = 0; round < 9; round++) {
      for (let i = 0; i < 5; i++) {
        t.setNow(new Date(now).toISOString());
        await bad(owner.email);
      }
      const { lockedUntil } = await userRow(owner.email);
      minutes.push(Math.round((lockedUntil!.getTime() - now) / 60_000));
      now = lockedUntil!.getTime() + 1000;
    }
    expect(minutes).toEqual([15, 30, 60, 120, 240, 480, 960, 1440, 1440]);
  });

  it('a password reset unlocks the account', async () => {
    const owner = await signUpOwner(t);
    t.setNow('2026-11-02T10:00:00Z');
    for (let i = 0; i < 5; i++) await bad(owner.email);
    expect((await t.post('/auth/password/forgot', { email: owner.email })).status).toBe(202);
    const token = /token=([\w-]+)/.exec(t.providers.outbox.last('email', owner.email)!.text)![1];
    expect((await t.post('/auth/password/reset', { token, password: 'a brand new password' })).status).toBe(204);
    expect((await t.post('/auth/sign-in', { email: owner.email, password: 'a brand new password' })).status).toBe(200);
  });

  it('answers an unknown email exactly like a wrong password, and never locks it', async () => {
    for (let i = 0; i < 7; i++) {
      const res = await bad('nobody@example.com');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    }
  });
});

describe('races', () => {
  it('parallel OTP guesses cannot exceed five attempts', async () => {
    const req = await t.post('/auth/otp/request', { phone: '+919400000001' });
    const code = t.providers.outbox.last('sms', '+919400000001')!.text.slice(0, 6);
    const wrong = code === '000000' ? '111111' : '000000';
    await Promise.all(Array.from({ length: 12 }, () => t.post('/auth/otp/verify', { requestId: req.body.requestId, code: wrong })));
    const [otp] = await t.deps.db.select().from(schema.otpRequests).where(eq(schema.otpRequests.id, req.body.requestId));
    expect(otp.attempts).toBe(5);
    expect((await t.post('/auth/otp/verify', { requestId: req.body.requestId, code })).body.code).toBe('OTP_LOCKED');
  });

  it('a reset link used twice at once resets the password once', async () => {
    const owner = await signUpOwner(t);
    await t.post('/auth/password/forgot', { email: owner.email });
    const token = /token=([\w-]+)/.exec(t.providers.outbox.last('email', owner.email)!.text)![1];
    const results = await Promise.all([
      t.post('/auth/password/reset', { token, password: 'first new password' }),
      t.post('/auth/password/reset', { token, password: 'second new password' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 400]);
  });
});

describe('terms consent', () => {
  it('records the version agreed to at sign-up, and when', async () => {
    const res = await t.post('/auth/sign-up', { name: 'Asha', email: 'asha@example.com', password: 'long enough pw', termsVersion: '2026-11-02' });
    expect(res.status).toBe(201);
    expect(await userRow('asha@example.com')).toMatchObject({ termsVersion: '2026-11-02', termsAcceptedAt: expect.any(Date) });
    // Older app builds don't send it: sign-up still works and nothing is recorded.
    await t.post('/auth/sign-up', { name: 'Old', email: 'old@example.com', password: 'long enough pw' });
    expect(await userRow('old@example.com')).toMatchObject({ termsVersion: null, termsAcceptedAt: null });
  });
});
