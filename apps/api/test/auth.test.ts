import { describe, expect, it } from 'vitest';
import { setupApi, signUpOwner } from './helpers';

const t = setupApi();

describe('auth', () => {
  it('signs up, signs in, and reads /me', async () => {
    const owner = await signUpOwner(t, { name: 'Priya Shah', email: 'Priya@Example.com' });
    expect(owner.user).toMatchObject({ name: 'Priya Shah', email: 'priya@example.com', role: 'owner', status: 'active', companyIds: [] });

    const signIn = await t.post('/auth/sign-in', { email: 'priya@example.com', password: owner.password, device: { label: 'Pixel', platform: 'android 16' } });
    expect(signIn.status).toBe(200);
    expect(signIn.body.onboardingComplete).toBe(false);

    const me = await t.get('/me', { token: signIn.body.accessToken });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ accountId: owner.user.accountId, companies: [], onboardingComplete: false });
  });

  it('refuses a duplicate email and a wrong password alike', async () => {
    const owner = await signUpOwner(t);
    const dup = await t.post('/auth/sign-up', { name: 'X', email: owner.email, password: 'another password' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('EMAIL_TAKEN');

    const wrong = await t.post('/auth/sign-in', { email: owner.email, password: 'nope nope nope' });
    const unknown = await t.post('/auth/sign-in', { email: 'nobody@example.com', password: 'nope nope nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.body.code).toBe(wrong.body.code);
  });

  it('rejects requests that break the contract before any handler runs', async () => {
    const res = await t.post('/auth/sign-up', { name: 'X', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.issues.length).toBeGreaterThan(0);
  });

  it('rotates refresh tokens and treats reuse as invalid', async () => {
    const owner = await signUpOwner(t);
    const first = await t.post('/auth/refresh', { refreshToken: owner.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(owner.refreshToken);
    const reused = await t.post('/auth/refresh', { refreshToken: owner.refreshToken });
    expect(reused.status).toBe(401);
    const second = await t.post('/auth/refresh', { refreshToken: first.body.refreshToken });
    expect(second.status).toBe(200);
  });

  it('signs out the current device only', async () => {
    const owner = await signUpOwner(t);
    const other = await t.post('/auth/sign-in', { email: owner.email, password: owner.password });
    expect((await t.post('/auth/sign-out', {}, { token: owner.token })).status).toBe(204);
    const revoked = await t.get('/me', { token: owner.token });
    expect(revoked.status).toBe(401);
    expect(revoked.body.code).toBe('SESSION_REVOKED');
    expect((await t.get('/me', { token: other.body.accessToken })).status).toBe(200);
  });

  it('signs in with a phone OTP sent over SMS', async () => {
    await signUpOwner(t, { phone: '+919876543210' });
    const req = await t.post('/auth/otp/request', { phone: '+919876543210' });
    expect(req.status).toBe(200);
    const code = t.providers.outbox.last('sms', '+919876543210')!.text.slice(0, 6);

    const bad = await t.post('/auth/otp/verify', { requestId: req.body.requestId, code: code === '000000' ? '111111' : '000000' });
    expect(bad.status).toBe(401);
    const ok = await t.post('/auth/otp/verify', { requestId: req.body.requestId, code });
    expect(ok.status).toBe(200);
    expect(ok.body.user.phone).toBe('+919876543210');
    // A code works once.
    expect((await t.post('/auth/otp/verify', { requestId: req.body.requestId, code })).status).toBe(401);
  });

  it('throttles OTP requests per number', async () => {
    await t.post('/auth/otp/request', { phone: '+919800000001' });
    const again = await t.post('/auth/otp/request', { phone: '+919800000001' });
    expect(again.status).toBe(429);
  });

  it('resets a password by email link and signs every device out', async () => {
    const owner = await signUpOwner(t);
    const unknown = await t.post('/auth/password/forgot', { email: 'ghost@example.com' });
    expect(unknown.status).toBe(202);
    expect(t.providers.outbox.last('email', 'ghost@example.com')).toBeUndefined();

    expect((await t.post('/auth/password/forgot', { email: owner.email })).status).toBe(202);
    const token = /token=([\w-]+)/.exec(t.providers.outbox.last('email', owner.email)!.text)![1];
    expect((await t.post('/auth/password/reset', { token, password: 'a brand new password' })).status).toBe(204);
    expect((await t.get('/me', { token: owner.token })).status).toBe(401);
    expect((await t.post('/auth/password/reset', { token, password: 'again and again' })).status).toBe(400);
    expect((await t.post('/auth/sign-in', { email: owner.email, password: 'a brand new password' })).status).toBe(200);
  });

  it('needs a bearer token on secured routes', async () => {
    const res = await t.get('/me');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });
});
