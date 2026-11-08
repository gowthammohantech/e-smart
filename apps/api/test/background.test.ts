import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { companyTables } from '../src/modules/exports/build';
import { deleteExpiredExports, queueDueBackups } from '../src/modules/exports/handlers';
import { purgeAccount } from '../src/modules/platform/purge';
import { tickSchedules } from '../src/jobs/schedule';
import { SCHEDULES } from '../src/jobs/registry';
import { setupApi } from './helpers';
import { fundCash, issueInvoice, moneySetup } from './money-fixtures';

const t = setupApi();
const E = schema.exportJobs;

describe('scheduled work', () => {
  it('makes the day’s recurring expenses once, from the schedule, however often it ticks', async () => {
    const m = await moneySetup(t);
    await fundCash(t, m);
    const [cat] = await t.deps.db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, m.companyId));
    const tpl = await t.post(`${m.c}/expenses`, { categoryId: cat.id, date: '2026-09-20', amount: { minor: 5000, currency: 'INR' }, currency: 'INR', accountId: m.cash.id, method: 'cash', recurrence: 'weekly' }, { token: m.token });
    // 00:15 IST on 2026-09-28, the day after it fell due.
    t.setNow('2026-09-27T18:45:00Z');
    await tickSchedules(t.deps, SCHEDULES);
    await tickSchedules(t.deps, SCHEDULES);
    await t.runJobs();
    const made = async () => (await t.deps.db.select().from(schema.expenses).where(eq(schema.expenses.recurringParentId, tpl.body.id))).map((e) => e.date).sort();
    const first = await made();
    // Caught up to the day it ran, one per week, starting with the one that fell due.
    expect(first[0]).toBe('2026-09-27');
    expect(new Set(first).size).toBe(first.length);
    // The same day ticks again: no second job, no new expenses.
    await tickSchedules(t.deps, SCHEDULES);
    await t.runJobs();
    expect(await made()).toEqual(first);
  });

  it('backs up a company on its schedule, not again within the interval, and never twice at once', async () => {
    const m = await moneySetup(t);
    await t.put(`${m.c}/backup-settings`, { automatic: true, frequency: 'weekly', destination: 'elixir-cloud' }, { token: m.token });
    t.setNow(new Date());
    expect(await queueDueBackups(t.deps)).toEqual([m.companyId]);
    // Still waiting: no second one.
    expect(await queueDueBackups(t.deps)).toEqual([]);
    await t.runJobs();
    const [job] = await t.deps.db.select().from(E).where(eq(E.companyId, m.companyId));
    expect(job).toMatchObject({ format: 'json-backup', trigger: 'scheduled', status: 'completed' });
    // Kept 35 days, longer than a week.
    expect(job.expiresAt!.getTime() - job.completedAt!.getTime()).toBe(35 * 86_400_000);
    // Done this week: nothing until next week.
    expect(await queueDueBackups(t.deps)).toEqual([]);
    t.setNow(new Date(Date.now() + 7 * 86_400_000));
    expect(await queueDueBackups(t.deps)).toEqual([m.companyId]);
  });

  it('skips suspended accounts', async () => {
    const m = await moneySetup(t);
    await t.put(`${m.c}/backup-settings`, { automatic: true, frequency: 'daily', destination: 'elixir-cloud' }, { token: m.token });
    await t.deps.db.update(schema.accounts).set({ suspendedAt: new Date(), suspendedReason: 'test' }).where(eq(schema.accounts.id, m.user.accountId!));
    expect(await queueDueBackups(t.deps)).toEqual([]);
  });

  it('deletes export files once they expire', async () => {
    const m = await moneySetup(t);
    const res = await t.post(`${m.c}/exports`, { format: 'csv-zip' }, { token: m.token });
    await t.runJobs();
    const [job] = await t.deps.db.select().from(E).where(eq(E.id, res.body.id));
    expect(await t.deps.providers.storage.head(job.storageKey!)).not.toBeNull();
    t.setNow(new Date(job.expiresAt!.getTime() + 1000));
    expect(await deleteExpiredExports(t.deps)).toBe(1);
    expect(await t.deps.providers.storage.head(job.storageKey!)).toBeNull();
    expect((await t.deps.db.select().from(E).where(eq(E.id, res.body.id)))[0].storageKey).toBeNull();
  });
});

