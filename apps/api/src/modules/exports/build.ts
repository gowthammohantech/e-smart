import { sql, type SQL } from 'drizzle-orm';
import { strToU8, zipSync } from 'fflate';
import type { Deps } from '../../context';
import type { DbOrTx } from '../../lib/audit';
import { tallyXml } from './tally';

type Row = Record<string, unknown>;
export type ExportFormat = 'json-backup' | 'csv-zip' | 'tally-xml';
export type ExportOptions = { from?: string; to?: string; includeAttachments?: boolean };
export type BuiltFile = { body: Buffer; contentType: string; extension: string };

/**
 * Operational tables and anything holding secrets or other people's
 * credentials stay out of a backup even when they reference the company.
 */
const EXCLUDED = new Set([
  'accounts',
  'users',
  'invites',
  'device_sessions',
  'push_tokens',
  'password_reset_tokens',
  'otp_requests',
  'idempotency_keys',
  'client_id_mappings',
  'sync_mutations',
  'change_log',
  'export_jobs',
  'compliance_credentials',
  // The taxpayer's GST portal session: a live credential, never in a backup.
  'gst_portal_sessions',
  'webhook_events',
]);

/** The tables a CSV export covers: the records people work with. */
const MAIN_TABLES = [
  'branches',
  'parties',
  'items',
  'tax_categories',
  'expense_categories',
  'payment_accounts',
  'documents',
  'document_lines',
  'payments',
  'payment_allocations',
  'expenses',
  'stock_movements',
];

export type Scoped = { table: string; columns: string[]; hasDate: boolean; where: (companyId: string) => SQL };

/**
 * Every table that belongs to one company, found from the catalogue: tables
 * with a `company_id`, plus child tables that reach one through a foreign key
 * (document lines through documents, tax components through tax lines…).
 * Binary columns (encrypted secrets) are left out.
 */
export async function companyTables(db: DbOrTx, excluded: Set<string> = EXCLUDED): Promise<Map<string, Scoped>> {
  const cols = await db.execute<{ table_name: string; column_name: string; data_type: string }>(sql`
    select table_name, column_name, data_type from information_schema.columns
    where table_schema = 'public' order by table_name, ordinal_position`);
  const fks = await db.execute<{ child: string; child_col: string; parent: string; parent_col: string }>(sql`
    select c.relname as child, a.attname as child_col, p.relname as parent, pa.attname as parent_col
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_class p on p.oid = k.confrelid
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    join pg_attribute pa on pa.attrelid = k.confrelid and pa.attnum = k.confkey[1]
    join pg_namespace n on n.oid = c.relnamespace
    where k.contype = 'f' and array_length(k.conkey, 1) = 1 and n.nspname = 'public'`);

  const columns = new Map<string, { name: string; type: string }[]>();
  for (const r of cols.rows) {
    if (!columns.has(r.table_name)) columns.set(r.table_name, []);
    columns.get(r.table_name)!.push({ name: r.column_name, type: r.data_type });
  }
  const scoped = new Map<string, Scoped>();
  const add = (table: string, where: (companyId: string) => SQL) => {
    const list = columns.get(table) ?? [];
    scoped.set(table, { table, columns: list.filter((c) => c.type !== 'bytea').map((c) => c.name), hasDate: list.some((c) => c.name === 'date'), where });
  };
  for (const [table, list] of columns) {
    if (excluded.has(table) || !list.some((c) => c.name === 'company_id')) continue;
    add(table, (id) => sql`${sql.identifier('company_id')} = ${id}`);
  }
  // Children of scoped tables, a few levels deep.
  for (let depth = 0; depth < 3; depth++) {
    for (const fk of fks.rows) {
      if (scoped.has(fk.child) || excluded.has(fk.child) || fk.parent === 'companies') continue;
      const parent = scoped.get(fk.parent);
      if (!parent || columns.get(fk.child)?.some((c) => c.name === 'company_id')) continue;
      add(fk.child, (id) => sql`${sql.identifier(fk.child_col)} in (select ${sql.identifier(fk.parent_col)} from ${sql.identifier(fk.parent)} where ${parent.where(id)})`);
    }
  }
  return scoped;
}

