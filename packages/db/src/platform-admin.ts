import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { parseArgs } from 'node:util';
import { eq, sql } from 'drizzle-orm';
import { createDb, createPool, schema } from './index';

export type PlatformRoleArg = 'superadmin' | 'support' | 'none';
const ROLES: PlatformRoleArg[] = ['superadmin', 'support', 'none'];

/** Who ran the script, for the audit log: the OS user, as the API's actor email field. */
function cliActor(): string {
  try {
    return `cli:${userInfo().username}`;
  } catch {
    return 'cli:unknown';
  }
}

/**
 * Grants (or with `none`, removes) platform operator access for an existing
 * user. The API never grants this itself, so the first operator is always
 * made here by someone with database access. Every run is in the platform
 * audit log, with the OS user who ran it.
 */
export async function setPlatformRole(url: string, email: string, role: PlatformRoleArg): Promise<void> {
  if (!ROLES.includes(role)) throw new Error(`--role must be one of: ${ROLES.join(', ')}`);
  const pool = createPool(url, 1);
  try {
    const db = createDb(pool);
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(schema.users).where(eq(sql`lower(${schema.users.email})`, email.trim().toLowerCase()));
      if (!before) throw new Error(`No user with email ${email}. Sign up first, then run this again.`);
      const next = role === 'none' ? null : role;
      await tx.update(schema.users).set({ platformRole: next, updatedAt: new Date() }).where(eq(schema.users.id, before.id));
      // A granted or removed role ends their sessions: the next one opens with the new role's rules (MFA, 12 hours).
      await tx.update(schema.deviceSessions).set({ revokedAt: new Date() }).where(eq(schema.deviceSessions.userId, before.id));
      await audit(tx, before, next ? 'operator.role_granted' : 'operator.role_removed', `Platform role ${before.platformRole ?? 'none'} → ${next ?? 'none'}`, { platformRole: before.platformRole }, { platformRole: next });
    });
  } finally {
    await pool.end();
  }
}

/**
 * Clears an operator's authenticator and recovery codes, for a lost phone. They set it up again at
 * their next sign-in. Their sessions end now.
 */
export async function resetMfa(url: string, email: string): Promise<void> {
  const pool = createPool(url, 1);
  try {
    const db = createDb(pool);
    await db.transaction(async (tx) => {
      const [user] = await tx.select().from(schema.users).where(eq(sql`lower(${schema.users.email})`, email.trim().toLowerCase()));
      if (!user) throw new Error(`No user with email ${email}.`);
      await tx
        .update(schema.users)
        .set({ totpSecretEncrypted: null, totpEnabledAt: null, totpLastStep: null, recoveryCodeHashes: null, updatedAt: new Date() })
        .where(eq(schema.users.id, user.id));
      await tx.update(schema.deviceSessions).set({ revokedAt: new Date() }).where(eq(schema.deviceSessions.userId, user.id));
      await audit(tx, user, 'mfa.reset', 'Authenticator reset from the command line', { enrolled: !!user.totpEnabledAt }, { enrolled: false });
    });
  } finally {
    await pool.end();
  }
}

type Tx = Parameters<Parameters<ReturnType<typeof createDb>['transaction']>[0]>[0];

async function audit(tx: Tx, user: typeof schema.users.$inferSelect, action: string, reason: string, before: unknown, after: unknown) {
  // The table needs an actor row: the target stands in, and the email says it was the command line.
  await tx.insert(schema.platformAuditEvents).values({
    id: `pae_cli_${randomUUID().replace(/-/g, '').slice(0, 26)}`,
    actorId: user.id,
    actorEmail: cliActor(),
    action,
    targetType: 'user',
    targetId: user.id,
    targetLabel: user.email,
    reason,
    before,
    after,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { email: { type: 'string' }, role: { type: 'string', default: 'superadmin' }, 'reset-mfa': { type: 'boolean', default: false } } });
  if (!values.email) {
    console.error('Usage: npm run db:platform-admin -w @esmart/db -- --email you@example.com [--role superadmin|support|none] [--reset-mfa]');
    process.exit(1);
  }
  const url = process.env.DATABASE_URL ?? 'postgres://esmart:esmart@localhost:5432/esmart';
  try {
    if (values['reset-mfa']) await resetMfa(url, values.email);
    else await setPlatformRole(url, values.email, values.role as PlatformRoleArg);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  if (values['reset-mfa']) console.log(`Cleared the authenticator for ${values.email}; they set one up at their next sign-in.`);
  else console.log(values.role === 'none' ? `Removed platform access from ${values.email}.` : `${values.email} is now a platform ${values.role}.`);
}
