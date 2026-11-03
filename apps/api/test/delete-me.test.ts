import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '@esmart/db';
import { ownerWithCompany, setupApi, signUpOwner } from './helpers';
import { joinTeam } from './team-helpers';

const t = setupApi();

const userRow = async (id: string) => (await t.deps.db.select().from(schema.users).where(eq(schema.users.id, id)))[0];
const accountRow = async (id: string) => (await t.deps.db.select().from(schema.accounts).where(eq(schema.accounts.id, id)))[0];

describe('delete my account', () => {
  it('closes a one-person account: erases the person, ends every session, keeps the books locked for 8 years', async () => {
    const owner = await ownerWithCompany(t);
    const res = await t.post('/me/delete', { confirm: 'DELETE', password: owner.password }, { token: owner.token });
    expect(res.status).toBe(204);

    const row = await userRow(owner.user.id!);
    expect(row).toMatchObject({ name: 'Deleted user', phone: null, passwordHash: null, status: 'disabled' });
    expect(row.email).toMatch(/^deleted\+usr_.+@deleted\.invalid$/);
    expect((await t.get('/me', { token: owner.token })).status).toBe(401);
    expect((await t.post('/auth/sign-in', { email: owner.email, password: owner.password })).status).toBe(401);

    const account = await accountRow(owner.user.accountId!);
    expect(account.suspendedReason).toBe('owner-deleted');
    expect(account.purgeAfter!.getUTCFullYear() - new Date().getUTCFullYear()).toBe(8);
    // The invoices are still there, for the tax record.
    expect(await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, owner.company.id!))).toHaveLength(1);
    // A goodbye goes to the address they had.
    expect(t.providers.outbox.last('email', owner.email)?.text).toContain('has been deleted');
    // The email is free to sign up with again.
    expect((await t.post('/auth/sign-up', { name: 'Again', email: owner.email, password: 'a brand new password' })).status).toBe(201);
  });

  it('refuses the only owner while other people use the business, naming it', async () => {
    const owner = await ownerWithCompany(t);
    await joinTeam(t, owner.token, { role: 'accountant', companyIds: [owner.company.id!] });
    const res = await t.post('/me/delete', { confirm: 'DELETE', password: owner.password }, { token: owner.token });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OWNER_MUST_TRANSFER');
    expect(res.body.companies).toEqual([{ id: owner.company.id, name: owner.company.name }]);
    expect((await userRow(owner.user.id!)).status).toBe('active');
  });

  it('lets a member leave without touching the business', async () => {
    const owner = await ownerWithCompany(t);
    const member = await joinTeam(t, owner.token, { role: 'accountant', companyIds: [owner.company.id!] });
    const res = await t.post('/me/delete', { confirm: 'DELETE', password: 'member password 1' }, { token: member.token });
    expect(res.status).toBe(204);
    expect((await accountRow(owner.user.accountId!)).suspendedAt).toBeNull();
    expect((await t.get(owner.c, { token: owner.token })).status).toBe(200);
    // The owner, alone again, can now delete too.
    expect((await t.post('/me/delete', { confirm: 'DELETE', password: owner.password }, { token: owner.token })).status).toBe(204);
  });

  it('needs the password, typed DELETE, and refuses platform operators', async () => {
    const owner = await signUpOwner(t);
    expect((await t.post('/me/delete', { confirm: 'DELETE', password: 'wrong wrong' }, { token: owner.token })).body.code).toBe('REAUTH_FAILED');
    expect((await t.post('/me/delete', { confirm: 'delete', password: owner.password }, { token: owner.token })).status).toBe(422);

    await t.deps.db.update(schema.users).set({ platformRole: 'support' }).where(eq(schema.users.id, owner.user.id!));
    expect((await t.post('/me/delete', { confirm: 'DELETE', password: owner.password }, { token: owner.token })).body.code).toBe('OPERATOR_CANNOT_SELF_DELETE');
  });

  it('takes a fresh code instead of a password for someone who signs in by phone, and only once', async () => {
    const owner = await signUpOwner(t);
    const phone = '+919500000001';
    await t.deps.db.update(schema.users).set({ passwordHash: null, phone, phoneVerifiedAt: new Date() }).where(eq(schema.users.id, owner.user.id!));
    const req = await t.post('/auth/otp/request', { phone });
    const code = t.providers.outbox.last('sms', phone)!.text.slice(0, 6);
    expect((await t.post('/me/delete', { confirm: 'DELETE', otpRequestId: req.body.requestId, otpCode: code === '000000' ? '111111' : '000000' }, { token: owner.token })).body.code).toBe('REAUTH_FAILED');
    expect((await t.post('/me/delete', { confirm: 'DELETE', otpRequestId: req.body.requestId, otpCode: code }, { token: owner.token })).status).toBe(204);
  });

  it('deletes nothing when the subscription cannot be cancelled', async () => {
    const owner = await ownerWithCompany(t, { plan: 'pro' });
    const live = { plan: 'pro', cycle: 'yearly', status: 'active', provider: 'razorpay', providerSubscriptionId: 'sub_live' } as const;
    await t.deps.db.insert(schema.subscriptions).values({ companyId: owner.company.id!, ...live }).onConflictDoUpdate({ target: schema.subscriptions.companyId, set: live });
    const cancel = vi.spyOn(t.deps.providers.payments, 'cancelSubscription').mockRejectedValueOnce(new Error('gateway down'));
    const res = await t.post('/me/delete', { confirm: 'DELETE', password: owner.password }, { token: owner.token });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('SUBSCRIPTION_CANCEL_FAILED');
    expect((await userRow(owner.user.id!)).status).toBe('active');

    cancel.mockResolvedValueOnce(undefined);
    expect((await t.post('/me/delete', { confirm: 'DELETE', password: owner.password }, { token: owner.token })).status).toBe(204);
    expect(cancel).toHaveBeenLastCalledWith('sub_live', { atPeriodEnd: false });
    cancel.mockRestore();
  });
});
