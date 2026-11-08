import { and, eq, gte, inArray, lte, notExists, sql, type SQL } from 'drizzle-orm';
import type { Candidate, Suggestion } from '@esmart/core/domain/bankStatement';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import type { CompanyRow } from '../../context';
import { notFound, unprocessable } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { compact, iso, maybeMoney, money } from '../../lib/wire';

export const L = schema.bankStatementLines;
export const S = schema.bankStatements;
const PAY = schema.payments;
const E = schema.expenses;
const V = schema.vouchers;
const P = schema.parties;

export type AccountRow = typeof schema.paymentAccounts.$inferSelect;
export type LineRow = typeof L.$inferSelect;
export type StatementRow = typeof S.$inferSelect;
export type MatchType = Candidate['type'];

/** Days either side of a line that a record may be dated and still be suggested. */
export const DAY_TOLERANCE = 3;

/** A bank account of this company; 404 when there is none, 422 when it is cash or a wallet. */
export async function bankAccount(db: DbOrTx, company: CompanyRow, id: string, opts: { lock?: boolean } = {}): Promise<AccountRow> {
  const A = schema.paymentAccounts;
  const q = db.select().from(A).where(and(eq(A.companyId, company.id), eq(A.id, id)));
  const [row] = opts.lock ? await q.for('update') : await q;
  if (!row) throw notFound('Payment account');
  if (row.type !== 'bank') throw unprocessable([{ field: 'id', message: `${row.name} is a ${row.type} account; statements are imported into bank accounts`, severity: 'blocking' }], 'NOT_A_BANK_ACCOUNT');
  return row;
}

export const accountKey = (accountId: string) => `pay:${accountId}`;

export type RecordQuery = {
  from?: string;
  to?: string;
  type?: MatchType;
  ids?: string[];
  /** Leave out records matched to a line (dated on or before `asOf`, when given). */
  unmatched?: { asOf?: string };
};

/**
 * The account's payments, expenses and posted vouchers, signed as the bank
 * sees them (+ money in), with what a matcher reads: reference, number and
 * the party's name.
 */
export async function bookRecords(db: DbOrTx, account: AccountRow, q: RecordQuery = {}): Promise<Candidate[]> {
  const companyId = account.companyId;
  if (q.ids && !q.ids.length) return [];
  const free = (type: MatchType, id: typeof PAY.id | typeof E.id) =>
    q.unmatched ? notExists(db.select({ one: sql`1` }).from(L).where(and(eq(L.companyId, companyId), eq(L.accountId, account.id), eq(L.matchType, type), sql`${L.matchId} = ${id}`, q.unmatched.asOf ? lte(L.date, q.unmatched.asOf) : undefined))) : undefined;
  const out: Candidate[] = [];

  if (!q.type || q.type === 'payment') {
    const rows = await db
      .select({ id: PAY.id, number: PAY.number, date: PAY.date, amountMinor: PAY.amountMinor, direction: PAY.direction, reference: PAY.reference, partyName: P.name })
      .from(PAY)
      .leftJoin(P, eq(P.id, PAY.partyId))
      .where(and(eq(PAY.companyId, companyId), eq(PAY.accountId, account.id), q.from ? gte(PAY.date, q.from) : undefined, q.to ? lte(PAY.date, q.to) : undefined, q.ids ? inArray(PAY.id, q.ids) : undefined, free('payment', PAY.id)));
    for (const r of rows) {
      out.push(compact({ type: 'payment' as const, id: r.id, number: r.number, date: r.date, amountMinor: r.direction === 'received' ? r.amountMinor : -r.amountMinor, reference: r.reference, partyName: r.partyName }));
    }
  }

  if (!q.type || q.type === 'expense') {
    const rows = await db
      .select({ id: E.id, number: E.number, date: E.date, amountMinor: E.amountMinor, reference: E.reference, partyName: P.name })
      .from(E)
      .leftJoin(P, eq(P.id, E.supplierId))
      .where(and(eq(E.companyId, companyId), eq(E.accountId, account.id), q.from ? gte(E.date, q.from) : undefined, q.to ? lte(E.date, q.to) : undefined, q.ids ? inArray(E.id, q.ids) : undefined, free('expense', E.id)));
    for (const r of rows) out.push(compact({ type: 'expense' as const, id: r.id, number: r.number, date: r.date, amountMinor: -r.amountMinor, reference: r.reference, partyName: r.partyName }));
  }

  if (!q.type || q.type === 'voucher') {
    const conds: SQL[] = [sql`v.company_id = ${companyId}`, sql`v.status = 'posted'`, sql`l->>'account' = ${accountKey(account.id)}`];
    if (q.from) conds.push(sql`v.date >= ${q.from}`);
    if (q.to) conds.push(sql`v.date <= ${q.to}`);
    if (q.ids) conds.push(sql`v.id in (${sql.join(q.ids.map((i) => sql`${i}`), sql`, `)})`);
    if (q.unmatched) {
      conds.push(
        sql`not exists (select 1 from ${L} m where m.company_id = v.company_id and m.account_id = ${account.id} and m.match_type = 'voucher' and m.match_id = v.id ${q.unmatched.asOf ? sql`and m.date <= ${q.unmatched.asOf}` : sql``})`,
      );
    }
    const res = await db.execute<{ id: string; number: string; date: string; reference: string | null; amount: string }>(sql`
      select v.id, v.number, v.date::text as date, v.reference,
        sum((l->>'debitMinor')::bigint - (l->>'creditMinor')::bigint)::text as amount
      from ${V} v, jsonb_array_elements(v.lines) as l
      where ${sql.join(conds, sql` and `)}
      group by v.id, v.number, v.date, v.reference
      having sum((l->>'debitMinor')::bigint - (l->>'creditMinor')::bigint) <> 0`);
    for (const r of res.rows) out.push(compact({ type: 'voucher' as const, id: r.id, number: r.number, date: r.date, amountMinor: Number(r.amount), reference: r.reference }));
  }
  return out;
}

