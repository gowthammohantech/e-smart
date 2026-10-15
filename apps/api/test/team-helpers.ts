import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import type { TestContext } from './helpers';

/** The token from the latest invite email to `email`. */
export function inviteTokenFor(t: TestContext, email: string): string {
  const mail = t.providers.outbox.last('email', email);
  const token = /accept-invite\?token=([\w-]+)/.exec(mail?.text ?? '')?.[1];
  if (!token) throw new Error(`no invite email for ${email}`);
  return token;
}

/** Invites a team member and accepts as them. Returns their session. */
export async function joinTeam(
  t: TestContext,
  inviterToken: string,
  over: { role: Schema<'UserRole'>; companyIds: string[]; branchIds?: string[]; name?: string; email?: string },
) {
  const email = over.email ?? `member-${randomUUID().slice(0, 8)}@example.com`;
  // Most suites aren't about seat limits, so the businesses the invite reaches
  // are lifted to Business for the invite and put back on their own plan after.
  const reached = over.companyIds.length
    ? over.companyIds
    : ((await t.get('/companies', { token: inviterToken })).body.data as { id: string }[]).map((c) => c.id);
  const before = await t.deps.db.select({ id: schema.companies.id, plan: schema.companies.plan }).from(schema.companies).where(inArray(schema.companies.id, reached));
  await t.deps.db.update(schema.companies).set({ plan: 'business' }).where(inArray(schema.companies.id, reached));
  try {
    return await invite();
  } finally {
    for (const c of before) await t.deps.db.update(schema.companies).set({ plan: c.plan }).where(eq(schema.companies.id, c.id));
  }

  async function invite() {
    const invited = await t.post('/users', { name: over.name ?? 'Arun Kumar', email, role: over.role, companyIds: over.companyIds, branchIds: over.branchIds }, { token: inviterToken });
    if (invited.status !== 201) throw new Error(`invite failed: ${invited.status} ${invited.raw}`);
    const accepted = await t.post(`/invites/${inviteTokenFor(t, email)}/accept`, { password: 'member password 1' });
    if (accepted.status !== 200) throw new Error(`accept failed: ${accepted.status} ${accepted.raw}`);
    return { token: accepted.body.accessToken as string, user: accepted.body.user as Schema<'User'>, email };
    }
}
