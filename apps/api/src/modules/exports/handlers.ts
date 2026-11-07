import { and, desc, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { defineHandlers, type AuthUser, type Deps } from '../../context';
import { enqueue } from '../../jobs/queue';
import { notify } from '../../lib/notify';
import { invalid, notFound } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { compact, iso } from '../../lib/wire';
import { buildExport } from './build';

const J = schema.exportJobs;
const BS = schema.backupSettings;
type JobRow = typeof J.$inferSelect;

/** How long an export file is kept, and how long one download link works. */
const RETENTION_MS = 7 * 86_400_000;
/** Automatic backups stay longer, so a weekly one is still there when the next is made. */
const BACKUP_RETENTION_MS = 35 * 86_400_000;
const BACKUP_EVERY_MS = { daily: 86_400_000, weekly: 7 * 86_400_000 } as const;
const LINK_TTL_SECONDS = 3600;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'company';

/** A completed, unexpired job carries a fresh signed link; `expiresAt` is the link's. */
async function jobToWire(deps: Deps, row: JobRow, now: Date, companyName: string): Promise<Schema<'ExportJob'>> {
  let link: { url: string; expiresAt: Date } | undefined;
  if (row.status === 'completed' && row.storageKey && (!row.expiresAt || row.expiresAt > now)) {
    const remaining = row.expiresAt ? Math.floor((row.expiresAt.getTime() - now.getTime()) / 1000) : LINK_TTL_SECONDS;
    const stamp = row.createdAt.toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `${slug(companyName)}-${row.format}-${stamp}.${row.storageKey.split('.').pop()}`;
    link = await deps.providers.storage.downloadUrl(row.storageKey, { ttlSeconds: Math.max(1, Math.min(LINK_TTL_SECONDS, remaining)), filename });
  }
  return compact({
    id: row.id,
    format: row.format,
    status: row.status,
    downloadUrl: link?.url,
    expiresAt: iso(link?.expiresAt ?? (row.status === 'completed' ? row.expiresAt : null)),
    createdAt: iso(row.createdAt),
  });
}

async function findJob(db: DbOrTx, companyId: string, id: string): Promise<JobRow> {
  const [row] = await db.select().from(J).where(and(eq(J.companyId, companyId), eq(J.id, id)));
  if (!row) throw notFound('Export');
  return row;
}

/** The company's backup settings, created with defaults on first read. */
async function backupSettingsOf(db: DbOrTx, companyId: string) {
  await db.insert(BS).values({ companyId }).onConflictDoNothing();
  const [row] = await db.select().from(BS).where(eq(BS.companyId, companyId));
  return row;
}

function backupToWire(row: typeof BS.$inferSelect): Schema<'BackupSettings'> {
  return compact({ automatic: row.automatic, frequency: row.frequency, destination: row.destination, lastBackupAt: iso(row.lastBackupAt) });
}

/**
 * Builds a queued export: the file goes to storage, the row to completed (or failed), and a
 * json-backup counts as the company's last backup. Safe to run again: a finished row is left alone.
 */
export async function runExport(deps: Deps, input: { exportId: string; from?: string; to?: string; includeAttachments?: boolean }) {
  const now = deps.now();
  const [job] = await deps.db.select().from(J).where(eq(J.id, input.exportId));
  if (!job || job.status === 'completed' || job.status === 'failed') return job ?? null;
  const [company] = await deps.db.select().from(schema.companies).where(eq(schema.companies.id, job.companyId));
  if (!company) return null;
  await deps.db.update(J).set({ status: 'running' }).where(eq(J.id, job.id));
  try {
    const file = await buildExport(deps.db, deps, job.format, job.companyId, { from: input.from, to: input.to, includeAttachments: input.includeAttachments }, now);
    // Short keys: the memory store serves them as one path segment (Fastify caps those at 100 characters).
    const key = `exports/${job.companyId}/${job.id}.${file.extension}`;
    await deps.providers.storage.put(key, file.body, file.contentType);
    const actor = await exportActor(deps.db, job);
    return await deps.db.transaction(async (tx) => {
      const [row] = await tx
        .update(J)
        .set({ status: 'completed', storageKey: key, completedAt: now, expiresAt: new Date(now.getTime() + (job.trigger === 'scheduled' ? BACKUP_RETENTION_MS : RETENTION_MS)), error: null })
        .where(eq(J.id, job.id))
        .returning();
      if (job.format === 'json-backup') {
        await backupSettingsOf(tx, job.companyId);
        await tx.update(BS).set({ lastBackupAt: now }).where(eq(BS.companyId, job.companyId));
      }
      if (actor) {
        await recordChange(tx, actor, {
          companyId: job.companyId,
          action: job.trigger === 'scheduled' ? 'backed up automatically' : 'exported',
          entityType: 'export_job',
          entityId: row.id,
          entityLabel: `${job.format} export`,
          version: 1,
          after: { format: job.format, from: input.from, to: input.to, includeAttachments: !!input.includeAttachments },
        });
      }
      await notify(tx, deps, { companyId: job.companyId, userId: job.requestedBy ?? undefined, kind: 'system', title: job.trigger === 'scheduled' ? 'Backup ready' : 'Export ready', body: `${company.name} · ${job.format}`, entityType: 'export_job', entityId: job.id });
      return row;
    });
  } catch (err) {
    // A failed attempt goes back to the queue; the job runner marks the export failed after its last try.
    await deps.db.update(J).set({ status: 'queued', error: String((err as Error).message ?? err).slice(0, 1000) }).where(eq(J.id, job.id));
    throw err;
  }
}

/**
 * The hourly `backups.due` job: queues a json-backup for every company with automatic backups on whose
 * last one is older than its interval. A company with a backup already waiting gets no second one.
 */
export async function queueDueBackups(deps: Pick<Deps, 'db' | 'now'>): Promise<string[]> {
  const now = deps.now();
  const rows = await deps.db
    .select({ companyId: BS.companyId, frequency: BS.frequency, lastBackupAt: BS.lastBackupAt })
    .from(BS)
    .innerJoin(schema.companies, eq(schema.companies.id, BS.companyId))
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.companies.accountId))
    .where(and(eq(BS.automatic, true), isNull(schema.accounts.suspendedAt), isNull(schema.companies.archivedAt)));
  const queued: string[] = [];
  for (const r of rows) {
    if (r.lastBackupAt && now.getTime() - r.lastBackupAt.getTime() < BACKUP_EVERY_MS[r.frequency] - 3_600_000) continue;
    await deps.db.transaction(async (tx) => {
      const exportId = newId('exp');
      const jobId = await enqueue(tx, 'export.build', { exportId }, { uniqueKey: `backup:${r.companyId}`, maxAttempts: 3 });
      if (!jobId) return;
      await tx.insert(J).values({ id: exportId, companyId: r.companyId, format: 'json-backup', status: 'queued', trigger: 'scheduled', requestedBy: null, createdAt: now });
      queued.push(r.companyId);
    });
  }
  return queued;
}

