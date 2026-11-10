import { and, desc, eq, gte, inArray, isNotNull, lte, min, ne, sql } from 'drizzle-orm';
import { autoMatch, lineKey, suggestMatches, type Candidate, type MatchableLine } from '@esmart/core/domain/bankStatement';
import { buysFrom, sellsTo } from '@esmart/core/domain/partyKinds';
import { FULL_PLAN, hasModule } from '@esmart/core/domain/plan';
import { addDaysISO, businessDate } from '@esmart/core/lib/date';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import { defineHandlers, type Ctx } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { conflict, invalid, notFound, planUpgradeRequired, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import { keyset } from '../../http/pagination';
import { sizeBucket } from '@esmart/core/analytics/events';
import { track } from '../../analytics/track';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { assignNumber } from '../../lib/numbering';
import { money } from '../../lib/wire';
import { voucherColumns, voucherToWire } from '../books/handlers';
import { assertPeriodOpen } from '../documents/lifecycle';
import { prepare as prepareExpense } from '../expenses/handlers';
import { assertAccountCovers } from '../expenses/engine';
import { expensesToWire } from '../expenses/wire';
import { assertDirectionAllowed, writePayment } from '../payments/engine';
import { paymentsToWire } from '../payments/wire';
import {
  DAY_TOLERANCE,
  L,
  accountKey,
  S,
  bankAccount,
  bookBalanceAsOf,
  bookRecord,
  bookRecords,
  lineToWire,
  recordToWire,
  releaseOrphans,
  statementToWire,
  type AccountRow,
  type LineRow,
  type MatchType,
} from './engine';
import { statementRows } from './parse';

/** How far either side of a line's date Find looks. */
const FIND_DAYS = 30;

type AnyCtx = Pick<Ctx<'matchBankLine'>, 'company' | 'user' | 'db' | 'now' | 'req' | 'reply' | 'deps'>;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const amountText = (minor: number, currency: string) => `${currency} ${(Math.abs(minor) / 100).toFixed(2)}${minor < 0 ? ' out' : ' in'}`;
const labelOf = (line: LineRow) => `${line.date} ${line.description}`.slice(0, 200);

/** A bank line of this company, or 404. */
async function findLine(ctx: Pick<AnyCtx, 'company'>, db: DbOrTx, id: string, lock = false): Promise<LineRow> {
  const q = db.select().from(L).where(and(eq(L.companyId, ctx.company.id), eq(L.id, id)));
  const [row] = lock ? await q.for('update') : await q;
  if (!row) throw notFound('Bank line');
  return row;
}

const isUniqueViolation = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === '23505' || err?.cause?.code === '23505';
};

/** Writes a line's new state, at its version, and audits it. */
async function setLine(
  tx: DbOrTx,
  ctx: AnyCtx,
  line: LineRow,
  action: string,
  next: Pick<LineRow, 'status' | 'matchType' | 'matchId' | 'excludedReason'>,
): Promise<LineRow> {
  let updated: LineRow | undefined;
  try {
    [updated] = await tx
      .update(L)
      .set({ ...next, version: line.version + 1, updatedAt: ctx.now })
      .where(and(eq(L.id, line.id), eq(L.version, line.version)))
      .returning();
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('ALREADY_MATCHED', 'That record is already matched to another bank line');
    throw e;
  }
  if (!updated) throw preconditionFailed();
  await recordChange(tx, ctx.user, {
    companyId: ctx.company.id,
    action,
    entityType: 'bankStatementLine',
    entityId: line.id,
    entityLabel: labelOf(line),
    version: updated.version,
    before: { status: line.status, matchType: line.matchType, matchId: line.matchId },
    after: { status: updated.status, matchType: updated.matchType, matchId: updated.matchId, excludedReason: updated.excludedReason },
  });
  return updated;
}

/**
 * Matches a line to a record of its account, after the checks every way of matching shares.
 * A record is matched once per account: a contra between two banks has a line on each.
 */