async function rowsOf(db: DbOrTx, s: Scoped, companyId: string, range?: ExportOptions): Promise<Row[]> {
  const conditions = [s.where(companyId)];
  if (s.hasDate && range?.from) conditions.push(sql`${sql.identifier('date')} >= ${range.from}`);
  if (s.hasDate && range?.to) conditions.push(sql`${sql.identifier('date')} <= ${range.to}`);
  const res = await db.execute<Row>(sql`
    select ${sql.join(s.columns.map((c) => sql.identifier(c)), sql`, `)}
    from ${sql.identifier(s.table)}
    where ${sql.join(conditions, sql` and `)}
    order by 1`);
  return res.rows;
}

async function attachmentFiles(deps: Deps, rows: Row[]): Promise<{ id: string; name: string; body: Buffer }[]> {
  const out: { id: string; name: string; body: Buffer }[] = [];
  for (const a of rows) {
    const body = await deps.providers.storage.get(String(a.storage_key));
    if (body) out.push({ id: String(a.id), name: String(a.name), body });
  }
  return out;
}

/** Everything the company owns, table by table, as JSON. */
async function jsonBackup(db: DbOrTx, deps: Deps, companyId: string, opts: ExportOptions, now: Date): Promise<BuiltFile> {
  const tables = await companyTables(db);
  const company = await db.execute<Row>(sql`select * from companies where id = ${companyId}`);
  const data: Record<string, Row[]> = {};
  for (const name of [...tables.keys()].sort()) data[name] = await rowsOf(db, tables.get(name)!, companyId);
  const backup: Record<string, unknown> = { format: 'elixir-books-backup', formatVersion: 1, exportedAt: now.toISOString(), company: company.rows[0], tables: data };
  if (opts.includeAttachments) {
    backup.attachmentFiles = (await attachmentFiles(deps, data.attachments ?? [])).map((f) => ({ id: f.id, name: f.name, base64: f.body.toString('base64') }));
  }
  return { body: Buffer.from(JSON.stringify(backup, null, 2)), contentType: 'application/json', extension: 'json' };
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: Row[]): string {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';
}

/** One CSV per main table, zipped. Dated tables honour `from`/`to`. */
async function csvZip(db: DbOrTx, deps: Deps, companyId: string, opts: ExportOptions): Promise<BuiltFile> {
  const tables = await companyTables(db);
  const files: Record<string, Uint8Array> = {};
  for (const name of MAIN_TABLES) {
    const s = tables.get(name);
    if (!s) continue;
    // Lines follow their document's date range.
    const range = name === 'document_lines' || name === 'payment_allocations' ? undefined : opts;
    let rows = await rowsOf(db, s, companyId, range);
    if (name === 'document_lines' && (opts.from || opts.to)) {
      const docs = new Set((await rowsOf(db, tables.get('documents')!, companyId, opts)).map((d) => d.id));
      rows = rows.filter((r) => docs.has(r.document_id));
    }
    if (name === 'payment_allocations' && (opts.from || opts.to)) {
      const pays = new Set((await rowsOf(db, tables.get('payments')!, companyId, opts)).map((p) => p.id));
      rows = rows.filter((r) => pays.has(r.payment_id));
    }
    files[`${name}.csv`] = strToU8(toCsv(s.columns, rows));
  }
  if (opts.includeAttachments && tables.has('attachments')) {
    for (const f of await attachmentFiles(deps, await rowsOf(db, tables.get('attachments')!, companyId))) {
      files[`attachments/${f.id}-${f.name.replace(/[/\\]/g, '_')}`] = new Uint8Array(f.body);
    }
  }
  return { body: Buffer.from(zipSync(files)), contentType: 'application/zip', extension: 'zip' };
}

export function buildExport(db: DbOrTx, deps: Deps, format: ExportFormat, companyId: string, opts: ExportOptions, now: Date): Promise<BuiltFile> {
  if (format === 'json-backup') return jsonBackup(db, deps, companyId, opts, now);
  if (format === 'csv-zip') return csvZip(db, deps, companyId, opts);
  return tallyXml(db, companyId, opts, now);
}
