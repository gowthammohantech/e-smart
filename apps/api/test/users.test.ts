import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { createCompany, ownerWithCompany, setupApi, signUpOwner } from './helpers';
import { inviteTokenFor, joinTeam } from './team-helpers';

const t = setupApi();

describe('users', () => {
  it('invites a member, stores only the token hash, and signs them in on accept', async () => {
    const { token, company, user: owner } = await ownerWithCompany(t, { plan: 'business' });
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
    // A teammate joined someone else's business; they don't set one up.
    expect(accepted.body.onboardingComplete).toBe(true);
    const me = await t.get('/me', { token: accepted.body.accessToken });
    expect(me.body.companies.map((c: { id: string }) => c.id)).toEqual([company.id]);

    // The link works once.
    expect((await t.post(`/invites/${raw}/accept`, { password: 'arun password 2' })).body.code).toBe('INVITE_INVALID');
    expect((await t.post('/auth/sign-in', { email: 'arun@example.com', password: 'arun password 1' })).status).toBe(200);

    const list = await t.get('/users', { token });
    expect(list.body.data.map((u: { email: string }) => u.email)).toEqual([owner.email, 'arun@example.com']);
  });

  it('refuses duplicate emails, companies from another account, and non-admins', async () => {
    const { token, company, email: ownEmail } = await ownerWithCompany(t);
    const stranger = await ownerWithCompany(t);
    const dup = await t.post('/users', { name: 'X', email: ownEmail, role: 'viewer', companyIds: [company.id] }, { token });
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
    const { token, user, company } = await ownerWithCompany(t, { plan: 'business' });
    const other = await signUpOwner(t);
    const member = await joinTeam(t, token, { role: 'sales', companyIds: [company.id!] });

    expect((await t.del(`/users/${user.id}`, { token })).body.code).toBe('CANNOT_REMOVE_SELF');
    expect((await t.del(`/users/${other.user.id}`, { token })).status).toBe(404);
    expect((await t.put(`/users/${other.user.id}`, { ...other.user, role: 'viewer' }, { token })).status).toBe(404);

    expect((await t.del(`/users/${member.user.id}`, { token })).status).toBe(204);
    expect((await t.get('/me', { token: member.token })).status).toBe(401);
    const list = await t.get('/users', { token });
    // They keep their login, on an account of their own with no business yet.
    expect(list.body.data.some((u: { id: string }) => u.id === member.user.id)).toBe(false);
    const [moved] = await t.deps.db.select().from(schema.users).where(eq(schema.users.id, member.user.id!));
    expect(moved).toMatchObject({ status: 'active', role: 'owner' });
    expect(moved.accountId).not.toBe(user.accountId);
    const back = await t.post('/auth/sign-in', { email: member.email, password: 'member password 1' });
    expect(back.status).toBe(200);
    expect(back.body.onboardingComplete).toBe(false);
    expect((await t.get('/me', { token: back.body.accessToken })).body.companies).toEqual([]);

    // An invited user with no history is deleted outright.
    const invited = await t.post('/users', { name: 'Temp', email: 'temp@example.com', role: 'viewer', companyIds: [company.id] }, { token });
    const [aud] = await t.deps.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityId, invited.body.id));
    expect(aud.action).toBe('invited');
    expect((await t.del(`/users/${invited.body.id}`, { token })).status).toBe(204);
    expect((await t.get('/users', { token })).body.data.some((u: { id: string }) => u.id === invited.body.id)).toBe(false);
  });

  it('resends an invite with a new token, and only to invited users', async () => {
    const { token, company, user } = await ownerWithCompany(t, { plan: 'business' });
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

  describe('plan user limits', () => {
    const invite = (token: string, companyId: string, n: number) =>
      t.post('/users', { name: `P${n}`, email: `limit-${n}-${Math.random().toString(36).slice(2, 8)}@example.com`, role: 'viewer', companyIds: [companyId] }, { token });

    it.each([
      ['free', 1],
      ['basic', 2],
      ['pro', 6],
    ] as const)('stops inviting once a %s plan holds %i user(s), and names the next plan', async (plan, limit) => {
      const { token, company } = await ownerWithCompany(t, { plan });
      // The owner already holds one seat.
      for (let i = 1; i < limit; i++) expect((await invite(token, company.id!, i)).status).toBe(201);
      const over = await invite(token, company.id!, limit);
      expect(over.status).toBe(403);
      expect(over.body.code).toBe('PLAN_LIMIT_REACHED');
      expect(over.body.requiredPlan).toBeTruthy();
    });

    it('never limits the business plan', async () => {
      const { token, company } = await ownerWithCompany(t, { plan: 'business' });
      for (let i = 1; i <= 8; i++) expect((await invite(token, company.id!, i)).status).toBe(201);
    });

    it('holds a seat for a pending invitation, and frees it when the invitation is removed', async () => {
      const { token, company } = await ownerWithCompany(t, { plan: 'basic' });
      const first = await invite(token, company.id!, 1);
      expect(first.status).toBe(201);
      expect((await invite(token, company.id!, 2)).body.code).toBe('PLAN_LIMIT_REACHED');
      expect((await t.del(`/users/${first.body.id}`, { token })).status).toBe(204);
      expect((await invite(token, company.id!, 3)).status).toBe(201);
    });

    it("won't turn a disabled user back on when the plan is full", async () => {
      const { token, company } = await ownerWithCompany(t, { plan: 'business' });
      const added = await invite(token, company.id!, 1);
      const off = await t.put(`/users/${added.body.id}`, { ...added.body, status: 'disabled' }, { token });
      expect(off.status).toBe(200);
      await t.deps.db.update(schema.companies).set({ plan: 'free' }).where(eq(schema.companies.id, company.id!));
      const on = await t.put(`/users/${added.body.id}`, { ...off.body, status: 'active' }, { token });
      expect(on.status).toBe(403);
      expect(on.body.code).toBe('PLAN_LIMIT_REACHED');
    });
  });

  describe('invitation email and landing page', () => {
    it('emails the business, the inviter and a link, and the link describes the invitation', async () => {
      const { token, company, user: owner } = await ownerWithCompany(t, { plan: 'basic' });
      const res = await t.post('/users', { name: 'Meena', email: 'meena@example.com', role: 'accountant', companyIds: [company.id] }, { token });
      expect(res.status).toBe(201);
      const mail = t.providers.outbox.last('email', 'meena@example.com');
      expect(mail?.subject).toContain(owner.name);
      expect(mail?.subject).toContain(company.name);
      expect(mail?.text).toMatch(/\/accept-invite\?token=/);

      const raw = inviteTokenFor(t, 'meena@example.com');
      const details = await t.get(`/invites/${raw}`);
      expect(details.status).toBe(200);
      expect(details.body).toMatchObject({ email: 'meena@example.com', name: 'Meena', role: 'accountant', inviterName: owner.name, businesses: [company.name] });
      expect((await t.get('/invites/not-a-token')).body.code).toBe('INVITE_INVALID');

      expect((await t.post(`/invites/${raw}/accept`, { password: 'meena password 1' })).status).toBe(200);
      expect((await t.get(`/invites/${raw}`)).body.code).toBe('INVITE_INVALID');
    });

    it('keeps the invitation when the email fails, says so, and lets the inviter resend', async () => {
      const { token, company } = await ownerWithCompany(t, { plan: 'basic' });
      const send = vi.spyOn(t.providers.email, 'send').mockRejectedValueOnce(new Error('Resend 403: domain not verified'));
      const res = await t.post('/users', { name: 'Ravi', email: 'ravi@example.com', role: 'viewer', companyIds: [company.id] }, { token });
      send.mockRestore();
      expect(res.status).toBe(502);
      expect(res.body.code).toBe('EMAIL_SEND_FAILED');
      const list = await t.get('/users', { token });
      const saved = list.body.data.find((u: { email: string }) => u.email === 'ravi@example.com');
      expect(saved.status).toBe('invited');
      expect((await t.post(`/users/${saved.id}/resend-invite`, {}, { token })).status).toBe(202);
      expect(t.providers.outbox.last('email', 'ravi@example.com')).toBeTruthy();
    });
  });

  describe('inviting someone who already has an account', () => {
    it('offers access by email, grants nothing until accepted, then signs them in with the role they were given', async () => {
      const host = await ownerWithCompany(t, { plan: 'pro' });
      const guest = await ownerWithCompany(t, { plan: 'free' });

      const res = await t.post('/users', { name: guest.user.name, email: guest.email, role: 'viewer', companyIds: [host.company.id] }, { token: host.token });
      expect(res.status).toBe(201);
      // The inviter sees an invitation to their own business only.
      expect(res.body).toMatchObject({ email: guest.email, role: 'viewer', status: 'invited', companyIds: [host.company.id] });
      const mail = t.providers.outbox.last('email', guest.email);
      expect(mail?.text).toContain('existing Elixir Books account');

      // Nothing is granted yet.
      expect((await t.get(`/companies/${host.company.id}`, { token: guest.token })).status).toBe(403);

      const raw = inviteTokenFor(t, guest.email);
      const details = await t.get(`/invites/${raw}`);
      expect(details.body).toMatchObject({ existingUser: true, businesses: [host.company.name], role: 'viewer', companyIds: [host.company.id] });

      // No password needed.
      const accepted = await t.post(`/invites/${raw}/accept`, {});
      expect(accepted.status).toBe(200);
      expect(accepted.body.user.id).toBe(guest.user.id);
      const token = accepted.body.accessToken as string;
      expect((await t.get(`/companies/${host.company.id}`, { token })).status).toBe(200);
      const mine = await t.get('/companies', { token });
      expect(mine.body.data.map((c: { id: string }) => c.id)).toEqual(expect.arrayContaining([host.company.id, guest.company.id]));

      // In the host's business they act as a viewer, whatever they are at home.
      const checkout = await t.post(`/companies/${host.company.id}/subscription/checkout`, { plan: 'basic', cycle: 'monthly' }, { token });
      expect(checkout.body.code).toBe('ROLE_FORBIDDEN');
      // The link works once.
      expect((await t.post(`/invites/${raw}/accept`, {})).body.code).toBe('INVITE_INVALID');

      // The host's team list shows them as a member, with only the host's business.
      const team = await t.get('/users', { token: host.token });
      const row = team.body.data.find((u: { email: string }) => u.email === guest.email);
      expect(row).toMatchObject({ status: 'active', role: 'viewer', companyIds: [host.company.id] });
    });

    it("lets the host withdraw an offer or remove a guest without touching the guest's own account", async () => {
      const host = await ownerWithCompany(t, { plan: 'pro' });
      const guest = await ownerWithCompany(t, { plan: 'free' });
      const invited = await t.post('/users', { name: 'G', email: guest.email, role: 'sales', companyIds: [host.company.id] }, { token: host.token });
      expect((await t.del(`/users/${invited.body.id}`, { token: host.token })).status).toBe(204);
      expect((await t.post(`/invites/${inviteTokenFor(t, guest.email)}/accept`, {})).body.code).toBe('INVITE_INVALID');

      await t.post('/users', { name: 'G', email: guest.email, role: 'sales', companyIds: [host.company.id] }, { token: host.token });
      await t.post(`/invites/${inviteTokenFor(t, guest.email)}/accept`, {});
      expect((await t.del(`/users/${invited.body.id}`, { token: host.token })).status).toBe(204);
      expect((await t.get(`/companies/${host.company.id}`, { token: guest.token })).status).toBe(403);
      expect((await t.get(`/companies/${guest.company.id}`, { token: guest.token })).status).toBe(200);
      expect((await t.get('/users', { token: host.token })).body.data.some((u: { email: string }) => u.email === guest.email)).toBe(false);
    });

    it('holds a seat for the offer, and still refuses an address already on the team', async () => {
      const host = await ownerWithCompany(t, { plan: 'basic' });
      const guest = await ownerWithCompany(t);
      const other = await ownerWithCompany(t);
      expect((await t.post('/users', { name: 'G', email: guest.email, role: 'viewer', companyIds: [host.company.id] }, { token: host.token })).status).toBe(201);
      const over = await t.post('/users', { name: 'O', email: other.email, role: 'viewer', companyIds: [host.company.id] }, { token: host.token });
      expect(over.body.code).toBe('PLAN_LIMIT_REACHED');

      const member = await joinTeam(t, host.token, { role: 'viewer', companyIds: [host.company.id!] });
      const again = await t.post('/users', { name: 'M', email: member.email, role: 'viewer', companyIds: [host.company.id] }, { token: host.token });
      expect(again.body.code).toBe('EMAIL_TAKEN');
    });
  });
});
