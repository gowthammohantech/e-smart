import { and, asc, eq, exists, gte, ilike, inArray, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { USER_GROUPS, accountFor, chartOfAccounts, type Book } from '@esmart/core/domain/ledger/accounts';
import { balanceSheet, costCentreProfit, dayBook, ledgerStatement, monthEndBalances, profitAndLoss, trialBalance } from '@esmart/core/domain/ledger/reports';
import type { LedgerGroup } from '@esmart/core/types';
import { schema } from '@esmart/db';
import { defineHandlers, type Ctx } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { ApiError, conflict, forbidden, invalid, notFound, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import { keyset } from '../../http/pagination';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { assignNumber } from '../../lib/numbering';
import { compact, iso, money, versioned } from '../../lib/wire';
import { assertPeriodOpen } from '../documents/lifecycle';
import { accountBalanceMinor } from '../payments/engine';
import { costCentreIssues } from './costCentres';
import { loadBook, loadVouchers } from './book';
import { cashLedgerBalance } from '@esmart/core/domain/gstUtilization';
import { postVoucher } from '@esmart/core/domain/ledger/postings';
import { comparisonPeriod, profitAndLossColumns, balanceSheetColumns, splitPeriods } from '@esmart/core/domain/ledger/comparative';
import { integrityChecks, type IntegrityInput } from '@esmart/core/domain/ledger/integrity';
import { partyStatement } from '../parties/statement';
import { businessDate, financialYearOf } from '@esmart/core/lib/date';
import { assertOpeningOpen, ledgerKeyUse } from './usage';

/**
 * The sub-ledgers the integrity check holds the ledger against: each base-currency party's own statement
 * (documents, payments and vouchers on it) as of `asOf`, debit positive, and what is allocated to each
 * document. A party billed in another currency keeps its statement in that currency, so it isn't compared.
 */
async function integritySources(ctx: Pick<Ctx<'getBooksView'>, 'db' | 'company'>, asOf: string): Promise<Pick<IntegrityInput, 'partyStatements' | 'allocations'>> {
  const base = ctx.company.baseCurrency.trim();
  const parties = await ctx.db.select().from(schema.parties).where(and(eq(schema.parties.companyId, ctx.company.id), ne(schema.parties.kind, 'general')));
  const partyStatements: IntegrityInput['partyStatements'] = [];
  for (const party of parties.filter((p) => p.currency.trim() === base)) {
    const s = await partyStatement(ctx.db, ctx.company, party, { to: asOf });
    const closing = s.closingBalance?.minor ?? 0;
    partyStatements.push({ id: party.id, name: party.name, balance: party.kind === 'supplier' ? -closing : closing });
  }
  const D = schema.documents;
  const A = schema.paymentAllocations;
  const rows = await ctx.db
    .select({ documentId: D.id, number: D.number, total: D.grandTotalMinor, allocated: sql<number>`coalesce(sum(${A.amountMinor} + ${A.tdsMinor} + ${A.discountMinor} + ${A.writeOffMinor}), 0)::bigint` })
    .from(D)
    .innerJoin(A, eq(A.documentId, D.id))
    .where(eq(D.companyId, ctx.company.id))
    .groupBy(D.id, D.number, D.grandTotalMinor);
  return { partyStatements, allocations: rows.map((r) => ({ ...r, allocated: Number(r.allocated) })) };
}

const LA = schema.ledgerAccounts;
const V = schema.vouchers;
type AccountRow = typeof LA.$inferSelect;
type VoucherRow = typeof V.$inferSelect;
type StoredLine = { account: string; debitMinor: number; creditMinor: number; narration?: string; costCentreId?: string };
type AnyCtx = Pick<Ctx<'getVoucher'>, 'company' | 'user' | 'db' | 'now'>;

/**
 * System accounts only the books themselves post to: opening stock comes from the stock ledger,
 * accumulated depreciation from the asset register, goods received not billed from goods receipts.
 * A journal into one would quietly undo what its source works out (RULES 6.10, 6.15).
 */
export const VOUCHER_BLOCKED_KEYS = ['sys:openingStock', 'sys:accumulatedDepreciation', 'sys:goodsReceivedNotBilled'];
/** Earlier years' profit: open to vouchers, but only posted by these roles and with a narration. */
export const RETAINED_EARNINGS = 'sys:retainedEarnings';
export const RETAINED_EARNINGS_ROLES: string[] = ['owner', 'admin'];

const blocking = (issues: Issue[]) => (field: string, message: string) => issues.push({ field, message, severity: 'blocking' });

// ------------------------------------------------------------ wire

function accountToWire(row: AccountRow, base: string): Schema<'LedgerAccount'> {
  return compact({ id: row.id, companyId: row.companyId, name: row.name, group: row.group, openingBalance: money(row.openingBalanceMinor, base), openingBalanceDate: row.openingBalanceDate, status: row.status, ...versioned(row) });
}

export function voucherToWire(row: VoucherRow, base: string, attachmentIds?: string[]): Schema<'Voucher'> {
  const lines = row.lines as StoredLine[];
  return compact({
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    kind: row.kind,
    number: row.number,
    status: row.status,
    postedAt: row.postedAt ? iso(row.postedAt) : undefined,
    date: row.date,
    narration: row.narration,
    reference: row.reference,
    challan: row.challan as Schema<'Voucher'>['challan'],
    gstChallan: (row.gstChallan as Schema<'Voucher'>['gstChallan']) ?? undefined,
    gstin: row.gstin ?? undefined,
    gstPeriod: row.gstPeriod ?? undefined,
    partyId: row.partyId ?? undefined,
    attachmentIds,
    lines: lines.map((l) => compact({ account: l.account, debit: money(l.debitMinor, base), credit: money(l.creditMinor, base), narration: l.narration, costCentreId: l.costCentreId })),
    createdBy: row.createdBy,
    ...versioned(row),
    createdAt: iso(row.createdAt),
  });
}

/** Vouchers with the files kept with each (attachments pointing back at them). */
async function vouchersToWire(db: DbOrTx, rows: VoucherRow[], base: string): Promise<Schema<'Voucher'>[]> {
  const AT = schema.attachments;
  const files = rows.length
    ? await db.select({ id: AT.id, entityId: AT.entityId }).from(AT).where(and(eq(AT.entityType, 'voucher'), inArray(AT.entityId, rows.map((r) => r.id))))
    : [];
  return rows.map((r) => voucherToWire(r, base, files.filter((f) => f.entityId === r.id).map((f) => f.id)));
}

/** Attachments listed on a voucher point back at it; ones dropped from the list are let go. */
async function linkVoucherAttachments(tx: DbOrTx, companyId: string, voucherId: string, ids: string[] | undefined) {
  if (ids === undefined) return;
  const AT = schema.attachments;
  await tx.update(AT).set({ entityType: null, entityId: null }).where(and(eq(AT.companyId, companyId), eq(AT.entityType, 'voucher'), eq(AT.entityId, voucherId)));
  if (ids.length) await tx.update(AT).set({ entityType: 'voucher', entityId: voucherId }).where(and(eq(AT.companyId, companyId), inArray(AT.id, ids)));
}

type VoucherQuery = Pick<Ctx<'listVouchers'>['query'], 'kind' | 'status' | 'partyId' | 'from' | 'to' | 'q'>;

/** The WHERE of a voucher list, shared by the list and its summary so the two never disagree. */
function voucherFilters(ctx: Pick<Ctx<'listVouchers'>, 'company' | 'user' | 'db'>, q: VoucherQuery): (SQL | undefined)[] {
  const filters: (SQL | undefined)[] = [
    eq(V.companyId, ctx.company.id),
    ctx.user.branchIds.length ? inArray(V.branchId, ctx.user.branchIds) : undefined,
    q.kind ? eq(V.kind, q.kind) : undefined,
    q.status ? eq(V.status, q.status) : undefined,
    q.partyId ? eq(V.partyId, q.partyId) : undefined,
    q.from ? gte(V.date, q.from) : undefined,
    q.to ? lte(V.date, q.to) : undefined,
  ];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    const P = schema.parties;
    filters.push(or(ilike(V.number, like), ilike(V.narration, like), ilike(V.reference, like), exists(ctx.db.select({ one: sql`1` }).from(P).where(and(eq(P.id, V.partyId), ilike(P.name, like))))));
  }
  return filters;
}

// ------------------------------------------------------------ accounts

/** The book the voucher's account keys are looked up in: only the records they name. */
async function bookFor(db: DbOrTx, companyId: string, keys: string[]): Promise<Book> {
  const ids = (prefix: string) => keys.filter((k) => k.startsWith(`${prefix}:`)).map((k) => k.slice(prefix.length + 1));
  const some = async <T>(prefix: string, load: (ids: string[]) => Promise<T[]>) => (ids(prefix).length ? load(ids(prefix)) : []);
  const P = schema.parties;
  const A = schema.paymentAccounts;
  const C = schema.expenseCategories;
  return {
    parties: await some('party', (x) => db.select({ id: P.id, name: P.name, kind: P.kind }).from(P).where(and(eq(P.companyId, companyId), inArray(P.id, x)))),
    paymentAccounts: await some('pay', (x) => db.select({ id: A.id, name: A.name, type: A.type }).from(A).where(and(eq(A.companyId, companyId), inArray(A.id, x)))),
    expenseCategories: await some('exp', (x) => db.select({ id: C.id, name: C.name }).from(C).where(and(eq(C.companyId, companyId), inArray(C.id, x)))),
    ledgerAccounts: await some('acc', (x) => db.select({ id: LA.id, name: LA.name, group: LA.group }).from(LA).where(and(eq(LA.companyId, companyId), inArray(LA.id, x)))),
  };
}

async function findAccount(ctx: AnyCtx, db: DbOrTx, id: string) {
  const [row] = await db.select().from(LA).where(and(eq(LA.companyId, ctx.company.id), eq(LA.id, id)));
  if (!row) throw notFound('Ledger account');
  return row;
}

async function accountColumns(db: DbOrTx, companyId: string, body: Schema<'LedgerAccount'>, today: string, base: string, exceptId?: string) {
  const issues: Issue[] = [];
  const block = blocking(issues);
  if (body.openingBalance.currency !== base) block('openingBalance.currency', `The books are kept in ${base}`);
  const name = body.name.trim();
  if (!name) block('name', 'Give the account a name');
  if (!USER_GROUPS.includes(body.group as LedgerGroup)) block('group', 'Debtors, creditors and stock come from parties and the stock ledger, not an account of your own');
  const [same] = await db.select({ id: LA.id }).from(LA).where(and(eq(LA.companyId, companyId), eq(LA.name, name), exceptId ? ne(LA.id, exceptId) : undefined));
  if (same) block('name', `There is already an account called ${name}`);
  if (body.openingBalanceDate && body.openingBalanceDate > today) block('openingBalanceDate', 'The opening balance date cannot be in the future');
  if (issues.length) throw unprocessable(issues);
  return { name, group: body.group as LedgerGroup, openingBalanceMinor: body.openingBalance.minor, openingBalanceDate: body.openingBalanceDate ?? null, status: body.status ?? ('active' as const) };
}

// ------------------------------------------------------------ vouchers

/**
 * A voucher's rules: at least two lines, each a debit or a credit, debits equal to credits, every
 * account in this book, and what its kind allows: a contra only between cash and bank, a GST journal
 * touching a GST ledger, a TDS challan clearing TDS payable from cash or bank.
 *
 * A draft is kept to finish later, so it only needs lines that name real accounts: it may be
 * unbalanced, have one line, break its kind's rules or sit in a closed period, since nothing of it
 * reaches the books. All of that is checked when it is posted.
 */
export async function voucherColumns(ctx: AnyCtx, db: DbOrTx, body: Schema<'Voucher'>, exceptId?: string, draft = false, pending?: Map<string, number>) {
  const issues: Issue[] = [];
  const block = blocking(issues);
  const base = ctx.company.baseCurrency.trim();
  const lines: StoredLine[] = body.lines.map((l) => ({ account: l.account.trim(), debitMinor: l.debit.minor, creditMinor: l.credit.minor, ...(l.narration?.trim() && { narration: l.narration.trim() }), ...(l.costCentreId && { costCentreId: l.costCentreId }) }));
  issues.push(...(await costCentreIssues(db, ctx.company.id, body.lines.map((l, i) => ({ field: `lines[${i}].costCentreId`, id: l.costCentreId })))));
  const book = await bookFor(db, ctx.company.id, lines.map((l) => l.account));
  lines.forEach((l, i) => {
    const field = `lines[${i}]`;
    const line = body.lines[i];
    if (line.debit.currency !== base || line.credit.currency !== base) block(field, `Vouchers are in ${base}`);
    if (l.debitMinor < 0 || l.creditMinor < 0) block(field, 'Amounts cannot be negative');
    if ((l.debitMinor > 0) === (l.creditMinor > 0)) block(field, 'Each line is a debit or a credit');
    if (!accountFor(l.account, book)) block(`${field}.account`, `No account ${l.account} in this company`);
    if (VOUCHER_BLOCKED_KEYS.includes(l.account)) block(`${field}.account`, `${accountFor(l.account, book)?.name ?? l.account} is worked out by the books; a voucher cannot post to it`);
  });
  // Earlier years' profit takes appropriations and prior-period corrections only (AS 5): posted by an
  // owner or admin, with the reason in the narration. An accountant may prepare it as a draft.
  if (lines.some((l) => l.account === RETAINED_EARNINGS)) {
    if (!draft && !RETAINED_EARNINGS_ROLES.includes(ctx.user.role)) {
      throw forbidden('RETAINED_EARNINGS_ROLE', 'Only an owner or admin can post to earlier years’ profit; save it as a draft for them to post');
    }
    if (!draft && !body.narration?.trim()) block('narration', 'Say why earlier years’ profit changes: a voucher posting to it needs a narration');
  }
  // An inactive account takes no new entries; lines already on this voucher may stay.
  const kept = exceptId ? new Set(((await db.select({ lines: V.lines }).from(V).where(eq(V.id, exceptId)))[0]?.lines as StoredLine[] | undefined)?.map((l) => l.account) ?? []) : new Set<string>();
  const fresh = (prefix: string) => [...new Set(lines.map((l) => l.account).filter((k) => k.startsWith(`${prefix}:`) && !kept.has(k)).map((k) => k.slice(prefix.length + 1)))];
  const inactive = new Set<string>();
  if (fresh('acc').length) for (const r of await db.select({ id: LA.id }).from(LA).where(and(eq(LA.companyId, ctx.company.id), inArray(LA.id, fresh('acc')), eq(LA.status, 'inactive')))) inactive.add(`acc:${r.id}`);
  if (fresh('party').length) {
    const P = schema.parties;
    for (const r of await db.select({ id: P.id }).from(P).where(and(eq(P.companyId, ctx.company.id), inArray(P.id, fresh('party')), eq(P.status, 'inactive')))) inactive.add(`party:${r.id}`);
  }
  lines.forEach((l, i) => {
    if (inactive.has(l.account)) block(`lines[${i}].account`, `${accountFor(l.account, book)?.name ?? l.account} is inactive; make it active to post to it`);
  });
  if (!lines.length) block('lines', 'A voucher needs at least one line');
  if (!draft && lines.length < 2) block('lines', 'A voucher needs at least two lines');
  const debit = lines.reduce((a, l) => a + l.debitMinor, 0);
  const credit = lines.reduce((a, l) => a + l.creditMinor, 0);
  if (!draft && debit !== credit) block('lines', `Debits (${(debit / 100).toFixed(2)}) and credits (${(credit / 100).toFixed(2)}) must be equal`);
  const groups = lines.map((l) => accountFor(l.account, book)?.group);
  const isCash = (g: LedgerGroup | undefined) => g === 'cashInHand' || g === 'bankAccounts';
  if (!issues.length && !draft) {
    if (body.kind === 'contra' && !groups.every(isCash)) block('lines', 'A contra moves money between cash and bank accounts only');
    if (body.kind === 'gstJournal' && !groups.some((g) => g === 'dutiesTaxes')) block('lines', 'A GST journal adjusts a GST ledger');
    if (body.kind === 'tdsChallan') {
      // The same challan (ITNS 281) deposits TDS and TCS: either payable may be cleared.
      const ok = lines.every((l, i) => (l.debitMinor > 0 ? l.account.startsWith('sys:tdsPayable') || l.account.startsWith('sys:tcsPayable') : isCash(groups[i])));
      if (!ok) block('lines', 'A TDS challan clears TDS or TCS payable from a cash or bank account');
    }
    if (body.kind === 'gstChallan') {
      // A PMT-06 deposit: money from cash or bank into the GST cash ledger, head by head (RULES 6.21).
      const ok = lines.every((l, i) => (l.debitMinor > 0 ? l.account.startsWith('sys:gstCashLedger:') : isCash(groups[i])));
      if (!ok) block('lines', 'A GST challan puts money from a cash or bank account into the GST cash ledger');
      const c = body.gstChallan;
      if (!c) block('gstChallan', 'Give the challan’s CPIN and deposit date');
      else {
        for (const head of ['igst', 'cgst', 'sgst', 'cess'] as const) {
          const h = c.heads[head];
          const total = h ? h.tax + h.interest + h.penalty + h.fee + h.others : 0;
          const debited = lines.filter((l) => l.account === `sys:gstCashLedger:${head}`).reduce((a, l) => a + l.debitMinor - l.creditMinor, 0);
          if (total !== debited) block(`gstChallan.heads.${head}`, `The challan pays ${(total / 100).toFixed(2)} of ${head.toUpperCase()}; the lines put ${(debited / 100).toFixed(2)} in the cash ledger`);
        }
      }
    }
    if (body.kind === 'receipt') {
      // Money in: cash or bank takes it, and whatever it's for (an income, a loan, capital) gives it.
      const ok = lines.every((l, i) => (l.debitMinor > 0 ? isCash(groups[i]) : !isCash(groups[i])));
      if (!ok) block('lines', 'A receipt brings money into a cash or bank account from an account that is not cash or bank');
    }
  }
  if (body.challan && body.kind !== 'tdsChallan') block('challan', 'Only a TDS challan has challan details');
  if (body.gstChallan && body.kind !== 'gstChallan') block('gstChallan', 'Only a GST challan has GST challan details');
  if (body.gstChallan && body.gstChallan.depositedOn > businessDate(ctx.now)) block('gstChallan.depositedOn', 'The deposit date cannot be in the future');
  const partyId = body.partyId?.trim() || null;
  if (partyId) {
    const [p] = await db.select({ id: schema.parties.id }).from(schema.parties).where(and(eq(schema.parties.companyId, ctx.company.id), eq(schema.parties.id, partyId)));
    if (!p) block('partyId', 'No such party in this company');
  }
  if (body.attachmentIds?.length) {
    const AT = schema.attachments;
    const found = await db.select({ id: AT.id }).from(AT).where(and(eq(AT.companyId, ctx.company.id), inArray(AT.id, body.attachmentIds)));
    const missing = body.attachmentIds.filter((id) => !found.some((f) => f.id === id));
    if (missing.length) block('attachmentIds', `No such attachment in this company: ${missing.join(', ')}`);
  }
  if (body.challan && body.challan.depositedOn > businessDate(ctx.now)) block('challan.depositedOn', 'The deposit date cannot be in the future');

  let branchId = body.branchId ?? null;
  if (branchId) {
    const [b] = await db.select({ id: schema.branches.id }).from(schema.branches).where(and(eq(schema.branches.companyId, ctx.company.id), eq(schema.branches.id, branchId)));
    if (!b) block('branchId', 'No such branch in this company');
  } else {
    const branches = await db.select().from(schema.branches).where(eq(schema.branches.companyId, ctx.company.id));
    const mine = ctx.user.branchIds.length ? branches.filter((b) => ctx.user.branchIds.includes(b.id)) : branches;
    branchId = (mine.find((b) => b.isPrimary) ?? mine[0])?.id ?? null;
  }
  if (branchId && ctx.user.branchIds.length && !ctx.user.branchIds.includes(branchId)) block('branchId', 'You cannot record vouchers in this branch');
  if (issues.length) throw unprocessable(issues, !draft && debit !== credit ? 'VOUCHER_UNBALANCED' : 'VALIDATION_FAILED');
  const columns = { kind: body.kind, branchId: branchId!, date: body.date, narration: body.narration?.trim() || null, reference: body.reference?.trim() || null, challan: body.challan ?? null, gstChallan: body.gstChallan ?? null, partyId, lines };
  if (draft) return columns;
  assertPeriodOpen(ctx.company, body.date);

  // No account pays out more than it holds, as for payments.
  const A = schema.paymentAccounts;
  for (const [i, l] of lines.entries()) {
    const out = l.creditMinor - l.debitMinor;
    if (out <= 0 || !l.account.startsWith('pay:')) continue;
    const [account] = await db.select().from(A).where(and(eq(A.companyId, ctx.company.id), eq(A.id, l.account.slice(4)))).for('update');
    // Taken by earlier vouchers in the same import, not yet in the books.
    const balance = (await accountBalanceMinor(db, account, undefined, exceptId)) - (pending?.get(l.account) ?? 0);
    if (out > balance) {
      throw unprocessable([{ field: `lines[${i}]`, message: `${account.name} holds ${base} ${(Math.max(balance, 0) / 100).toFixed(2)}; this voucher takes ${base} ${(out / 100).toFixed(2)}`, severity: 'blocking' }], 'INSUFFICIENT_BALANCE');
    }
  }
  if (pending) for (const l of lines) if (l.account.startsWith('pay:')) pending.set(l.account, (pending.get(l.account) ?? 0) + l.creditMinor - l.debitMinor);
  return columns;
}

/** What makes two journals the same entry, for spotting one imported twice. */
function journalFingerprint(v: { kind: string; date: string; narration: string | null; reference: string | null; lines: unknown }): string {
  const lines = (v.lines as { account: string; debitMinor: number; creditMinor: number }[])
    .map((l) => `${l.account}:${l.debitMinor}:${l.creditMinor}`)
    .sort();
  return [v.kind, v.date, (v.narration ?? '').trim().toLowerCase(), (v.reference ?? '').trim().toLowerCase(), ...lines].join('|');
}

async function findVoucher(ctx: AnyCtx, db: DbOrTx, id: string): Promise<VoucherRow> {
  const [row] = await db.select().from(V).where(and(eq(V.companyId, ctx.company.id), eq(V.id, id)));
  if (!row || (ctx.user.branchIds.length && !ctx.user.branchIds.includes(row.branchId))) throw notFound('Voucher');
  return row;
}

/** A voucher row from checked columns: a draft takes no number from the series, so drafts given up on leave no gaps. */
async function insertVoucher(ctx: AnyCtx, tx: DbOrTx, cols: Awaited<ReturnType<typeof voucherColumns>>, draft: boolean): Promise<VoucherRow> {
  const id = newId('vch');
  const number = draft ? id : await assignNumber(tx, { companyId: ctx.company.id, kind: cols.kind, branchId: cols.branchId, date: cols.date });
  const posted = draft ? { status: 'draft' as const } : { status: 'posted' as const, postedAt: ctx.now, postedBy: ctx.user.id };
  const [created] = await tx.insert(V).values({ id, companyId: ctx.company.id, number, createdBy: ctx.user.id, ...cols, ...posted, createdAt: ctx.now, updatedAt: ctx.now }).returning();
  await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'created', entityType: 'voucher', entityId: created.id, entityLabel: created.number, version: created.version });
  return created;
}

