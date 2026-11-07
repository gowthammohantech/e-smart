import { and, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Deps } from '../../context';
import type { DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { companyTables } from '../exports/build';

/** Kept after a purge: the account and its (already anonymised) people stay as a tombstone. */
const KEEP = new Set(['accounts', 'users', 'webhook_events', 'platform_audit_events']);

/** Columns that point back into rows being deleted. Cleared first, so no delete waits on another. */
const CYCLES: { table: string; column: string; scope: 'company' | 'account' }[] = [
  { table: 'companies', column: 'logo_attachment_id', scope: 'company' },
  { table: 'items', column: 'image_attachment_id', scope: 'company' },
  { table: 'documents', column: 'current_eway_bill_id', scope: 'company' },
  { table: 'documents', column: 'source_document_id', scope: 'company' },
  { table: 'expenses', column: 'recurring_parent_id', scope: 'company' },
  { table: 'expenses', column: 'ocr_extraction_id', scope: 'company' },
];

const isForeignKeyViolation = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === '23503' || e.cause?.code === '23503';
};

export type PurgePlan = { accountId: string; companies: string[]; rows: Record<string, number>; objects: string[] };

/**
 * Erases a closed account's businesses: every row that belongs to them, found from the catalogue
 * (the export's discovery), then their files. Deletes go table by table in savepoints; one still
 * referenced by a table not yet emptied is tried again in the next round, so the order needn't be
 * known in advance. With `dryRun` it only counts. The account row stays, marked purged.
 */
export async function purgeAccount(deps: Pick<Deps, 'db' | 'now' | 'providers'>, accountId: string, opts: { dryRun: boolean }): Promise<PurgePlan> {
  const companies = (await deps.db.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.accountId, accountId))).map((c) => c.id);
  return eraseCompanies(deps, accountId, companies, opts, async (tx, plan) => {
    await tx.update(schema.accounts).set({ purgeAfter: null, suspendedReason: 'purged', updatedAt: deps.now() }).where(eq(schema.accounts.id, accountId));
    await auditPurge(tx, accountId, {
      action: 'account.purged',
      targetType: 'account',
      targetId: accountId,
      targetLabel: accountId,
      reason: 'Retention period after the account was deleted has ended',
      before: { companies: companies.length, rows: plan.rows, objects: plan.objects.length },
    });
  });
}

/** One archived business, the same way: its rows and files go; the account and its other businesses stay. */
export async function purgeCompany(deps: Pick<Deps, 'db' | 'now' | 'providers'>, companyId: string, opts: { dryRun: boolean }): Promise<PurgePlan> {
  const [company] = await deps.db
    .select({ id: schema.companies.id, accountId: schema.companies.accountId, name: schema.companies.name })
    .from(schema.companies)
    .where(and(eq(schema.companies.id, companyId), isNotNull(schema.companies.archivedAt)));
  // Restored since it was picked, or already gone.
  if (!company) return { accountId: '', companies: [], rows: {}, objects: [] };
  return eraseCompanies(deps, company.accountId, [company.id], opts, async (tx, plan) => {
    await auditPurge(tx, company.accountId, {
      action: 'company.purged',
      targetType: 'company',
      targetId: company.id,
      targetLabel: company.name,
      reason: 'Retention period after the business was archived has ended',
      before: { rows: plan.rows, objects: plan.objects.length },
    });
  });
}

type PurgeAudit = Pick<typeof schema.platformAuditEvents.$inferInsert, 'action' | 'targetType' | 'targetId' | 'targetLabel' | 'reason' | 'before'>;

/** Recorded against the account owner, as the system acting for them. */
async function auditPurge(tx: DbOrTx, accountId: string, event: PurgeAudit) {
  const [owner] = await tx.select({ id: schema.accounts.ownerUserId }).from(schema.accounts).where(eq(schema.accounts.id, accountId));
  if (owner?.id) await tx.insert(schema.platformAuditEvents).values({ id: newId('pae'), actorId: owner.id, actorEmail: 'system:purge', ...event });
}