describe('closed-account purge', () => {
  async function closedAccount() {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    await t.post(`${m.c}/documents/${inv.id}/share-link`, {}, { token: m.token });
    await t.post(`${m.c}/exports`, { format: 'json-backup' }, { token: m.token });
    await t.runJobs();
    expect((await t.post('/me/delete', { confirm: 'DELETE', password: m.password }, { token: m.token })).status).toBe(204);
    return m;
  }

  it('only counts in a dry run', async () => {
    const m = await closedAccount();
    const plan = await purgeAccount(t.deps, m.user.accountId!, { dryRun: true });
    expect(plan.companies).toEqual([m.companyId]);
    expect(plan.rows.documents).toBeGreaterThan(0);
    expect(plan.objects.length).toBeGreaterThan(0);
    expect(await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.companyId))).toHaveLength(1);
  });

  it('erases every row and file of the account’s businesses, and keeps a tombstone', async () => {
    const m = await closedAccount();
    const before = await purgeAccount(t.deps, m.user.accountId!, { dryRun: true });
    const plan = await purgeAccount(t.deps, m.user.accountId!, { dryRun: false });
    expect(plan.rows).toEqual(before.rows);
    // Every table the purge knows about, children included, is empty for that company.
    for (const scoped of (await companyTables(t.deps.db, new Set(['accounts', 'users', 'webhook_events', 'platform_audit_events']))).values()) {
      const left = await t.deps.db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(scoped.table)} where ${scoped.where(m.companyId)}`);
      expect([scoped.table, Number(left.rows[0].n)]).toEqual([scoped.table, 0]);
    }
    expect(await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.companyId))).toHaveLength(0);
    for (const key of plan.objects) expect(await t.deps.providers.storage.head(key)).toBeNull();
    const [account] = await t.deps.db.select().from(schema.accounts).where(eq(schema.accounts.id, m.user.accountId!));
    expect(account).toMatchObject({ suspendedReason: 'purged', purgeAfter: null });
    const audit = await t.deps.db.select().from(schema.platformAuditEvents).where(eq(schema.platformAuditEvents.targetId, m.user.accountId!));
    expect(audit.map((a) => a.action)).toContain('account.purged');
  });
});

describe('database backup', () => {
  it('stores the dump by date and drops the ones older than 30 days', async () => {
    const { mkdtempSync, writeFileSync, chmodSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    // A stand-in pg_dump: 4 KB of output.
    const bin = mkdtempSync(join(tmpdir(), 'pgdump-'));
    writeFileSync(join(bin, 'pg_dump'), '#!/bin/sh\nhead -c 4096 /dev/zero\n');
    chmodSync(join(bin, 'pg_dump'), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${bin}:${path}`;
    try {
      const storage = t.deps.providers.storage;
      await storage.put('db-backups/2026-09-01.dump', Buffer.from('old'), 'application/octet-stream');
      await storage.put('db-backups/2026-10-30.dump', Buffer.from('recent'), 'application/octet-stream');
      t.setNow('2026-11-03T20:30:00Z');
      const { backupDatabase } = await import('../src/jobs/dbBackup');
      const done = await backupDatabase(t.deps);
      expect(done).toMatchObject({ key: 'db-backups/2026-11-03.dump', bytes: 4096, removed: 1 });
      expect((await storage.list('db-backups/')).sort()).toEqual(['db-backups/2026-10-30.dump', 'db-backups/2026-11-03.dump']);
    } finally {
      process.env.PATH = path;
    }
  });
});