async function matchTo(tx: DbOrTx, ctx: AnyCtx, line: LineRow, account: AccountRow, type: MatchType, id: string, action = 'matched'): Promise<{ line: LineRow; record: Candidate }> {
  const record = await bookRecord(tx, account, type, id);
  if (!record) throw invalid('id', `No such ${type} on ${account.name}`);
  const cur = account.currency.trim();
  if (record.amountMinor !== line.amountMinor) {
    throw invalid('id', `${record.number ?? 'That record'} is ${amountText(record.amountMinor, cur)}; the bank line is ${amountText(line.amountMinor, cur)}`, 'MATCH_AMOUNT_DIFFERS');
  }
  if (line.status === 'matched' && line.matchType === type && line.matchId === id) return { line, record };
  const [other] = await tx
    .select({ id: L.id, date: L.date })
    .from(L)
    .where(and(eq(L.companyId, ctx.company.id), eq(L.accountId, line.accountId), eq(L.matchType, type), eq(L.matchId, id), ne(L.id, line.id)));
  if (other) throw conflict('ALREADY_MATCHED', `${record.number ?? 'That record'} is already matched to the bank line of ${other.date}`);
  const updated = await setLine(tx, ctx, line, action, { status: 'matched', matchType: type, matchId: id, excludedReason: null });
  return { line: updated, record };
}

/** The lines as the wire shows them: a matched line with its record, an unmatched one with suggestions. */
async function decorate(db: DbOrTx, account: AccountRow, rows: LineRow[], suggestions = 3) {
  const cur = account.currency.trim();
  const records = new Map<string, Candidate>();
  for (const type of ['payment', 'expense', 'voucher'] as const) {
    const ids = rows.filter((r) => r.status === 'matched' && r.matchType === type).map((r) => r.matchId!);
    if (ids.length) for (const c of await bookRecords(db, account, { type, ids })) records.set(`${type}:${c.id}`, c);
  }
  const waiting = rows.filter((r) => r.status === 'unmatched');
  let candidates: Candidate[] = [];
  if (waiting.length && suggestions) {
    const dates = waiting.map((r) => r.date).sort();
    candidates = await bookRecords(db, account, { from: addDaysISO(dates[0], -DAY_TOLERANCE), to: addDaysISO(dates[dates.length - 1], DAY_TOLERANCE), unmatched: {} });
  }
  return rows.map((r) =>
    lineToWire(r, cur, {
      match: r.status === 'matched' ? records.get(`${r.matchType}:${r.matchId}`) : undefined,
      suggestions: r.status === 'unmatched' && suggestions ? suggestMatches({ ...r, reference: r.reference ?? undefined }, candidates, { dayTolerance: DAY_TOLERANCE, limit: suggestions }) : undefined,
    }),
  );
}

/** The last running balance the bank printed on or before `asOf` (any day, without it). */
async function statementBalance(db: DbOrTx, account: AccountRow, asOf?: string) {
  const [row] = await db
    .select({ date: L.date, balanceMinor: L.balanceMinor })
    .from(L)
    .where(and(eq(L.companyId, account.companyId), eq(L.accountId, account.id), isNotNull(L.balanceMinor), asOf ? lte(L.date, asOf) : undefined))
    .orderBy(desc(L.date), desc(L.createdAt), desc(L.position))
    .limit(1);
  return row;
}

type ImportLine = Schema<'BankStatementImport'>['lines'][number];

/**
 * Bank statements: parseBankStatement, importBankStatement, listBankLines,
 * summarizeBankLines, matchBankLine, unmatchBankLine, excludeBankLine,
 * includeBankLine, createPaymentFromBankLine, createExpenseFromBankLine,
 * getBankReconciliation.
 */
