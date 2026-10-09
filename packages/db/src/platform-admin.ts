import { parseArgs } from 'node:util';
import { eq, sql } from 'drizzle-orm';
import { createDb, createPool, schema } from './index';

export type PlatformRoleArg = 'superadmin' | 'support' | 'none';
const ROLES: PlatformRoleArg[] = ['superadmin', 'support', 'none'];

/**
 * Grants (or with `none`, removes) platform operator access for an existing
 * user. The API never grants this itself, so the first operator is always
 * made here by someone with database access.
 */
export async function setPlatformRole(url: string, email: string, role: PlatformRoleArg): Promise<void> {
  if (!ROLES.includes(role)) throw new Error(`--role must be one of: ${ROLES.join(', ')}`);
  const pool = createPool(url, 1);
  try {
    const db = createDb(pool);
    const rows = await db
      .update(schema.users)
      .set({ platformRole: role === 'none' ? null : role, updatedAt: new Date() })
      .where(eq(sql`lower(${schema.users.email})`, email.trim().toLowerCase()))
      .returning({ id: schema.users.id });
    if (!rows.length) throw new Error(`No user with email ${email}. Sign up first, then run this again.`);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { email: { type: 'string' }, role: { type: 'string', default: 'superadmin' } } });
  if (!values.email) {
    console.error('Usage: npm run db:platform-admin -w @esmart/db -- --email you@example.com [--role superadmin|support|none]');
    process.exit(1);
  }
  await setPlatformRole(process.env.DATABASE_URL ?? 'postgres://esmart:esmart@localhost:5432/esmart', values.email, values.role as PlatformRoleArg);
  console.log(values.role === 'none' ? `Removed platform access from ${values.email}.` : `${values.email} is now a platform ${values.role}.`);
}
