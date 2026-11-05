import { spawn } from 'node:child_process';
import type { Deps } from '../context';

const PREFIX = 'db-backups/';
const KEEP_DAYS = 30;

/** `pg_dump --format=custom` of the whole database, into memory. Needs the PostgreSQL client in the image. */
function dump(databaseUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', databaseUrl], { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    child.stdout.on('data', (c: Buffer) => out.push(c));
    child.stderr.on('data', (c: Buffer) => (err += c.toString()));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`pg_dump exited ${code}: ${err.slice(0, 500)}`))));
  });
}

/**
 * The nightly `db.backup` job: a second copy of the database beside Railway's own backups, in object
 * storage under `db-backups/`, kept 30 days. Off unless DB_BACKUP_ENABLED (it needs pg_dump).
 * Restore: `pg_restore --clean --no-owner -d <url> <file>` (docs/RUNBOOK.md).
 */
export async function backupDatabase(deps: Pick<Deps, 'config' | 'providers' | 'now'>): Promise<{ key: string; bytes: number; removed: number }> {
  const now = deps.now();
  const body = await dump(deps.config.DATABASE_URL);
  if (body.length < 1024) throw new Error(`pg_dump produced only ${body.length} bytes`);
  const key = `${PREFIX}${now.toISOString().slice(0, 10)}.dump`;
  await deps.providers.storage.put(key, body, 'application/octet-stream');
  // Older than 30 days, by the date in the name.
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const old = (await deps.providers.storage.list(PREFIX)).filter((k) => k.slice(PREFIX.length, PREFIX.length + 10) < cutoff);
  for (const k of old) await deps.providers.storage.delete(k);
  return { key, bytes: body.length, removed: old.length };
}
