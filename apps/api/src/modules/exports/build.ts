import { sql, type SQL } from 'drizzle-orm';
import { strToU8, zipSync } from 'fflate';
import type { Deps } from '../../context';
import type { DbOrTx } from '../../lib/audit';

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

type Scoped = { table: string; columns: string[]; hasDate: boolean; where: (companyId: string) => SQL };

/**
 * Every table that belongs to one company, found from the catalogue: tables
 * with a `company_id`, plus child tables that reach one through a foreign key
 * (document lines through documents, tax components through tax lines…).
 * Binary columns (encrypted secrets) are left out.
 */
async function companyTables(db: DbOrTx): Promise<Map<string, Scoped>> {
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
    if (EXCLUDED.has(table) || !list.some((c) => c.name === 'company_id')) continue;
    add(table, (id) => sql`${sql.identifier('company_id')} = ${id}`);
  }
  // Children of scoped tables, a few levels deep.
  for (let depth = 0; depth < 3; depth++) {
    for (const fk of fks.rows) {
      if (scoped.has(fk.child) || EXCLUDED.has(fk.child) || fk.parent === 'companies') continue;
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

const xml = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** Tally amounts are in major units with two decimals. */
const amount = (minor: number) => (minor / 100).toFixed(2);

type Voucher = {
  id: string;
  kind: 'invoice' | 'purchaseBill';
  number: string;
  supplier_doc_number: string | null;
  date: string;
  party_name: string;
  taxable_minor: string;
  round_off_minor: string;
  grand_total_minor: string;
  charges_minor: string;
  discount_minor: string;
};

/**
 * Sales and purchase vouchers for finalised invoices and bills, in Tally's
 * import envelope. Tally's sign convention: debits are negative with
 * ISDEEMEDPOSITIVE Yes, credits positive with No. Each voucher balances:
 * party = taxable + taxes - document discount + charges + round-off.
 */
async function tallyXml(db: DbOrTx, companyId: string, opts: ExportOptions): Promise<BuiltFile> {
  const range = [opts.from ? sql`and d.date >= ${opts.from}` : sql``, opts.to ? sql`and d.date <= ${opts.to}` : sql``];
  const docs = await db.execute<Voucher>(sql`
    select d.id, d.kind, d.number, d.supplier_doc_number, to_char(d.date, 'YYYYMMDD') as date, p.name as party_name,
           d.taxable_amount_minor as taxable_minor, d.round_off_minor, d.grand_total_minor, d.charges_minor,
           d.document_discount_minor as discount_minor
    from documents d join parties p on p.id = d.party_id
    where d.company_id = ${companyId} and d.kind in ('invoice', 'purchaseBill')
      and d.status not in ('draft', 'cancelled', 'rejected') ${range[0]} ${range[1]}
    order by d.date, d.number`);
  const taxes = await db.execute<{ document_id: string; type: string; amount_minor: string }>(sql`
    select tl.document_id, tc.type, sum(tc.amount_minor)::bigint as amount_minor
    from document_tax_components tc join document_tax_lines tl on tl.id = tc.tax_line_id
    join documents d on d.id = tl.document_id
    where d.company_id = ${companyId}
    group by tl.document_id, tc.type`);
  const [company] = (await db.execute<{ name: string }>(sql`select name from companies where id = ${companyId}`)).rows;

  const taxBy = new Map<string, { type: string; minor: number }[]>();
  for (const t of taxes.rows) {
    if (!taxBy.has(t.document_id)) taxBy.set(t.document_id, []);
    taxBy.get(t.document_id)!.push({ type: t.type, minor: Number(t.amount_minor) });
  }

  const entry = (ledger: string, debit: boolean, minor: number, isParty = false) =>
    `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>` +
    `${isParty ? '<ISPARTYLEDGER>Yes</ISPARTYLEDGER>' : ''}<AMOUNT>${amount(debit ? -minor : minor)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;

  const vouchers = docs.rows.map((d) => {
    const sale = d.kind === 'invoice';
    const type = sale ? 'Sales' : 'Purchase';
    // A sale debits the customer and credits income and output tax; a purchase the reverse.
    const partyDebit = sale;
    const lines = [entry(d.party_name, partyDebit, Number(d.grand_total_minor), true), entry(sale ? 'Sales' : 'Purchase', !partyDebit, Number(d.taxable_minor))];
    if (Number(d.charges_minor)) lines.push(entry(sale ? 'Other Charges' : 'Freight Inward', !partyDebit, Number(d.charges_minor)));
    for (const t of taxBy.get(d.id) ?? []) if (t.minor) lines.push(entry(`${sale ? 'Output' : 'Input'} ${t.type}`, !partyDebit, t.minor));
    // Discount allowed on a sale is a debit; discount received on a purchase a credit.
    if (Number(d.discount_minor)) lines.push(entry(sale ? 'Discount Allowed' : 'Discount Received', partyDebit, Number(d.discount_minor)));
    const round = Number(d.round_off_minor);
    // Round-off moves the same way as income when it is positive.
    if (round) lines.push(entry('Round Off', round > 0 ? !partyDebit : partyDebit, Math.abs(round)));
    return (
      `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type}" ACTION="Create" REMOTEID="${xml(d.id)}">` +
      `<DATE>${d.date}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${xml(d.number)}</VOUCHERNUMBER>` +
      `${!sale && d.supplier_doc_number ? `<REFERENCE>${xml(d.supplier_doc_number)}</REFERENCE>` : ''}` +
      `<PARTYLEDGERNAME>${xml(d.party_name)}</PARTYLEDGERNAME><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>` +
      `${lines.join('')}</VOUCHER></TALLYMESSAGE>`
    );
  });

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA>' +
    `<REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xml(company?.name)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>` +
    `<REQUESTDATA>${vouchers.join('\n')}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`;
  return { body: Buffer.from(body), contentType: 'application/xml', extension: 'xml' };
}

export function buildExport(db: DbOrTx, deps: Deps, format: ExportFormat, companyId: string, opts: ExportOptions, now: Date): Promise<BuiltFile> {
  if (format === 'json-backup') return jsonBackup(db, deps, companyId, opts, now);
  if (format === 'csv-zip') return csvZip(db, deps, companyId, opts);
  return tallyXml(db, companyId, opts);
}