/** The daily `exports.expire` job: deletes the files of exports past their keep-until date. */
export async function deleteExpiredExports(deps: Pick<Deps, 'db' | 'now' | 'providers'>): Promise<number> {
  const rows = await deps.db
    .select({ id: J.id, storageKey: J.storageKey })
    .from(J)
    .where(and(eq(J.status, 'completed'), lt(J.expiresAt, deps.now()), isNotNull(J.storageKey)));
  for (const r of rows) {
    await deps.providers.storage.delete(r.storageKey!);
    await deps.db.update(J).set({ storageKey: null }).where(eq(J.id, r.id));
  }
  return rows.length;
}

/** The export's last try failed: say so on the row, so the app stops waiting. */
export async function failExport(deps: Pick<Deps, 'db' | 'now'>, exportId: string) {
  await deps.db.update(J).set({ status: 'failed', completedAt: deps.now() }).where(and(eq(J.id, exportId), eq(J.status, 'queued')));
}

/** Who the audit trail names: the person who asked, or the account owner for a scheduled backup. */
async function exportActor(db: DbOrTx, job: JobRow): Promise<AuthUser | null> {
  let userId = job.requestedBy;
  if (!userId) {
    const [owner] = await db
      .select({ id: schema.accounts.ownerUserId })
      .from(schema.companies)
      .innerJoin(schema.accounts, eq(schema.accounts.id, schema.companies.accountId))
      .where(eq(schema.companies.id, job.companyId));
    userId = owner?.id ?? null;
  }
  if (!userId) return null;
  const [u] = await db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId));
  const name = job.requestedBy ? (u?.name ?? 'Unknown') : `${u?.name ?? 'Owner'} (scheduled backup)`;
  return { id: userId, accountId: '', name, email: u?.email ?? '', role: 'owner', platformRole: null, status: 'active', locale: null, companyIds: [], branchIds: [], sessionId: '', mfaEnrolled: false, mfaVerified: false };
}