async function eraseCompanies(
  deps: Pick<Deps, 'db' | 'now' | 'providers'>,
  accountId: string,
  companies: string[],
  opts: { dryRun: boolean },
  finish: (tx: DbOrTx, plan: PurgePlan) => Promise<void>,
): Promise<PurgePlan> {
  const tables = await companyTables(deps.db, KEEP);
  const plan: PurgePlan = { accountId, companies, rows: {}, objects: [] };

  for (const companyId of companies) {
    for (const s of tables.values()) {
      const res = await deps.db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(s.table)} where ${s.where(companyId)}`);
      const n = Number(res.rows[0]?.n ?? 0);
      if (n) plan.rows[s.table] = (plan.rows[s.table] ?? 0) + n;
    }
    plan.objects.push(...(await deps.providers.storage.list(`companies/${companyId}/`)), ...(await deps.providers.storage.list(`exports/${companyId}/`)));
  }
  // Attachments may live under their own keys: take them from the rows before the rows go.
  if (companies.length) {
    const atts = await deps.db.select({ key: schema.attachments.storageKey }).from(schema.attachments).where(inArray(schema.attachments.companyId, companies));
    for (const a of atts) if (a.key && !plan.objects.includes(a.key)) plan.objects.push(a.key);
  }
  plan.rows.companies = companies.length;
  if (opts.dryRun) return plan;

  await deps.db.transaction(async (tx) => {
    if (companies.length) await tx.update(schema.users).set({ defaultCompanyId: null }).where(inArray(schema.users.defaultCompanyId, companies));
    for (const companyId of companies) {
      for (const c of CYCLES) {
        const scoped = tables.get(c.table);
        const where = c.table === 'companies' ? sql`${sql.identifier('id')} = ${companyId}` : scoped?.where(companyId);
        if (where) await tx.execute(sql`update ${sql.identifier(c.table)} set ${sql.identifier(c.column)} = null where ${where}`);
      }
      await deleteAll(tx, [...tables.values()], companyId);
    }
    if (companies.length) await tx.delete(schema.companies).where(inArray(schema.companies.id, companies));
    await finish(tx, plan);
  });

  // Files after the rows: a failed delete here leaves an orphan file, never a row pointing at nothing.
  for (const key of plan.objects) await deps.providers.storage.delete(key);
  return plan;
}

async function deleteAll(tx: DbOrTx, tables: { table: string; where: (companyId: string) => ReturnType<typeof sql> }[], companyId: string) {
  let left = tables;
  for (let round = 0; left.length && round < 12; round++) {
    const stuck: typeof left = [];
    for (const s of left) {
      try {
        await (tx as unknown as { transaction: (fn: (sp: DbOrTx) => Promise<unknown>) => Promise<unknown> }).transaction((sp) =>
          sp.execute(sql`delete from ${sql.identifier(s.table)} where ${s.where(companyId)}`),
        );
      } catch (err) {
        if (!isForeignKeyViolation(err)) throw err;
        stuck.push(s);
      }
    }
    left = stuck;
  }
  if (left.length) throw new Error(`Purge could not empty: ${left.map((s) => s.table).join(', ')}`);
}

/** The daily `accounts.purge` job: every closed account whose keep-until date has passed. */
export async function purgeDueAccounts(deps: Pick<Deps, 'db' | 'now' | 'providers' | 'config'>, log: { info: (o: object, m?: string) => void }) {
  const due = await deps.db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(and(isNotNull(schema.accounts.purgeAfter), lt(schema.accounts.purgeAfter, deps.now())));
  for (const { id } of due) {
    const plan = await purgeAccount(deps, id, { dryRun: deps.config.PURGE_DRY_RUN });
    log.info({ plan, dryRun: deps.config.PURGE_DRY_RUN }, deps.config.PURGE_DRY_RUN ? 'purge (dry run): would erase' : 'purged closed account');
  }
  return due.length;
}

/** The same daily job's other half: every archived business whose keep-until date has passed. */
export async function purgeDueCompanies(deps: Pick<Deps, 'db' | 'now' | 'providers' | 'config'>, log: { info: (o: object, m?: string) => void }) {
  const C = schema.companies;
  const due = await deps.db
    .select({ id: C.id })
    .from(C)
    .where(and(isNotNull(C.archivedAt), isNotNull(C.purgeAfter), lt(C.purgeAfter, deps.now())));
  for (const { id } of due) {
    const plan = await purgeCompany(deps, id, { dryRun: deps.config.PURGE_DRY_RUN });
    log.info({ plan, dryRun: deps.config.PURGE_DRY_RUN }, deps.config.PURGE_DRY_RUN ? 'purge (dry run): would erase business' : 'purged archived business');
  }
  return due.length;
}