/** One record of the books, wherever it is, if it is on this account. */
export async function bookRecord(db: DbOrTx, account: AccountRow, type: MatchType, id: string): Promise<Candidate | undefined> {
  const [c] = await bookRecords(db, account, { type, ids: [id] });
  return c;
}

/**
 * Lines whose matched record is gone (deleted, or moved to another
 * account, or a voucher sent back to draft) or no longer the line's amount
 * (edited since) go back to waiting.
 */
export async function releaseOrphans(db: DbOrTx, account: AccountRow, now: Date): Promise<number> {
  // Qualified by hand: an UPDATE may print its columns bare, and a bare account_id inside the
  // subqueries would be the payment's or expense's own.
  const col = (name: string) => sql.raw(`"bank_statement_lines"."${name}"`);
  const released = await db
    .update(L)
    .set({ status: 'unmatched', matchType: null, matchId: null, version: sql`${L.version} + 1`, updatedAt: now })
    .where(
      and(
        eq(L.companyId, account.companyId),
        eq(L.accountId, account.id),
        eq(L.status, 'matched'),
        // Signed as bookRecords signs them (+ money in), so an edited amount reads as a different record.
        sql`not (
          (${col('match_type')} = 'payment' and exists (select 1 from ${PAY} p where p.id = ${col('match_id')} and p.account_id = ${col('account_id')}
                and (case when p.direction = 'received' then p.amount_minor else -p.amount_minor end) = ${col('amount_minor')}))
          or (${col('match_type')} = 'expense' and exists (select 1 from ${E} e where e.id = ${col('match_id')} and e.account_id = ${col('account_id')}
                and -e.amount_minor = ${col('amount_minor')}))
          or (${col('match_type')} = 'voucher' and exists (select 1 from ${V} v where v.id = ${col('match_id')} and v.status = 'posted'
                and (select coalesce(sum((vl->>'debitMinor')::bigint - (vl->>'creditMinor')::bigint), 0) from jsonb_array_elements(v.lines) vl
                     where vl->>'account' = 'pay:' || ${col('account_id')}) = ${col('amount_minor')}))
        )`,
      ),
    )
    .returning({ id: L.id });
  return released.length;
}

export type BankLineRecord = Schema<'BankLineRecord'>;
export type BankLineWire = Schema<'BankStatementLine'>;

export function recordToWire(c: Candidate, currency: string): BankLineRecord {
  return compact({ type: c.type, id: c.id, number: c.number, date: c.date, amount: money(c.amountMinor, currency), reference: c.reference, partyName: c.partyName });
}

export function suggestionToWire(s: Suggestion, currency: string): Schema<'BankLineSuggestion'> {
  return { ...recordToWire(s, currency), score: s.score, referenceHit: s.referenceHit };
}

export function lineToWire(row: LineRow, currency: string, extra: { match?: Candidate; suggestions?: Suggestion[] } = {}): BankLineWire {
  return compact({
    id: row.id,
    statementId: row.statementId,
    accountId: row.accountId,
    date: row.date,
    description: row.description,
    reference: row.reference,
    amount: money(row.amountMinor, currency),
    balance: maybeMoney(row.balanceMinor, currency),
    status: row.status,
    excludedReason: row.status === 'excluded' ? row.excludedReason : null,
    match: extra.match ? recordToWire(extra.match, currency) : undefined,
    suggestions: extra.suggestions?.map((s) => suggestionToWire(s, currency)),
    version: row.version,
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!,
  });
}

export function statementToWire(row: StatementRow, currency: string): Schema<'BankStatement'> {
  return compact({
    id: row.id,
    accountId: row.accountId,
    fileName: row.fileName,
    from: row.fromDate,
    to: row.toDate,
    openingBalance: maybeMoney(row.openingBalanceMinor, currency),
    closingBalance: maybeMoney(row.closingBalanceMinor, currency),
    lineCount: row.lineCount,
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt)!,
  });
}

/** What the books say the account held at the end of `asOf`, in its own currency. */
export async function bookBalanceAsOf(db: DbOrTx, account: AccountRow, asOf: string): Promise<number> {
  const [pays] = await db
    .select({ total: sql<string>`coalesce(sum(case when ${PAY.direction} = 'received' then ${PAY.amountMinor} else -${PAY.amountMinor} end), 0)::text` })
    .from(PAY)
    .where(and(eq(PAY.companyId, account.companyId), eq(PAY.accountId, account.id), lte(PAY.date, asOf)));
  const [spent] = await db
    .select({ total: sql<string>`coalesce(sum(${E.amountMinor}), 0)::text` })
    .from(E)
    .where(and(eq(E.companyId, account.companyId), eq(E.accountId, account.id), lte(E.date, asOf)));
  const moved = await db.execute<{ total: string }>(sql`
    select coalesce(sum((l->>'debitMinor')::bigint - (l->>'creditMinor')::bigint), 0)::text as total
    from ${V} v, jsonb_array_elements(v.lines) as l
    where v.company_id = ${account.companyId} and v.status = 'posted' and v.date <= ${asOf} and l->>'account' = ${accountKey(account.id)}`);
  return account.openingBalanceMinor + Number(pays?.total ?? 0) - Number(spent?.total ?? 0) + Number(moved.rows[0]?.total ?? 0);
}