/** Exports: createExport, listExports, getExport, getBackupSettings, saveBackupSettings. */
export const exportsHandlers = defineHandlers({
  /**
   * Queues the export and answers 202 with the job; the `export.build` job makes the file and
   * the app polls getExport. Queued in the same transaction as the job row, so neither exists alone.
   */
  async createExport(ctx) {
    const { format, from, to, includeAttachments } = ctx.body;
    if (from && to && from > to) throw invalid('to', 'The end date is before the start date');
    const job = await ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(J)
        .values({ id: newId('exp'), companyId: ctx.company.id, format, status: 'queued', trigger: 'manual', requestedBy: ctx.user.id, createdAt: ctx.now })
        .returning();
      await enqueue(tx, 'export.build', { exportId: row.id, from, to, includeAttachments: !!includeAttachments }, { maxAttempts: 3 });
      return row;
    });
    return jobToWire(ctx.deps, job, ctx.now, ctx.company.name);
  },

  async listExports(ctx) {
    const rows = await ctx.db.select().from(J).where(eq(J.companyId, ctx.company.id)).orderBy(desc(J.createdAt), desc(J.id)).limit(100);
    return { data: await Promise.all(rows.map((r) => jobToWire(ctx.deps, r, ctx.now, ctx.company.name))) };
  },

  async getExport(ctx) {
    return jobToWire(ctx.deps, await findJob(ctx.db, ctx.company.id, ctx.params.id), ctx.now, ctx.company.name);
  },

  async getBackupSettings(ctx) {
    return backupToWire(await backupSettingsOf(ctx.db, ctx.company.id));
  },

  /** Backing up to Google Drive needs the Drive integration connected first. */
  async saveBackupSettings(ctx) {
    const current = await backupSettingsOf(ctx.db, ctx.company.id);
    const destination = ctx.body.destination ?? current.destination;
    if (destination === 'google-drive' && destination !== current.destination) {
      const [drive] = await ctx.db
        .select({ connected: schema.companyIntegrations.connected })
        .from(schema.companyIntegrations)
        .where(and(eq(schema.companyIntegrations.companyId, ctx.company.id), eq(schema.companyIntegrations.integrationId, 'int_drive')));
      if (!drive?.connected) throw invalid('destination', 'Connect Google Drive under Integrations first', 'INTEGRATION_NOT_CONNECTED');
    }
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(BS)
        .set({
          automatic: ctx.body.automatic ?? current.automatic,
          frequency: ctx.body.frequency ?? current.frequency,
          destination,
          version: current.version + 1,
          updatedAt: ctx.now,
        })
        .where(eq(BS.companyId, ctx.company.id))
        .returning();
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: 'updated',
        entityType: 'backup_settings',
        entityId: ctx.company.id,
        entityLabel: 'Backup settings',
        version: updated.version,
        before: backupToWire(current),
        after: backupToWire(updated),
      });
      return updated;
    });
    return backupToWire(row);
  },
});