export const bankingHandlers = defineHandlers({
  async parseBankStatement(ctx) {
    return { rows: await statementRows(ctx.body.fileName, ctx.body.contentBase64) };
  },

  async listBankStatements(ctx) {
    const account = await bankAccount(ctx.db, ctx.company, ctx.params.id);
    const cur = account.currency.trim();
    const rows = await ctx.db.select().from(S).where(and(eq(S.companyId, ctx.company.id), eq(S.accountId, account.id))).orderBy(desc(S.createdAt), desc(S.id));
    const counts = rows.length
      ? await ctx.db
          .select({ statementId: L.statementId, status: L.status, n: sql<number>`count(*)::int` })
          .from(L)
          .where(and(eq(L.companyId, ctx.company.id), inArray(L.statementId, rows.map((r) => r.id))))
          .groupBy(L.statementId, L.status)
      : [];
    const n = (id: string, status: string) => counts.find((c) => c.statementId === id && c.status === status)?.n ?? 0;
    return { data: rows.map((r) => ({ ...statementToWire(r, cur), unmatched: n(r.id, 'unmatched'), matched: n(r.id, 'matched'), excluded: n(r.id, 'excluded') })) };
  },

  async removeBankStatement(ctx) {
    const [row] = await ctx.db.select().from(S).where(and(eq(S.companyId, ctx.company.id), eq(S.id, ctx.params.id)));
    if (!row) throw notFound('Bank statement');
    await bankAccount(ctx.db, ctx.company, row.accountId);
    await ctx.db.transaction(async (tx) => {
      // A later import over the same days skipped the lines this one already had; taking this one away
      // would leave those days with no lines at all. The later one goes first.
      const [later] = await tx
        .select({ fileName: S.fileName, from: S.fromDate, to: S.toDate })
        .from(S)
        .where(and(eq(S.companyId, ctx.company.id), eq(S.accountId, row.accountId), ne(S.id, row.id), sql`(${S.createdAt}, ${S.id}) > (${row.createdAt}, ${row.id})`, lte(S.fromDate, row.toDate), gte(S.toDate, row.fromDate)))
        .orderBy(desc(S.createdAt))
        .limit(1);
      if (later) throw conflict('LATER_IMPORT_OVERLAPS', `${later.fileName} (${later.from} to ${later.to}) was imported after this one over some of the same days; undo it first`);
      await tx.delete(L).where(and(eq(L.companyId, ctx.company.id), eq(L.statementId, row.id)));
      await tx.delete(S).where(eq(S.id, row.id));
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'deleted', entityType: 'bank_statement', entityId: row.id, entityLabel: row.fileName ?? row.id, version: 1, deleted: true });
    });
    return undefined;
  },

  async importBankStatement(ctx) {
    const body = ctx.body;
    const account = await bankAccount(ctx.db, ctx.company, ctx.params.id);
    const cur = account.currency.trim();
    const issues: Issue[] = [];
    body.lines.forEach((l: ImportLine, i: number) => {
      if (l.amount.currency !== cur) issues.push({ field: `lines[${i}].amount.currency`, message: `Must be in ${account.name}'s currency (${cur})`, severity: 'blocking' });
      if (l.balance && l.balance.currency !== cur) issues.push({ field: `lines[${i}].balance.currency`, message: `Must be in ${account.name}'s currency (${cur})`, severity: 'blocking' });
      if (!l.amount.minor) issues.push({ field: `lines[${i}].amount.minor`, message: 'A line moves money in or out; it cannot be zero', severity: 'blocking' });
    });
    if (issues.length) throw unprocessable(issues, issues.some((i) => i.field?.endsWith('currency')) ? 'CURRENCY_MISMATCH' : 'VALIDATION_FAILED');

    const lines = body.lines.map((l: ImportLine) => ({
      date: l.date,
      description: squash(l.description),
      reference: squash(l.reference ?? '').slice(0, 100) || undefined,
      amountMinor: l.amount.minor,
      balanceMinor: l.balance?.minor,
    }));
    // Identical lines in one file are told apart by their place among their twins.
    const seen = new Map<string, number>();
    const keys = lines.map((l) => {
      const base = lineKey(l);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return lineKey(l, n);
    });
    // Banks list oldest first or newest first; positions run oldest first either way.
    const newestFirst = lines[0].date > lines[lines.length - 1].date;
    const chrono = lines.map((_, i) => (newestFirst ? lines.length - 1 - i : i));
    const dates = lines.map((l) => l.date).sort();
    const from = dates[0];
    const to = dates[dates.length - 1];

    const result = await ctx.db.transaction(async (tx) => {
      // One import at a time per account, so two uploads of one file can't both add it.
      await bankAccount(tx, ctx.company, account.id, { lock: true });
      const existing = new Set<string>();
      for (let i = 0; i < keys.length; i += 1000) {
        const chunk = keys.slice(i, i + 1000);
        const found = await tx.select({ key: L.lineKey }).from(L).where(and(eq(L.accountId, account.id), inArray(L.lineKey, chunk)));
        for (const f of found) existing.add(f.key);
      }
      const fresh = lines.map((_, i) => i).filter((i) => !existing.has(keys[i]));
      if (!body.dryRun) await releaseOrphans(tx, account, ctx.now);
      const candidates = fresh.length ? await bookRecords(tx, account, { from: addDaysISO(from, -DAY_TOLERANCE), to: addDaysISO(to, DAY_TOLERANCE), unmatched: {} }) : [];
      const matches = autoMatch(
        fresh.map((i): MatchableLine => ({ row: i, ...lines[i] })),
        candidates,
        { dayTolerance: DAY_TOLERANCE },
      );
      const preview = lines.map((l, i) => ({
        date: l.date,
        description: l.description,
        ...(l.reference && { reference: l.reference }),
        amount: money(l.amountMinor, cur),
        ...(l.balanceMinor !== undefined && { balance: money(l.balanceMinor, cur) }),
        duplicate: existing.has(keys[i]),
      }));
      const counts = { imported: fresh.length, duplicates: lines.length - fresh.length, autoMatched: matches.size };
      if (body.dryRun) return { ...counts, lines: preview };
      // The same file again (a second upload, a double tap): nothing new, so no empty statement either.
      if (!fresh.length) return { ...counts, lines: preview };

      const first = lines[chrono[0]];
      const last = lines[chrono[chrono.length - 1]];
      const [statement] = await tx
        .insert(S)
        .values({
          id: newId('bst'),
          companyId: ctx.company.id,
          accountId: account.id,
          fileName: body.fileName.trim().slice(0, 200),
          fromDate: from,
          toDate: to,
          openingBalanceMinor: first.balanceMinor !== undefined ? first.balanceMinor - first.amountMinor : null,
          closingBalanceMinor: last.balanceMinor ?? null,
          lineCount: fresh.length,
          createdBy: ctx.user.id,
          createdAt: ctx.now,
        })
        .returning();
      const position = new Map(chrono.map((fileIndex, order) => [fileIndex, order]));
      for (let i = 0; i < fresh.length; i += 1000) {
        const values = fresh.slice(i, i + 1000).map((fi) => {
          const l = lines[fi];
          const m = matches.get(fi);
          return {
            id: newId('bsl'),
            companyId: ctx.company.id,
            statementId: statement.id,
            accountId: account.id,
            position: position.get(fi)!,
            date: l.date,
            description: l.description,
            reference: l.reference ?? null,
            amountMinor: l.amountMinor,
            balanceMinor: l.balanceMinor ?? null,
            status: m ? ('matched' as const) : ('unmatched' as const),
            matchType: m?.type ?? null,
            matchId: m?.id ?? null,
            lineKey: keys[fi],
            createdAt: ctx.now,
            updatedAt: ctx.now,
          };
        });
        await tx.insert(L).values(values);
      }
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: 'imported',
        entityType: 'bankStatement',
        entityId: statement.id,
        entityLabel: `${account.name}: ${statement.fileName}`,
        version: 1,
        after: { accountId: account.id, from, to, ...counts },
      });
      return { statement: statementToWire(statement, cur), ...counts, lines: preview };
    });
    if (!body.dryRun) {
      void ctx.reply.status(201);
      track(ctx, 'bank_statement_imported', { lines: sizeBucket(result.imported) });
    }
    return result;
  },

  async listBankLines(ctx) {
    const q = ctx.query;
    const account = await bankAccount(ctx.db, ctx.company, ctx.params.id);
    await releaseOrphans(ctx.db, account, ctx.now);
    const k = keyset({ cursor: q.cursor, limit: q.limit, sort: L.date, id: L.id, order: 'desc' });
    const rows = await ctx.db
      .select()
      .from(L)
      .where(and(eq(L.companyId, ctx.company.id), eq(L.accountId, account.id), q.status ? eq(L.status, q.status) : undefined, q.from ? gte(L.date, q.from) : undefined, q.to ? lte(L.date, q.to) : undefined, k.where))
      .orderBy(...k.orderBy)
      .limit(k.take);
    return k.page(await decorate(ctx.db, account, rows.slice(0, k.take - 1)), rows);
  },

  async summarizeBankLines(ctx) {
    const account = await bankAccount(ctx.db, ctx.company, ctx.params.id);
    await releaseOrphans(ctx.db, account, ctx.now);
    const cur = account.currency.trim();
    const counts = await ctx.db
      .select({ status: L.status, count: sql<number>`count(*)::int` })
      .from(L)
      .where(and(eq(L.companyId, ctx.company.id), eq(L.accountId, account.id)))
      .groupBy(L.status);
    const count = (s: LineRow['status']) => counts.find((c) => c.status === s)?.count ?? 0;
    const [last] = await ctx.db.select().from(S).where(and(eq(S.companyId, ctx.company.id), eq(S.accountId, account.id))).orderBy(desc(S.toDate), desc(S.createdAt)).limit(1);
    const balance = await statementBalance(ctx.db, account);
    return {
      unmatched: count('unmatched'),
      matched: count('matched'),
      excluded: count('excluded'),
      ...(last && { lastStatement: statementToWire(last, cur) }),
      ...(balance && { statementBalance: money(balance.balanceMinor, cur), statementBalanceDate: balance.date }),
    };
  },

  async listBankLineCandidates(ctx) {
    const line = await findLine(ctx, ctx.db, ctx.params.id);
    const account = await bankAccount(ctx.db, ctx.company, line.accountId);
    const cur = account.currency.trim();
    const all = await bookRecords(ctx.db, account, { from: addDaysISO(line.date, -FIND_DAYS), to: addDaysISO(line.date, FIND_DAYS), unmatched: {} });
    const q = ctx.query.q?.trim().toLowerCase();
    const expenses = hasModule(ctx.company.plan, 'expenses');
    const day = (iso: string) => Math.abs(Date.parse(iso) - Date.parse(line.date));
    const found = all
      .filter((c) => (c.type !== 'expense' || expenses) && (!q || [c.number, c.reference, c.partyName].some((v) => v?.toLowerCase().includes(q))))
      .sort((a, b) => Number(b.amountMinor === line.amountMinor) - Number(a.amountMinor === line.amountMinor) || day(a.date) - day(b.date) || a.id.localeCompare(b.id))
      .slice(0, 100);
    return { data: found.map((c) => recordToWire(c, cur)) };
  },

  async matchBankLine(ctx) {
    const out = await ctx.db.transaction(async (tx) => {
      const line = await findLine(ctx, tx, ctx.params.id, true);
      checkIfMatch(ctx.req, line.version);
      const account = await bankAccount(tx, ctx.company, line.accountId);
      return { ...(await matchTo(tx, ctx, line, account, ctx.body.type, ctx.body.id)), account };
    });
    setEtag(ctx.reply, out.line.version);
    return lineToWire(out.line, out.account.currency.trim(), { match: out.record });
  },

  async unmatchBankLine(ctx) {
    const out = await ctx.db.transaction(async (tx) => {
      const line = await findLine(ctx, tx, ctx.params.id, true);
      checkIfMatch(ctx.req, line.version);
      const account = await bankAccount(tx, ctx.company, line.accountId);
      const updated = line.status === 'matched' ? await setLine(tx, ctx, line, 'unmatched', { status: 'unmatched', matchType: null, matchId: null, excludedReason: null }) : line;
      return { line: updated, account };
    });
    setEtag(ctx.reply, out.line.version);
    const [wire] = await decorate(ctx.db, out.account, [out.line]);
    return wire;
  },

  async excludeBankLine(ctx) {
    const reason = ctx.body?.reason?.trim() || null;
    const out = await ctx.db.transaction(async (tx) => {
      const line = await findLine(ctx, tx, ctx.params.id, true);
      checkIfMatch(ctx.req, line.version);
      const account = await bankAccount(tx, ctx.company, line.accountId);
      const same = line.status === 'excluded' && line.excludedReason === reason;
      const updated = same ? line : await setLine(tx, ctx, line, 'excluded', { status: 'excluded', matchType: null, matchId: null, excludedReason: reason });
      return { line: updated, account };
    });
    setEtag(ctx.reply, out.line.version);
    return lineToWire(out.line, out.account.currency.trim());
  },

  async includeBankLine(ctx) {
    const out = await ctx.db.transaction(async (tx) => {
      const line = await findLine(ctx, tx, ctx.params.id, true);
      checkIfMatch(ctx.req, line.version);
      const account = await bankAccount(tx, ctx.company, line.accountId);
      const updated = line.status === 'excluded' ? await setLine(tx, ctx, line, 'included', { status: 'unmatched', matchType: null, matchId: null, excludedReason: null }) : line;
      return { line: updated, account };
    });
    setEtag(ctx.reply, out.line.version);
    const [wire] = await decorate(ctx.db, out.account, [out.line]);
    return wire;
  },

  async createPaymentFromBankLine(ctx) {
    const body = ctx.body;
    const peek = await findLine(ctx, ctx.db, ctx.params.id);
    const direction = peek.amountMinor > 0 ? 'received' : 'paid';
    assertDirectionAllowed(ctx.company, direction);
    const out = await ctx.db.transaction(async (tx) => {
      const line = await findLine(ctx, tx, ctx.params.id, true);
      checkIfMatch(ctx.req, line.version);
      if (line.status === 'matched') throw conflict('ALREADY_MATCHED', 'This bank line is already matched; unmatch it first');
      const account = await bankAccount(tx, ctx.company, line.accountId);
      const P = schema.parties;
      const [party] = await tx.select({ name: P.name, kind: P.kind }).from(P).where(and(eq(P.companyId, ctx.company.id), eq(P.id, body.partyId)));
      if (party && direction === 'received' && !sellsTo(party.kind)) throw invalid('partyId', `Money came in: ${party.name} needs to be a customer`);
      if (party && direction === 'paid' && !buysFrom(party.kind)) throw invalid('partyId', `Money went out: ${party.name} needs to be a supplier`);
      const cur = account.currency.trim();
      const payment = await writePayment(
        tx,
        ctx.deps,
        ctx.company,
        ctx.user,
        {
          direction,
          partyId: body.partyId,
          date: line.date,
          amountMinor: Math.abs(line.amountMinor),
          currency: cur,
          method: body.method ?? 'bank',
          reference: (line.reference ?? line.description).slice(0, 100) || null,
          accountId: account.id,
          notes: body.notes ?? null,
          allocations: (body.allocations ?? []).map((a) => ({
            documentId: a.documentId,
            amountMinor: a.amount.minor,
            tdsMinor: a.tdsDeducted?.minor,
            discountMinor: a.discount?.minor,
            writeOffMinor: a.writeOff?.minor,
            currency: a.amount.currency,
          })),
        },
        { now: ctx.now },
      );
      const matched = await matchTo(tx, ctx, line, account, 'payment', payment.id, 'matched to a new payment');
      const [wire] = await paymentsToWire(tx, [payment], ctx.company.baseCurrency.trim());
      return { line: lineToWire(matched.line, cur, { match: matched.record }), payment: wire };
    });
    track(ctx, 'payment_recorded', { direction: out.payment.direction, mode: out.payment.method, fromBankLine: true, allocations: out.payment.allocations?.length ?? 0 });
    return out;
  },

  async createExpenseFromBankLine(ctx) {
    // The router gates this on books; the expense it records is the expenses module.
    if (!hasModule(ctx.company.plan, 'expenses')) throw planUpgradeRequired(FULL_PLAN, 'expenses');
    const peek = await findLine(ctx, ctx.db, ctx.params.id);
    if (peek.amountMinor >= 0) throw invalid('id', 'Money came in on this line; an expense is money going out', 'NOT_MONEY_OUT');
    assertPeriodOpen(ctx.company, peek.date);
    const account = await bankAccount(ctx.db, ctx.company, peek.accountId);
    const cur = account.currency.trim();
    const expenseBody = {
      categoryId: ctx.body.categoryId,
      supplierId: ctx.body.supplierId,
      taxCategoryId: ctx.body.taxCategoryId,
      notes: ctx.body.notes,
      date: peek.date,
      amount: money(-peek.amountMinor, cur),
      currency: cur,
      accountId: account.id,
      method: 'bank',
      reference: (peek.reference ?? peek.description).slice(0, 100) || undefined,
    } as Schema<'Expense'>;
    const cols = await prepareExpense(ctx, ctx.db, expenseBody);
    return ctx.db.transaction(async (tx) => {
      const line = await findLine(ctx, tx, ctx.params.id, true);
      if (line.version !== peek.version) throw preconditionFailed();
      if (line.status === 'matched') throw conflict('ALREADY_MATCHED', 'This bank line is already matched; unmatch it first');
      // The same rule as any expense: no account pays out more than the books say it holds (RULES 6.26).
      await assertAccountCovers(tx, ctx.company.id, ctx.company.baseCurrency.trim(), cols);
      const E = schema.expenses;
      const number = await assignNumber(tx, { companyId: ctx.company.id, kind: 'expense', branchId: cols.branchId, date: cols.date });
      const [created] = await tx
        .insert(E)
        .values({ id: newId('exp'), companyId: ctx.company.id, number, createdBy: ctx.user.id, ...cols, createdAt: ctx.now, updatedAt: ctx.now })
        .returning();
      const [wire] = await expensesToWire(tx, [created]);
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'created', entityType: 'expense', entityId: created.id, entityLabel: created.number, version: created.version, after: wire });
      const matched = await matchTo(tx, ctx, line, account, 'expense', created.id, 'matched to a new expense');
      return { line: lineToWire(matched.line, cur, { match: matched.record }), expense: wire };
    });
  },

  async createVoucherFromBankLine(ctx) {
    const peek = await findLine(ctx, ctx.db, ctx.params.id);
    const account = await bankAccount(ctx.db, ctx.company, peek.accountId);
    const base = ctx.company.baseCurrency.trim();
    if (account.currency.trim() !== base) throw invalid('id', `Vouchers are in ${base}; record this ${account.currency.trim()} line as a payment or expense`);
    const contra = ctx.body.account.trim();
    const bank = accountKey(account.id);
    if (contra === bank || contra.startsWith('pay:')) throw invalid('account', 'Money moved between cash and bank accounts is a contra: record it, then match it to this line', 'CONTRA_NOT_HERE');
    // Money in: a receipt, the bank debited. Money out: a journal, the bank credited.
    const into = peek.amountMinor > 0;
    const amount = money(Math.abs(peek.amountMinor), base);
    const nil = money(0, base);
    const body = {
      kind: into ? 'receipt' : 'journal',
      date: peek.date,
      narration: ctx.body.narration?.trim() || peek.description || undefined,
      reference: (peek.reference ?? '').slice(0, 100) || undefined,
      status: 'posted',
      lines: [
        { account: bank, debit: into ? amount : nil, credit: into ? nil : amount },
        { account: contra, debit: into ? nil : amount, credit: into ? amount : nil },
      ],
    } as Schema<'Voucher'>;
    return ctx.db.transaction(async (tx) => {
      const line = await findLine(ctx, tx, ctx.params.id, true);
      if (line.version !== peek.version) throw preconditionFailed();
      if (line.status === 'matched') throw conflict('ALREADY_MATCHED', 'This bank line is already matched; unmatch it first');
      // Inside the transaction, so the balance check's row lock holds until the voucher is in.
      const cols = await voucherColumns(ctx, tx, body);
      const V = schema.vouchers;
      const number = await assignNumber(tx, { companyId: ctx.company.id, kind: cols.kind, branchId: cols.branchId, date: cols.date });
      const [created] = await tx
        .insert(V)
        .values({ id: newId('vch'), companyId: ctx.company.id, number, createdBy: ctx.user.id, ...cols, status: 'posted', postedAt: ctx.now, postedBy: ctx.user.id, createdAt: ctx.now, updatedAt: ctx.now })
        .returning();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'created', entityType: 'voucher', entityId: created.id, entityLabel: created.number, version: created.version });
      const matched = await matchTo(tx, ctx, line, account, 'voucher', created.id, 'matched to a new voucher');
      return { line: lineToWire(matched.line, base, { match: matched.record }), voucher: voucherToWire(created, base) };
    });
  },

  async getBankReconciliation(ctx) {
    const account = await bankAccount(ctx.db, ctx.company, ctx.params.id);
    await releaseOrphans(ctx.db, account, ctx.now);
    const cur = account.currency.trim();
    const asOf = ctx.query.asOf ?? businessDate(ctx.now);
    const [first] = await ctx.db.select({ since: min(S.fromDate) }).from(S).where(and(eq(S.companyId, ctx.company.id), eq(S.accountId, account.id)));
    const since = first?.since ?? undefined;

    const book = await bookBalanceAsOf(ctx.db, account, asOf);
    // In the books by asOf, and not through the bank by then. Before the first statement, taken as cleared.
    const uncleared = (await bookRecords(ctx.db, account, { from: since, to: asOf, unmatched: { asOf } })).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    // Through the bank by asOf, and not in the books by then: waiting lines, and lines matched to a later record.
    const PAY = schema.payments;
    const E = schema.expenses;
    const V = schema.vouchers;
    const lineFilter = and(eq(L.companyId, ctx.company.id), eq(L.accountId, account.id), lte(L.date, asOf));
    const waiting = await ctx.db.select().from(L).where(and(lineFilter, eq(L.status, 'unmatched')));
    const early = await ctx.db
      .select({ line: L })
      .from(L)
      .leftJoin(PAY, and(eq(L.matchType, 'payment'), eq(PAY.id, L.matchId)))
      .leftJoin(E, and(eq(L.matchType, 'expense'), eq(E.id, L.matchId)))
      .leftJoin(V, and(eq(L.matchType, 'voucher'), eq(V.id, L.matchId)))
      .where(and(lineFilter, eq(L.status, 'matched'), sql`coalesce(${PAY.date}, ${E.date}, ${V.date}) > ${asOf}`));
    const unrecorded = [...waiting, ...early.map((r) => r.line)].sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position || a.id.localeCompare(b.id));

    const sum = (xs: { amountMinor: number }[]) => xs.reduce((s, x) => s + x.amountMinor, 0);
    const deposits = uncleared.filter((c) => c.amountMinor > 0);
    const payments = uncleared.filter((c) => c.amountMinor < 0);
    const credits = unrecorded.filter((l) => l.amountMinor > 0);
    const debits = unrecorded.filter((l) => l.amountMinor < 0);
    const adjustedBook = book + sum(unrecorded);
    const stmt = await statementBalance(ctx.db, account, asOf);
    const adjustedStatement = stmt ? stmt.balanceMinor! + sum(uncleared) : undefined;
    return {
      asOf,
      ...(since && { since }),
      bookBalance: money(book, cur),
      ...(stmt && { statementBalance: money(stmt.balanceMinor, cur), statementBalanceDate: stmt.date }),
      unclearedPayments: {
        deposits: deposits.map((c) => recordToWire(c, cur)),
        payments: payments.map((c) => recordToWire(c, cur)),
        depositsTotal: money(sum(deposits), cur),
        paymentsTotal: money(-sum(payments), cur),
      },
      unrecordedLines: {
        credits: credits.map((l) => lineToWire(l, cur)),
        debits: debits.map((l) => lineToWire(l, cur)),
        creditsTotal: money(sum(credits), cur),
        debitsTotal: money(-sum(debits), cur),
      },
      adjustedBookBalance: money(adjustedBook, cur),
      ...(adjustedStatement !== undefined && { adjustedStatementBalance: money(adjustedStatement, cur), difference: money(adjustedBook - adjustedStatement, cur) }),
    };
  },
});

