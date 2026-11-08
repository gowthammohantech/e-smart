import { describe, expect, it } from 'vitest';
import { totpCode, totpStep } from '../src/lib/totp';
import { setupApi, signUpOwner } from './helpers';

const t = setupApi();
const PASSWORD = 'correct horse battery';
const codeAt = (secret: string, ms: number) => totpCode(secret, totpStep(ms));
const signIn = async (email: string) => (await t.post('/auth/sign-in', { email, password: PASSWORD })).body.accessToken as string;

describe('authenticator app for business users', () => {
  it('is off until they turn it on, and then every new session passes it first', async () => {
    const owner = await signUpOwner(t, { password: PASSWORD });
    expect((await t.get('/me/mfa', { token: owner.token })).body).toEqual({ enrolled: false, verified: false, recoveryCodesLeft: 0 });
    // Off: nothing is asked.
    expect((await t.get('/me', { token: owner.token })).status).toBe(200);

    const { secret } = (await t.post('/me/mfa/enrollment', {}, { token: owner.token })).body;
    const wrong = await t.post('/me/mfa/enrollment/confirm', { code: '000000' }, { token: owner.token });
    expect(wrong.body.code).toBe('MFA_CODE_INVALID');
    const confirmed = await t.post('/me/mfa/enrollment/confirm', { code: codeAt(secret, Date.now()) }, { token: owner.token });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.recoveryCodes).toHaveLength(10);
    // The session that turned it on has passed it.
    expect((await t.get('/me', { token: owner.token })).status).toBe(200);

    // A new sign-in is held at the door until it gives a code.
    const fresh = await signIn(owner.user.email!);
    const held = await t.get('/me', { token: fresh });
    expect(held.status).toBe(403);
    expect(held.body.code).toBe('MFA_REQUIRED');
    expect((await t.get('/me/mfa', { token: fresh })).body).toMatchObject({ enrolled: true, verified: false });
    // A recovery code works once.
    const [recovery] = confirmed.body.recoveryCodes;
    expect((await t.post('/me/mfa/verify', { code: recovery }, { token: fresh })).body).toMatchObject({ verified: true, recoveryCodesLeft: 9 });
    expect((await t.get('/me', { token: fresh })).status).toBe(200);
    const again = await signIn(owner.user.email!);
    expect((await t.post('/me/mfa/verify', { code: recovery }, { token: again })).body.code).toBe('MFA_CODE_INVALID');
  });

  it('lets a session held at the prompt sign out, which really ends it', async () => {
    const owner = await signUpOwner(t, { password: PASSWORD });
    const { secret } = (await t.post('/me/mfa/enrollment', {}, { token: owner.token })).body;
    await t.post('/me/mfa/enrollment/confirm', { code: codeAt(secret, Date.now()) }, { token: owner.token });
    const held = await signIn(owner.user.email!);
    expect((await t.post('/auth/sign-out', {}, { token: held })).status).toBe(204);
    expect((await t.get('/me/mfa', { token: held })).body.code).toBe('SESSION_REVOKED');
  });

  it('turns off only with a code', async () => {
    const owner = await signUpOwner(t, { password: PASSWORD });
    const { secret } = (await t.post('/me/mfa/enrollment', {}, { token: owner.token })).body;
    const { recoveryCodes } = (await t.post('/me/mfa/enrollment/confirm', { code: codeAt(secret, Date.now()) }, { token: owner.token })).body;
    expect((await t.call('DELETE', '/me/mfa', { token: owner.token, body: { code: '123456' } })).status).toBe(400);
    expect((await t.call('DELETE', '/me/mfa', { token: owner.token, body: { code: recoveryCodes[1] } })).status).toBe(204);
    const fresh = await signIn(owner.user.email!);
    expect((await t.get('/me', { token: fresh })).status).toBe(200);
  });
});
