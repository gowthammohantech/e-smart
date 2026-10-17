import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { ownerWithCompany, setupApi } from './helpers';

/**
 * Every way into the app, against the rules:
 *  - sign-up takes name, email, password; the phone is optional and is NOT verified unless proven by OTP
 *  - many accounts may list one number; only the one that verified it signs in with it
 *  - email + password works for everyone, verified phone or not
 */
const t = setupApi();
const PW = 'long enough pw';

// The clock moves on a little for every code so the resend throttle never gets in the way.
let tick = 0;
const advance = (seconds = 40) => t.setNow(new Date(Date.now() + ++tick * seconds * 1000).toISOString());

async function requestCode(phone: string) {
  advance();
  const req = await t.post('/auth/otp/request', { phone });
  expect(req.status).toBe(200);
  return { requestId: req.body.requestId as string, code: t.providers.outbox.last('sms', phone)!.text.slice(0, 6) };
}

/** Request a code and enter it correctly. */
async function otpLogin(phone: string) {
  const { requestId, code } = await requestCode(phone);
  const res = await t.post('/auth/otp/verify', { requestId, code });
  return { requestId, res };
}

const signUp = (email: string, extra: Record<string, unknown> = {}) => t.post('/auth/sign-up', { name: 'Person', email, password: PW, ...extra });
const userByEmail = async (email: string) => (await t.deps.db.select().from(schema.users).where(eq(schema.users.email, email)))[0];

/** Sign up through the "sign in with a mobile number" path: OTP first, then the sign-up form. */
async function otpSignUp(email: string, phone: string) {
  const { requestId, res } = await otpLogin(phone);
  expect(res.body.code).toBe('PHONE_NOT_REGISTERED');
  return signUp(email, { phone, phoneVerificationId: requestId });
}

describe('sign-up (email + password)', () => {
  it('creates an account without a phone', async () => {
    const res = await signUp('plain@example.com');
    expect(res.status).toBe(201);
    expect(res.body.user.phone).toBeUndefined();
    expect((await userByEmail('plain@example.com')).phoneVerifiedAt).toBeNull();
  });

  it('keeps any typed phone as unverified, without checking it', async () => {
    const res = await signUp('typed@example.com', { phone: '+919000011111' });
    expect(res.status).toBe(201);
    expect(res.body.user.phone).toBe('+919000011111');
    expect((await userByEmail('typed@example.com')).phoneVerifiedAt).toBeNull();
  });

  it('refuses a taken email whatever its case, and a short password', async () => {
    await signUp('dup@example.com');
    const dup = await signUp('DUP@Example.com');
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('EMAIL_TAKEN');
    expect((await signUp('short@example.com', { password: 'short' })).status).toBe(422);
  });

  it('lets many people list the same number', async () => {
    const results = await Promise.all(['one', 'two', 'three'].map((n) => signUp(`${n}@example.com`, { phone: '+919000022222' })));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
  });
});

