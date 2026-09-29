import { randomUUID } from 'node:crypto';
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
  const invited = await t.post('/users', { name: over.name ?? 'Arun Kumar', email, role: over.role, companyIds: over.companyIds, branchIds: over.branchIds }, { token: inviterToken });
  if (invited.status !== 201) throw new Error(`invite failed: ${invited.status} ${invited.raw}`);
  const accepted = await t.post(`/invites/${inviteTokenFor(t, email)}/accept`, { password: 'member password 1' });
  if (accepted.status !== 200) throw new Error(`accept failed: ${accepted.status} ${accepted.raw}`);
  return { token: accepted.body.accessToken as string, user: accepted.body.user as Schema<'User'>, email };
}