const VT = schema.voucherTemplates;
type TemplateLine = { account: string; side: 'dr' | 'cr'; amountMinor?: number | null; narration?: string; costCentreId?: string };

function templateToWire(row: typeof VT.$inferSelect, base: string): Schema<'VoucherTemplate'> {
  return compact({
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    kind: row.kind,
    narration: row.narration,
    lines: (row.lines as TemplateLine[]).map((l) => compact({ account: l.account, side: l.side, amount: l.amountMinor != null ? money(l.amountMinor, base) : undefined, narration: l.narration, costCentreId: l.costCentreId })),
    ...versioned(row),
  });
}

/** A template's lines keep their accounts and sides; an amount left out is filled in on each use. */
function templateColumns(body: Schema<'VoucherTemplate'>) {
  const name = body.name.trim();
  if (!name) throw invalid('name', 'Give the template a name');
  if (!body.lines.length) throw invalid('lines', 'A template needs at least one line');
  const lines: TemplateLine[] = body.lines.map((l) => ({ account: l.account.trim(), side: l.side, ...(l.amount && { amountMinor: l.amount.minor }), ...(l.narration?.trim() && { narration: l.narration.trim() }), ...(l.costCentreId && { costCentreId: l.costCentreId }) }));
  return { name, kind: body.kind, narration: body.narration?.trim() || null, lines };
}

