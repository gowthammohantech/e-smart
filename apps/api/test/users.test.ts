import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { createCompany, ownerWithCompany, setupApi, signUpOwner } from './helpers';
import { inviteTokenFor, joinTeam } from './team-helpers';

const t = setupApi();

describe('users', () => {
  it('invites a member, stores only the token hash, and signs them in on accept', async () => {
    const { token, company, user: owner } = await ownerWithCompany(t);
    const [branch] = await t.deps.db.select().from(schema.branches).where(eq(schema.branches.companyId, company.id!));
    const res = await t.post(
      '/users',
      { name: 'Arun Kumar', email: 'Arun@Example.com', role: 'sales', companyIds: [company.id], branchIds: [branch.id] },
      { token },
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'arun@example.com', role: 'sales', status: 'invited', companyIds: [company.id], branchIds: [branch.id] });

    const raw = inviteTokenFor(t, 'arun@example.com');
    const [invite] = await t.deps.db.select().from(schema.invites).where(eq(schema.invites.userId, res.body.id));
    expect(invite.tokenHash).not.toContain(raw);
    expect(invite.invitedBy).toBe(owner.id);

    // Invited users can't sign in until they accept.
    const early = await t.post('/auth/sign-in', { email: 'arun@example.com', password: 'whatever pass' });
    expect(early.status).toBe(401);

    const short = await t.post(`/invites/${raw}/accept`, { password: 'short' });
    expect(short.status).toBe(422);
    const accepted = await t.post(`/invites/${raw}/accept`, { password: 'arun password 1' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.user).toMatchObject({ status: 'active', role: 'sales' });
    expect(accepted.body.onboardingComplete).toBe(false);
    const me = await t.get('/me', { token: accepted.body.accessToken });
    expect(me.body.companies.map((c: { id: string }) => c.id)).toEqual([company.id]);

    // The link works once.
    expect((await t.post(`/invites/${raw}/accept`, { password: 'arun password 2' })).body.code).toBe('INVITE_INVALID');
    expect((await t.post('/auth/sign-in', { email: 'arun@example.com', password: 'arun password 1' })).status).toBe(200);

    const list = await t.get('/users', { token });
    expect(list.body.data.map((u: { email: string }) => u.email)).toEqual([owner.email, 'arun@example.com']);
  });

  it('refuses duplicate emails, companies from another account, and non-admins', async () => {
    const { token, company } = await ownerWithCompany(t);
    const stranger = await ownerWithCompany(t);
    const dup = await t.post('/users', { name: 'X', email: stranger.email, role: 'viewer', companyIds: [company.id] }, { token });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('EMAIL_TAKEN');

    const foreign = await t.post('/users', { name: 'X', email: 'x@example.com', role: 'viewer', companyIds: [stranger.company.id] }, { token });
    expect(foreign.status).toBe(422);
    expect(foreign.body.issues[0].field).toBe('companyIds');

    const sales = await joinTeam(t, token, { role: 'sales', companyIds: [company.id!] });
    const denied = await t.post('/users', { name: 'Y', email: 'y@example.com', role: 'viewer', companyIds: [company.id] }, { token: sales.token });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('ROLE_FORBIDDEN');

    // An admin can't hand out the owner role.
    const admin = await joinTeam(t, token, { role: 'admin', companyIds: [company.id!] });
    const owner = await t.post('/users', { name: 'Z', email: 'z@example.com', role: 'owner', companyIds: [company.id] }, { token: admin.token });
    expect(owner.status).toBe(403);
  });

  it('changes a role, applied on the next request', async () => {
    const { token, company, c } = await ownerWithCompany(t);
    const member = await joinTeam(t, token, { role: 'viewer', companyIds: [company.id!] });
    const party = { kind: 'customer', name: 'Sunrise', currency: 'INR', billingAddress: company.address, openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 0 };
    expect((await t.post(`${c}/parties`, party, { token: member.token })).status).toBe(403);

    const saved = await t.put(`/users/${member.user.id}`, { ...member.user, role: 'accountant' }, { token });
    expect(saved.status).toBe(200);
    expect(saved.body.role).toBe('accountant');
    expect((await t.post(`${c}/parties`, party, { token: member.token })).status).toBe(201);

    // Disabling signs them out everywhere.
    await t.put(`/users/${member.user.id}`, { ...saved.body, status: 'disabled' }, { token });
    const blocked = await t.get('/me', { token: member.token });
    expect(blocked.status).toBe(401);

    const audit = await t.deps.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityId, member.user.id!));
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['invited', 'joined', 'updated']));
  });

  it('never demotes, disables or removes the last active owner', async () => {
    const { token, user, company } = await ownerWithCompany(t);
    const demote = await t.put(`/users/${user.id}`, { ...user, role: 'admin' }, { token });
    expect(demote.status).toBe(409);
    expect(demote.body.code).toBe('LAST_OWNER');

    const second = await joinTeam(t, token, { role: 'owner', companyIds: [] });
    // Owners reach every company on the account.
    expect(second.user.companyIds).toEqual([company.id]);
    const ok = await t.put(`/users/${user.id}`, { ...user, role: 'admin', companyIds: [company.id] }, { token: second.token });
    expect(ok.status).toBe(200);
    const last = await t.del(`/users/${second.user.id}`, { token });
    // `token` is now an admin: admins can't remove owners.
    expect(last.status).toBe(403);
    const demoteLast = await t.put(`/users/${second.user.id}`, { ...second.user, status: 'disabled' }, { token: second.token });
    expect(demoteLast.status).toBe(409);
  });

  it("removes a member, but not yourself, and 404s another account's user", async () => {
    const { token, user, company } = await ownerWithCompany(t);
    const other = await signUpOwner(t);
    const member = await joinTeam(t, token, { role: 'sales', companyIds: [company.id!] });

    expect((await t.del(`/users/${user.id}`, { token })).body.code).toBe('CANNOT_REMOVE_SELF');
    expect((await t.del(`/users/${other.user.id}`, { token })).status).toBe(404);
    expect((await t.put(`/users/${other.user.id}`, { ...other.user, role: 'viewer' }, { token })).status).toBe(404);

    expect((await t.del(`/users/${member.user.id}`, { token })).status).toBe(204);
    expect((await t.get('/me', { token: member.token })).status).toBe(401);
    const list = await t.get('/users', { token });
    // The member wrote audit rows (joining), so the row stays, disabled, for history.
    const kept = list.body.data.find((u: { id: string }) => u.id === member.user.id);
    expect(kept).toMatchObject({ status: 'disabled', companyIds: [] });

    // An invited user with no history is deleted outright.
    const invited = await t.post('/users', { name: 'Temp', email: 'temp@example.com', role: 'viewer', companyIds: [company.id] }, { token });
    const [aud] = await t.deps.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityId, invited.body.id));
    expect(aud.action).toBe('invited');
    expect((await t.del(`/users/${invited.body.id}`, { token })).status).toBe(204);
    expect((await t.get('/users', { token })).body.data.some((u: { id: string }) => u.id === invited.body.id)).toBe(false);
  });

  it('resends an invite with a new token, and only to invited users', async () => {
    const { token, company, user } = await ownerWithCompany(t);
    const res = await t.post('/users', { name: 'Arun', email: 'arun2@example.com', role: 'viewer', companyIds: [company.id] }, { token });
    const first = inviteTokenFor(t, 'arun2@example.com');

    t.setNow(new Date(Date.now() + 120_000));
    const resent = await t.post(`/users/${res.body.id}/resend-invite`, {}, { token });
    expect(resent.status).toBe(202);
    const second = inviteTokenFor(t, 'arun2@example.com');
    expect(second).not.toBe(first);
    expect((await t.post(`/invites/${first}/accept`, { password: 'long enough 1' })).status).toBe(400);
    expect((await t.post(`/invites/${second}/accept`, { password: 'long enough 1' })).status).toBe(200);

    const again = await t.post(`/users/${user.id}/resend-invite`, {}, { token });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('NOT_INVITED');
  });

  it('keeps branch access within the chosen companies', async () => {
    const owner = await signUpOwner(t);
    const a = await createCompany(t, owner.token, { name: 'A' });
    const b = await createCompany(t, owner.token, { name: 'B' });
    const [bBranch] = await t.deps.db.select().from(schema.branches).where(eq(schema.branches.companyId, b.id!));
    const res = await t.post('/users', { name: 'Q', email: 'q@example.com', role: 'viewer', companyIds: [a.id], branchIds: [bBranch.id] }, { token: owner.token });
    expect(res.status).toBe(422);
    expect(res.body.issues[0].field).toBe('branchIds');
  });
});
