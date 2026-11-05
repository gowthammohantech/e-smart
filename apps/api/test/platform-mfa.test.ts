import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { resetMfa, setPlatformRole } from '@esmart/db/platform-admin';
import { totpCode, totpStep, verifyTotp } from '../src/lib/totp';
import { setupApi, signUpOwner } from './helpers';

const t = setupApi();

const PASSWORD = 'correct horse battery';

/** An operator by role only: no authenticator yet. */
async function bareOperator() {
  const op = await signUpOwner(t, { password: PASSWORD });
  await t.deps.db.update(schema.users).set({ platformRole: 'superadmin' }).where(eq(schema.users.id, op.user.id!));
  return op;
}

const codeAt = (secret: string, ms: number) => totpCode(secret, totpStep(ms));

async function enrolled() {
  const op = await bareOperator();
  const { secret } = (await t.post('/admin/mfa/enrollment', {}, { token: op.token })).body;
  const confirmed = await t.post('/admin/mfa/enrollment/confirm', { code: codeAt(secret, Date.now()) }, { token: op.token });
  return { ...op, secret: secret as string, recoveryCodes: confirmed.body.recoveryCodes as string[] };
}

const signIn = async (email: string) => (await t.post('/auth/sign-in', { email, password: PASSWORD })).body.accessToken as string;

describe('TOTP', () => {
  it('matches the RFC 6238 test vector', () => {
    // "12345678901234567890" in base32; at 59 s the 8-digit SHA-1 code is 94287082.
    expect(totpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', totpStep(59_000))).toBe('287082');
  });

  it('allows one step of drift and refuses a used step', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const now = 1_800_000_000_000;
    expect(verifyTotp(secret, codeAt(secret, now - 30_000), now, null)).toBe(totpStep(now) - 1);
    expect(verifyTotp(secret, codeAt(secret, now - 90_000), now, null)).toBeNull();
    expect(verifyTotp(secret, codeAt(secret, now), now, totpStep(now))).toBeNull();
  });
});

describe('operator MFA', () => {
  it('keeps an operator without an authenticator out of every admin route but the MFA ones', async () => {
    const op = await bareOperator();
    const res = await t.get('/admin/accounts', { token: op.token });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MFA_ENROLLMENT_REQUIRED');
    expect((await t.get('/admin/mfa', { token: op.token })).body).toEqual({ enrolled: false, verified: false, recoveryCodesLeft: 0 });
  });

  it('refuses the MFA routes to tenant users', async () => {
    const tenant = await signUpOwner(t);
    expect((await t.post('/admin/mfa/enrollment', {}, { token: tenant.token })).body.code).toBe('PLATFORM_FORBIDDEN');
  });

  it('enrolls with a code from the app, then opens the admin routes for this session', async () => {
    const op = await bareOperator();
    const start = await t.post('/admin/mfa/enrollment', {}, { token: op.token });
    expect(start.body.otpauthUri).toContain(`secret=${start.body.secret}`);
    const wrong = await t.post('/admin/mfa/enrollment/confirm', { code: '000000' }, { token: op.token });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('MFA_CODE_INVALID');

    const ok = await t.post('/admin/mfa/enrollment/confirm', { code: codeAt(start.body.secret, Date.now()) }, { token: op.token });
    expect(ok.status).toBe(200);
    expect(ok.body.recoveryCodes).toHaveLength(10);
    expect((await t.get('/admin/accounts', { token: op.token })).status).toBe(200);
    // Set up once: starting again is refused.
    expect((await t.post('/admin/mfa/enrollment', {}, { token: op.token })).body.code).toBe('MFA_ALREADY_ENROLLED');
  });

  it('asks every new session for a code, and a code works once', async () => {
    const op = await enrolled();
    t.setNow(new Date(Date.now() + 60_000));
    const token = await signIn(op.email);
    expect((await t.get('/admin/accounts', { token })).body.code).toBe('MFA_REQUIRED');

    const code = codeAt(op.secret, t.deps.now().getTime());
    expect((await t.post('/admin/mfa/verify', { code }, { token })).status).toBe(200);
    expect((await t.get('/admin/accounts', { token })).status).toBe(200);

    // The same code on a second session is refused: it was used.
    const other = await signIn(op.email);
    expect((await t.post('/admin/mfa/verify', { code }, { token: other })).body.code).toBe('MFA_CODE_INVALID');
  });

  it('takes a recovery code once, ignoring case and spacing', async () => {
    const op = await enrolled();
    const token = await signIn(op.email);
    const typed = op.recoveryCodes[0].toUpperCase().replace(/-/g, ' ');
    const ok = await t.post('/admin/mfa/verify', { code: typed }, { token });
    expect(ok.status).toBe(200);
    expect(ok.body.recoveryCodesLeft).toBe(9);
    const again = await signIn(op.email);
    expect((await t.post('/admin/mfa/verify', { code: op.recoveryCodes[0] }, { token: again })).body.code).toBe('MFA_CODE_INVALID');
  });

  it('locks the account after five wrong codes', async () => {
    const op = await enrolled();
    const token = await signIn(op.email);
    const codes: string[] = [];
    for (let i = 0; i < 5; i++) codes.push((await t.post('/admin/mfa/verify', { code: '999999' }, { token })).body.code);
    expect(codes).toEqual(['MFA_CODE_INVALID', 'MFA_CODE_INVALID', 'MFA_CODE_INVALID', 'MFA_CODE_INVALID', 'ACCOUNT_LOCKED']);
    // Locked for passwords too.
    expect((await t.post('/auth/sign-in', { email: op.email, password: PASSWORD })).body.code).toBe('ACCOUNT_LOCKED');
  });

  it('gives operators a 12-hour session and records their sign-ins', async () => {
    const op = await enrolled();
    const before = Date.now();
    await signIn(op.email);
    const sessions = await t.deps.db.select().from(schema.deviceSessions).where(eq(schema.deviceSessions.userId, op.user.id!));
    const newest = sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    expect(newest.refreshExpiresAt.getTime() - before).toBeLessThanOrEqual(12 * 3_600_000 + 5_000);
    const events = await t.deps.db.select().from(schema.platformAuditEvents).where(eq(schema.platformAuditEvents.actorId, op.user.id!));
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(['mfa.enrolled', 'operator.signed_in']));
  });
});

describe('db:platform-admin', () => {
  it('records role grants and resets a lost authenticator, ending every session', async () => {
    const tenant = await signUpOwner(t, { password: PASSWORD });
    await setPlatformRole(process.env.TEST_DATABASE_URL!, tenant.email, 'support');
    expect((await t.get('/me', { token: tenant.token })).body.code).toBe('SESSION_REVOKED');
    const granted = await t.deps.db.select().from(schema.platformAuditEvents).where(eq(schema.platformAuditEvents.targetId, tenant.user.id!));
    expect(granted[0]).toMatchObject({ action: 'operator.role_granted', actorEmail: expect.stringMatching(/^cli:/) });

    const token = await signIn(tenant.email);
    const { secret } = (await t.post('/admin/mfa/enrollment', {}, { token })).body;
    await t.post('/admin/mfa/enrollment/confirm', { code: codeAt(secret, Date.now()) }, { token });
    await resetMfa(process.env.TEST_DATABASE_URL!, tenant.email);
    expect((await t.get('/admin/mfa', { token })).status).toBe(401);
    const fresh = await signIn(tenant.email);
    expect((await t.get('/admin/mfa', { token: fresh })).body.enrolled).toBe(false);
  });
});