describe('sign-in with email + password', () => {
  it('works with no phone, an unverified phone and a verified phone', async () => {
    await signUp('nophone@example.com');
    await signUp('unverified@example.com', { phone: '+919000033333' });
    expect((await otpSignUp('verified@example.com', '+919000033334')).status).toBe(201);
    for (const email of ['nophone@example.com', 'unverified@example.com', 'verified@example.com']) {
      expect((await t.post('/auth/sign-in', { email, password: PW })).status).toBe(200);
    }
    expect((await t.post('/auth/sign-in', { email: 'UNVERIFIED@example.com', password: PW })).status).toBe(200);
  });

  it('answers a wrong password and an unknown email the same way', async () => {
    await signUp('real@example.com');
    const wrong = await t.post('/auth/sign-in', { email: 'real@example.com', password: 'not the password' });
    const unknown = await t.post('/auth/sign-in', { email: 'nobody@example.com', password: PW });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('never signs in with a phone number in the email field', async () => {
    await signUp('mobileonly@example.com', { phone: '+919000044444' });
    expect((await t.post('/auth/sign-in', { email: '+919000044444', password: PW })).status).not.toBe(200);
  });

  it('refuses a disabled user', async () => {
    await signUp('off@example.com');
    await t.deps.db.update(schema.users).set({ status: 'disabled' }).where(eq(schema.users.email, 'off@example.com'));
    const res = await t.post('/auth/sign-in', { email: 'off@example.com', password: PW });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('USER_DISABLED');
  });
});

describe('sign-in with a mobile number (OTP)', () => {
  it('lets the verified owner in', async () => {
    expect((await otpSignUp('owner@example.com', '+919100000001')).status).toBe(201);
    const { res } = await otpLogin('+919100000001');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('owner@example.com');
    expect(res.body.accessToken).toBeTruthy();
    expect((await t.get('/me', { token: res.body.accessToken })).status).toBe(200);
  });

  it('does not let an unverified number sign anyone in, and does not verify it', async () => {
    await signUp('typed@example.com', { phone: '+919100000002' });
    const { res } = await otpLogin('+919100000002');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('PHONE_NOT_REGISTERED');
    expect(res.body.accessToken).toBeUndefined();
    expect((await userByEmail('typed@example.com')).phoneVerifiedAt).toBeNull();
  });

  it('treats a number nobody has as a new account to create', async () => {
    const { res } = await otpLogin('+919100000003');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('PHONE_NOT_REGISTERED');
  });

  it('the real owner of a number someone else typed signs up with it and gets their own account', async () => {
    // A typed my number as theirs without verifying it.
    await signUp('a@example.com', { phone: '+919100000004' });
    // I never get into A's account by passing the OTP for my own number.
    const mine = await otpSignUp('me@example.com', '+919100000004');
    expect(mine.status).toBe(201);
    expect(mine.body.user.email).toBe('me@example.com');
    expect((await userByEmail('me@example.com')).phoneVerifiedAt).not.toBeNull();
    // A is untouched: still unverified, still signs in by email.
    expect((await userByEmail('a@example.com')).phoneVerifiedAt).toBeNull();
    expect((await t.post('/auth/sign-in', { email: 'a@example.com', password: PW })).status).toBe(200);
    // From now on that number is mine, and only mine.
    const again = await otpLogin('+919100000004');
    expect(again.res.status).toBe(200);
    expect(again.res.body.user.email).toBe('me@example.com');
  });

  it('keeps a later typed copy of a verified number unverified and powerless', async () => {
    await otpSignUp('owner@example.com', '+919100000005');
    const copy = await signUp('copy@example.com', { phone: '+919100000005' });
    expect(copy.status).toBe(201);
    expect((await userByEmail('copy@example.com')).phoneVerifiedAt).toBeNull();
    // The number still opens the owner's account, not the copy's.
    expect((await otpLogin('+919100000005')).res.body.user.email).toBe('owner@example.com');
    expect((await t.post('/auth/sign-in', { email: 'copy@example.com', password: PW })).status).toBe(200);
  });

  it('cannot be verified by a second account, even with the OTP the owner receives', async () => {
    await otpSignUp('owner@example.com', '+919100000006');
    // Someone who holds the SIM passes the OTP; they land in the owner's account, not a new one.
    const { requestId, res } = await otpLogin('+919100000006');
    expect(res.body.user.email).toBe('owner@example.com');
    // That spent code can't be turned into a second verified account.
    const second = await signUp('second@example.com', { phone: '+919100000006', phoneVerificationId: requestId });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('PHONE_TAKEN');
    expect(await userByEmail('second@example.com')).toBeUndefined();
  });

  it('refuses a disabled owner', async () => {
    await otpSignUp('owner@example.com', '+919100000007');
    await t.deps.db.update(schema.users).set({ status: 'disabled' }).where(eq(schema.users.email, 'owner@example.com'));
    const { res } = await otpLogin('+919100000007');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('USER_DISABLED');
  });
});

describe('OTP codes', () => {
  it('rejects a wrong code, then accepts the right one, once', async () => {
    await otpSignUp('o@example.com', '+919200000001');
    const { requestId, code } = await requestCode('+919200000001');
    const wrong = await t.post('/auth/otp/verify', { requestId, code: code === '000000' ? '111111' : '000000' });
    expect(wrong.body.code).toBe('OTP_INVALID');
    expect((await t.post('/auth/otp/verify', { requestId, code })).status).toBe(200);
    expect((await t.post('/auth/otp/verify', { requestId, code })).body.code).toBe('OTP_INVALID');
  });

  it('expires after five minutes', async () => {
    const { requestId, code } = await requestCode('+919200000002');
    t.setNow(new Date(Date.now() + (tick * 40 + 6 * 60) * 1000).toISOString());
    const res = await t.post('/auth/otp/verify', { requestId, code });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  it('locks after five wrong tries, even for the right code', async () => {
    const { requestId, code } = await requestCode('+919200000003');
    const bad = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await t.post('/auth/otp/verify', { requestId, code: bad })).body.code).toBe('OTP_INVALID');
    expect((await t.post('/auth/otp/verify', { requestId, code })).body.code).toBe('OTP_LOCKED');
  });

  it('throttles resends and hourly requests', async () => {
    t.setNow(new Date().toISOString());
    expect((await t.post('/auth/otp/request', { phone: '+919200000004' })).status).toBe(200);
    expect((await t.post('/auth/otp/request', { phone: '+919200000004' })).status).toBe(429);
    for (let i = 0; i < 4; i++) {
      advance();
      expect((await t.post('/auth/otp/request', { phone: '+919200000004' })).status).toBe(200);
    }
    advance();
    expect((await t.post('/auth/otp/request', { phone: '+919200000004' })).status).toBe(429);
  });

  it('an unknown request id is invalid', async () => {
    expect((await t.post('/auth/otp/verify', { requestId: 'otp_nope', code: '123456' })).body.code).toBe('OTP_INVALID');
  });
});

describe('sign-up after proving the number', () => {
  it('marks the phone verified and signs the new owner in', async () => {
    const res = await otpSignUp('fresh@example.com', '+919300000001');
    expect(res.status).toBe(201);
    expect(res.body.user.phone).toBe('+919300000001');
    expect((await userByEmail('fresh@example.com')).phoneVerifiedAt).not.toBeNull();
    expect(res.body.onboardingComplete).toBe(false);
  });

  it('keeps the proof after a mistake on the form', async () => {
    await signUp('taken@example.com');
    const { requestId, res } = await otpLogin('+919300000002');
    expect(res.body.code).toBe('PHONE_NOT_REGISTERED');
    const clash = await signUp('taken@example.com', { phone: '+919300000002', phoneVerificationId: requestId });
    expect(clash.body.code).toBe('EMAIL_TAKEN');
    expect((await signUp('free@example.com', { phone: '+919300000002', phoneVerificationId: requestId })).status).toBe(201);
  });

  it('cannot borrow another number, an unproven code, or an old proof', async () => {
    const { requestId, res } = await otpLogin('+919300000003');
    expect(res.body.code).toBe('PHONE_NOT_REGISTERED');
    expect((await signUp('x@example.com', { phone: '+919300000099', phoneVerificationId: requestId })).status).toBe(401);
    const unproven = await requestCode('+919300000004');
    expect((await signUp('y@example.com', { phoneVerificationId: unproven.requestId })).status).toBe(401);
    expect((await signUp('z@example.com', { phoneVerificationId: 'otp_nope' })).status).toBe(401);
    // The proof lasts fifteen minutes.
    t.setNow(new Date(Date.now() + (tick * 40 + 16 * 60) * 1000).toISOString());
    expect((await signUp('late@example.com', { phone: '+919300000003', phoneVerificationId: requestId })).status).toBe(401);
  });

  it('works when the form leaves the phone out (the proven one is used)', async () => {
    const { requestId, res } = await otpLogin('+919300000005');
    expect(res.body.code).toBe('PHONE_NOT_REGISTERED');
    const created = await signUp('nophonefield@example.com', { phoneVerificationId: requestId });
    expect(created.status).toBe(201);
    expect(created.body.user.phone).toBe('+919300000005');
  });
});

describe('profile and team changes', () => {
  it('a typed new number is saved unverified and signs nobody in', async () => {
    const { token, user } = await ownerWithCompany(t);
    const res = await t.patch('/me', { phone: '+919400000001' }, { token });
    expect(res.status).toBe(200);
    expect((await t.deps.db.select().from(schema.users).where(eq(schema.users.id, user.id!)))[0].phoneVerifiedAt).toBeNull();
    expect((await otpLogin('+919400000001')).res.body.code).toBe('PHONE_NOT_REGISTERED');
  });

  it('changing a verified number drops the verification and frees the old number', async () => {
    const owner = await otpSignUp('owner@example.com', '+919400000002');
    const token = owner.body.accessToken as string;
    // Same number again keeps it verified.
    expect((await t.patch('/me', { name: 'Renamed', phone: '+919400000002' }, { token })).status).toBe(200);
    expect((await userByEmail('owner@example.com')).phoneVerifiedAt).not.toBeNull();
    // A different number does not.
    expect((await t.patch('/me', { phone: '+919400000003' }, { token })).status).toBe(200);
    expect((await userByEmail('owner@example.com')).phoneVerifiedAt).toBeNull();
    expect((await otpLogin('+919400000002')).res.body.code).toBe('PHONE_NOT_REGISTERED');
    // Someone else can now verify the old number.
    expect((await otpSignUp('next@example.com', '+919400000002')).status).toBe(201);
    // And still signs in by email with the new number on file.
    expect((await t.post('/auth/sign-in', { email: 'owner@example.com', password: PW })).status).toBe(200);
  });

  it('removing the number clears it', async () => {
    const owner = await otpSignUp('owner@example.com', '+919400000004');
    expect((await t.patch('/me', { phone: '' }, { token: owner.body.accessToken })).status).toBe(200);
    const row = await userByEmail('owner@example.com');
    expect(row.phone).toBeNull();
    expect(row.phoneVerifiedAt).toBeNull();
  });

  it('an invited member can list a number a verified owner holds, without taking it', async () => {
    await otpSignUp('holder@example.com', '+919400000005');
    const { token, company } = await ownerWithCompany(t, { plan: 'business' });
    const invited = await t.post('/users', { name: 'Arun', email: 'arun@example.com', phone: '+919400000005', role: 'sales', companyIds: [company.id] }, { token });
    expect(invited.status).toBe(201);
    expect((await userByEmail('arun@example.com')).phoneVerifiedAt).toBeNull();
    expect((await otpLogin('+919400000005')).res.body.user.email).toBe('holder@example.com');
  });

  it('an invited member typed with a number is not signed in by OTP until verified', async () => {
    const { token, company } = await ownerWithCompany(t, { plan: 'business' });
    await t.post('/users', { name: 'Arun', email: 'arun2@example.com', phone: '+919400000006', role: 'sales', companyIds: [company.id] }, { token });
    expect((await otpLogin('+919400000006')).res.body.code).toBe('PHONE_NOT_REGISTERED');
  });
});

describe('the database rule', () => {
  it('allows many unverified copies but only one verified owner of a number', async () => {
    await signUp('one@example.com', { phone: '+919500000001' });
    await signUp('two@example.com', { phone: '+919500000001' });
    await t.deps.db.update(schema.users).set({ phoneVerifiedAt: new Date() }).where(eq(schema.users.email, 'one@example.com'));
    await expect(t.deps.db.update(schema.users).set({ phoneVerifiedAt: new Date() }).where(eq(schema.users.email, 'two@example.com'))).rejects.toThrow();
  });
});

describe('sessions', () => {
  it('refreshes and signs out after either kind of sign-in', async () => {
    const viaOtp = await otpSignUp('s@example.com', '+919600000001');
    const refreshed = await t.post('/auth/refresh', { refreshToken: viaOtp.body.refreshToken });
    expect(refreshed.status).toBe(200);
    expect((await t.post('/auth/sign-out', {}, { token: refreshed.body.accessToken })).status).toBe(204);
    expect((await t.get('/me', { token: refreshed.body.accessToken })).status).toBe(401);
  });
});