/** Books: the accounts a business adds, and its vouchers. */
export const booksHandlers = defineHandlers({
  async getBooksView(ctx) {
    // The books are one set across branches; a user limited to some of them sees the branch reports instead.
    // Listed against every branch is the same as not limited.
    if (ctx.user.branchIds.length) {
      const branches = await ctx.db.select({ id: schema.branches.id }).from(schema.branches).where(eq(schema.branches.companyId, ctx.company.id));
      if (branches.some((b) => !ctx.user.branchIds.includes(b.id))) throw forbidden('BOOKS_ALL_BRANCHES', 'The books cover every branch; ask an owner or admin');
    }
    const { from = '1900-01-01', to, account, breakdown, compare } = ctx.query;
    const { postings, book, stock } = await loadBook({ db: ctx.db, company: ctx.company, user: ctx.user, now: ctx.now, from, to });
    const range = { from, to };
    const fy = ctx.company.fiscalYearStartMonth;
    // Columns: a period per month or quarter, or this one beside the one it is compared with (earliest first).
    const periods = breakdown ? splitPeriods(range, breakdown) : compare ? [comparisonPeriod(range, compare), { ...range, label: `${from} – ${to}` }] : null;
    switch (ctx.params.view) {
      case 'trial-balance':
        return trialBalance(postings, book, range, fy) as never;
      case 'profit-loss':
        if (periods) return profitAndLossColumns(postings, book, periods, stock) as never;
        return profitAndLoss(postings, book, range, stock) as never;
      case 'balance-sheet':
        if (periods) return balanceSheetColumns(postings, book, periods.map((p) => p.to), stock, fy) as never;
        return balanceSheet(postings, book, to, stock, fy) as never;
      case 'integrity':
        return { asOf: to, checks: integrityChecks({ postings, asOf: to, stock, ...(await integritySources(ctx, to)) }) } as never;
      case 'ledger':
        if (!account) throw invalid('account', 'Which account?');
        return { account: accountFor(account, book) ?? null, ...ledgerStatement(postings, account, range), trend: monthEndBalances(postings, account, range) } as never;
      case 'day-book':
        return { entries: dayBook(postings, range) } as never;
      case 'cost-centres':
        return { rows: costCentreProfit(postings, book, range) } as never;
      case 'accounts': {
        const balances: Record<string, number> = {};
        for (const p of postings) if (p.date <= to) balances[p.account] = (balances[p.account] ?? 0) + p.debit - p.credit;
        return { book, accounts: chartOfAccounts(book), balances } as never;
      }
    }
  },

  async listLedgerAccounts(ctx) {
    const k = keyset({ cursor: ctx.query.cursor, limit: ctx.query.limit, sort: LA.name, id: LA.id, order: 'asc' });
    const rows = await ctx.db.select().from(LA).where(and(eq(LA.companyId, ctx.company.id), k.where)).orderBy(...k.orderBy).limit(k.take);
    const base = ctx.company.baseCurrency.trim();
    return k.page(rows.slice(0, k.take - 1).map((r) => accountToWire(r, base)), rows);
  },

  async createLedgerAccount(ctx) {
    const cols = await accountColumns(ctx.db, ctx.company.id, ctx.body, businessDate(ctx.now), ctx.company.baseCurrency.trim());
    if (cols.openingBalanceMinor) assertOpeningOpen(ctx.company, cols.openingBalanceDate);
    const row = await ctx.db.transaction(async (tx) => {
      const [created] = await tx.insert(LA).values({ id: newId('lac'), companyId: ctx.company.id, ...cols, createdAt: ctx.now, updatedAt: ctx.now }).returning();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'created', entityType: 'ledger_account', entityId: created.id, entityLabel: created.name, version: created.version });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return accountToWire(row, ctx.company.baseCurrency.trim());
  },

  async getLedgerAccount(ctx) {
    const row = await findAccount(ctx, ctx.db, ctx.params.id);
    setEtag(ctx.reply, row.version);
    return accountToWire(row, ctx.company.baseCurrency.trim());
  },

  async saveLedgerAccount(ctx) {
    const current = await findAccount(ctx, ctx.db, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const cols = await accountColumns(ctx.db, ctx.company.id, ctx.body, businessDate(ctx.now), ctx.company.baseCurrency.trim(), current.id);
    // An opening is part of the books from the day before its date (the start of the books when undated):
    // closing that period closes it too, before and after the change.
    if (cols.openingBalanceMinor !== current.openingBalanceMinor || cols.openingBalanceDate !== current.openingBalanceDate) {
      for (const [minor, date] of [[current.openingBalanceMinor, current.openingBalanceDate], [cols.openingBalanceMinor, cols.openingBalanceDate]] as const) if (minor) assertOpeningOpen(ctx.company, date);
    }
    // Its group places every entry on it in the reports: a used account keeps it, or closed years would move.
    if (cols.group !== current.group) {
      const used = (await ledgerKeyUse(ctx.db, ctx.company.id, `acc:${current.id}`, ['voucher', 'fixed asset'])) ?? (current.openingBalanceMinor ? 'an opening balance' : null);
      if (used) throw conflict('ACCOUNT_GROUP_LOCKED', `${current.name} has ${used}; its group can't change. Make a new account in the group you want and move the balance with a journal`);
    }
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx.update(LA).set({ ...cols, version: current.version + 1, updatedAt: ctx.now }).where(and(eq(LA.id, current.id), eq(LA.version, current.version))).returning();
      if (!updated) throw preconditionFailed();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'updated', entityType: 'ledger_account', entityId: updated.id, entityLabel: updated.name, version: updated.version, before: { name: current.name, group: current.group, openingBalanceMinor: current.openingBalanceMinor, openingBalanceDate: current.openingBalanceDate }, after: { name: updated.name, group: updated.group, openingBalanceMinor: updated.openingBalanceMinor, openingBalanceDate: updated.openingBalanceDate } });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return accountToWire(row, ctx.company.baseCurrency.trim());
  },

  async removeLedgerAccount(ctx) {
    const current = await findAccount(ctx, ctx.db, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const used = (await ledgerKeyUse(ctx.db, ctx.company.id, `acc:${current.id}`)) ?? (current.openingBalanceMinor ? 'an opening balance' : null);
    if (used) throw conflict('ACCOUNT_IN_USE', `${current.name} is on ${used}; mark it inactive instead`);
    await ctx.db.transaction(async (tx) => {
      const deleted = await tx.delete(LA).where(and(eq(LA.id, current.id), eq(LA.version, current.version))).returning({ id: LA.id });
      if (!deleted.length) throw preconditionFailed();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'deleted', entityType: 'ledger_account', entityId: current.id, entityLabel: current.name, version: current.version + 1, deleted: true, before: accountToWire(current, ctx.company.baseCurrency.trim()) });
    });
    return undefined;
  },

  async listVouchers(ctx) {
    const q = ctx.query;
    const k = keyset({ cursor: q.cursor, limit: q.limit, sort: V.date, id: V.id, order: 'desc' });
    const rows = await ctx.db
      .select()
      .from(V)
      .where(and(...voucherFilters(ctx, q), k.where))
      .orderBy(...k.orderBy)
      .limit(k.take);
    const base = ctx.company.baseCurrency.trim();
    return k.page(await vouchersToWire(ctx.db, rows.slice(0, k.take - 1), base), rows);
  },

  /** Count and total of a voucher list, and (for receipts) what the money was for, by the account credited. */
  async summarizeVoucherList(ctx) {
    const base = ctx.company.baseCurrency.trim();
    const rows = await ctx.db.select({ lines: V.lines }).from(V).where(and(...voucherFilters(ctx, ctx.query)));
    let total = 0;
    const byAccount = new Map<string, number>();
    for (const r of rows) {
      for (const l of r.lines as StoredLine[]) {
        total += l.debitMinor;
        if (l.creditMinor > 0) byAccount.set(l.account, (byAccount.get(l.account) ?? 0) + l.creditMinor);
      }
    }
    return {
      count: rows.length,
      total: money(total, base),
      byAccount: [...byAccount.entries()].sort((a, b) => b[1] - a[1]).map(([account, minor]) => ({ account, total: money(minor, base) })),
    };
  },

  async createVoucher(ctx) {
    const draft = ctx.body.status === 'draft';
    // Checked inside the transaction, so the balance check's row lock holds until the voucher is in.
    const row = await ctx.db.transaction(async (tx) => {
      const cols = await voucherColumns(ctx, tx, ctx.body, undefined, draft);
      const created = await insertVoucher(ctx, tx, cols, draft);
      await linkVoucherAttachments(tx, ctx.company.id, created.id, ctx.body.attachmentIds);
      return created;
    });
    setEtag(ctx.reply, row.version);
    const [wire] = await vouchersToWire(ctx.db, [row], ctx.company.baseCurrency.trim());
    return wire;
  },

  /** Journals from a spreadsheet, each checked as one entered by hand; drafts when asked, else posted. */
  async importVouchers(ctx) {
    const { vouchers, asDrafts, dryRun } = ctx.body;
    const base = ctx.company.baseCurrency.trim();
    type Result = { index: number; status: 'created' | 'invalid'; id?: string; number?: string; issues?: Issue[] };
    const results: Result[] = [];
    const good: { index: number; cols: Awaited<ReturnType<typeof voucherColumns>> }[] = [];
    // What earlier journals in the sheet take from each cash or bank account, so two can't spend the same balance.
    const pending = new Map<string, number>();
    for (const [index, v] of vouchers.entries()) {
      const body = { kind: v.kind ?? 'journal', date: v.date, narration: v.narration, reference: v.reference, lines: v.lines, status: asDrafts ? 'draft' : 'posted' } as Schema<'Voucher'>;
      try {
        good.push({ index, cols: await voucherColumns(ctx, ctx.db, body, undefined, !!asDrafts, pending) });
      } catch (err) {
        const issues = err instanceof ApiError ? ((err.extra.issues as Issue[] | undefined) ?? [{ field: '', message: err.message, severity: 'blocking' as const }]) : [{ field: '', message: String(err), severity: 'blocking' as const }];
        results.push({ index, status: 'invalid', issues });
      }
    }
    // A sheet uploaded twice would post every journal again under new numbers. One already in the
    // books (same kind, date, narration, reference and lines) is refused with its number; a
    // journal that really repeats can say so with its narration.
    if (good.length) {
      const dates = [...new Set(good.map((g) => g.cols.date))];
      const existing = await ctx.db
        .select({ number: V.number, kind: V.kind, date: V.date, narration: V.narration, reference: V.reference, lines: V.lines })
        .from(V)
        .where(and(eq(V.companyId, ctx.company.id), inArray(V.date, dates)));
      const known = new Map(existing.map((r) => [journalFingerprint(r), r.number]));
      for (let i = good.length - 1; i >= 0; i--) {
        const number = known.get(journalFingerprint(good[i].cols));
        if (!number) continue;
        results.push({ index: good[i].index, status: 'invalid', issues: [{ field: '', message: `Already in the books as ${number}; change its narration to import it again`, severity: 'blocking' }] });
        good.splice(i, 1);
      }
    }
    if (!dryRun && good.length) {
      await ctx.db.transaction(async (tx) => {
        for (const g of good) {
          const row = await insertVoucher(ctx, tx, g.cols, !!asDrafts);
          results.push({ index: g.index, status: 'created', id: row.id, number: row.number });
        }
      });
    } else for (const g of good) results.push({ index: g.index, status: 'created' });
    results.sort((a, b) => a.index - b.index);
    void base;
    return { created: results.filter((r) => r.status === 'created').length, invalid: results.filter((r) => r.status === 'invalid').length, results };
  },

  async listVoucherTemplates(ctx) {
    const rows = await ctx.db.select().from(VT).where(eq(VT.companyId, ctx.company.id)).orderBy(asc(VT.name));
    return { data: rows.map((r) => templateToWire(r, ctx.company.baseCurrency.trim())) };
  },

  async createVoucherTemplate(ctx) {
    const cols = templateColumns(ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      const [dupe] = await tx.select({ id: VT.id }).from(VT).where(and(eq(VT.companyId, ctx.company.id), eq(VT.name, cols.name)));
      if (dupe) throw invalid('name', `There is already a template called ${cols.name}`, 'TEMPLATE_EXISTS');
      const [created] = await tx.insert(VT).values({ id: newId('vtp'), companyId: ctx.company.id, createdBy: ctx.user.id, ...cols }).returning();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'created', entityType: 'voucher_template', entityId: created.id, entityLabel: created.name, version: created.version });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return templateToWire(row, ctx.company.baseCurrency.trim());
  },

  async saveVoucherTemplate(ctx) {
    const [current] = await ctx.db.select().from(VT).where(and(eq(VT.companyId, ctx.company.id), eq(VT.id, ctx.params.id)));
    if (!current) throw notFound('Template');
    checkIfMatch(ctx.req, current.version);
    const cols = templateColumns(ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx.update(VT).set({ ...cols, version: current.version + 1, updatedAt: ctx.now }).where(and(eq(VT.id, current.id), eq(VT.version, current.version))).returning();
      if (!updated) throw preconditionFailed();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'updated', entityType: 'voucher_template', entityId: updated.id, entityLabel: updated.name, version: updated.version });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return templateToWire(row, ctx.company.baseCurrency.trim());
  },

  async removeVoucherTemplate(ctx) {
    const [current] = await ctx.db.select().from(VT).where(and(eq(VT.companyId, ctx.company.id), eq(VT.id, ctx.params.id)));
    if (!current) throw notFound('Template');
    checkIfMatch(ctx.req, current.version);
    await ctx.db.transaction(async (tx) => {
      await tx.delete(VT).where(eq(VT.id, current.id));
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'deleted', entityType: 'voucher_template', entityId: current.id, entityLabel: current.name, version: current.version + 1, deleted: true });
    });
    return undefined;
  },

  async getVoucher(ctx) {
    const row = await findVoucher(ctx, ctx.db, ctx.params.id);
    setEtag(ctx.reply, row.version);
    const [wire] = await vouchersToWire(ctx.db, [row], ctx.company.baseCurrency.trim());
    return wire;
  },

  async saveVoucher(ctx) {
    const current = await findVoucher(ctx, ctx.db, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const wasDraft = current.status === 'draft';
    // Omitted keeps it as it is; a draft is posted by saving it as posted.
    const draft = (ctx.body.status ?? current.status) === 'draft';
    if (!wasDraft && draft) throw unprocessable([{ field: 'status', message: 'A posted voucher cannot go back to draft; delete it or post a correcting voucher', severity: 'blocking' }]);
    if (!wasDraft) assertPeriodOpen(ctx.company, current.date);
    if (ctx.body.kind !== current.kind) throw unprocessable([{ field: 'kind', message: 'A voucher keeps its kind; delete it and make another', severity: 'blocking' }]);
    if (current.gstPeriod) throw unprocessable([{ field: 'lines', message: 'A GST set-off is changed by reversing it and posting it again from Utilization', severity: 'blocking' }], 'SET_OFF_LOCKED');
    // A posted voucher's number belongs to its financial year's series (JV/26-27/…).
    if (!wasDraft) {
      const fy = ctx.company.fiscalYearStartMonth;
      if (financialYearOf(ctx.body.date, fy).start !== financialYearOf(current.date, fy).start) {
        throw unprocessable([{ field: 'date', message: `${current.number} is numbered in ${financialYearOf(current.date, fy).label}; to move it to another financial year, delete it and post it again there`, severity: 'blocking' }], 'VOUCHER_YEAR_LOCKED');
      }
    }
    const row = await ctx.db.transaction(async (tx) => {
      const cols = await voucherColumns(ctx, tx, ctx.body, current.id, draft);
      // Posting a draft: it takes its number now, on the date it is posted with.
      const posting = wasDraft && !draft;
      const number = posting ? await assignNumber(tx, { companyId: ctx.company.id, kind: cols.kind, branchId: cols.branchId, date: cols.date }) : current.number;
      const posted = posting ? { status: 'posted' as const, postedAt: ctx.now, postedBy: ctx.user.id } : {};
      const [updated] = await tx.update(V).set({ ...cols, number, ...posted, version: current.version + 1, updatedAt: ctx.now }).where(and(eq(V.id, current.id), eq(V.version, current.version))).returning();
      if (!updated) throw preconditionFailed();
      await linkVoucherAttachments(tx, ctx.company.id, updated.id, ctx.body.attachmentIds);
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: posting ? 'posted' : 'updated', entityType: 'voucher', entityId: updated.id, entityLabel: updated.number, version: updated.version, before: { status: current.status, date: current.date, lines: current.lines }, after: { status: updated.status, date: updated.date, lines: updated.lines } });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    const [wire] = await vouchersToWire(ctx.db, [row], ctx.company.baseCurrency.trim());
    return wire;
  },

  async removeVoucher(ctx) {
    const current = await findVoucher(ctx, ctx.db, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    // A draft was never in the books, so a closed period doesn't hold it.
    if (current.status !== 'draft') assertPeriodOpen(ctx.company, current.date);
    // A GST challan whose money a set-off has already used can't go: the cash ledger would run negative.
    if (current.kind === 'gstChallan' && current.status !== 'draft') {
      const others = (await loadVouchers({ db: ctx.db, company: ctx.company, to: '9999-12-31' })).filter((v) => v.id !== current.id);
      const left = cashLedgerBalance(others.flatMap(postVoucher), '9999-12-31');
      const head = (['igst', 'cgst', 'sgst', 'cess'] as const).find((k) => left[k] < 0);
      if (head) throw conflict('CHALLAN_USED', `A GST set-off has used this challan's ${head.toUpperCase()}; reverse the set-off first`);
    }
    await ctx.db.transaction(async (tx) => {
      await linkVoucherAttachments(tx, ctx.company.id, current.id, []);
      const deleted = await tx.delete(V).where(and(eq(V.id, current.id), eq(V.version, current.version))).returning({ id: V.id });
      if (!deleted.length) throw preconditionFailed();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'deleted', entityType: 'voucher', entityId: current.id, entityLabel: current.number, version: current.version + 1, deleted: true, before: voucherToWire(current, ctx.company.baseCurrency.trim()) });
    });
    return undefined;
  },
});

