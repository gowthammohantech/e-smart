import { and, eq } from 'drizzle-orm';
import { financialYearOf } from '@esmart/core/lib/date';
import { DEFAULT_PREFIXES, defaultSeries, formatNumber, type SeriesKind } from '@esmart/core/domain/numbering';
import type { VoucherKind } from '@esmart/core/types';
import { schema } from '@esmart/db';
import { conflict, unprocessable } from '../http/errors';
import type { DbOrTx } from './audit';
import { newId } from './ids';

const S = schema.numberingSeries;

/** GST rule 46: a tax invoice or credit note number has at most 16 characters. */
export const MAX_TAX_INVOICE_NUMBER = 16;
const VOUCHER_KINDS: VoucherKind[] = ['journal', 'contra', 'gstJournal', 'tdsChallan'];
const isVoucherKind = (kind: SeriesKind): kind is VoucherKind => (VOUCHER_KINDS as string[]).includes(kind);

export const TAX_INVOICE_KINDS: SeriesKind[] = ['invoice', 'salesReturn', 'creditNote', 'debitNote'];

/** The start of the numbering period `date` falls in, or null when the series never resets. */
function periodStart(policy: 'never' | 'yearly' | 'monthly', date: string, fiscalYearStartMonth: number): string | null {
  if (policy === 'monthly') return `${date.slice(0, 7)}-01`;
  if (policy === 'yearly') return financialYearOf(date, fiscalYearStartMonth).start;
  return null;
}

/** Does a record of this kind already carry `number` in the company? */
async function taken(tx: DbOrTx, companyId: string, kind: SeriesKind, number: string): Promise<boolean> {
  const P = schema.payments;
  const E = schema.expenses;
  const V = schema.vouchers;
  const D = schema.documents;
  let rows: { id: string }[];
  if (kind === 'payment') rows = await tx.select({ id: P.id }).from(P).where(and(eq(P.companyId, companyId), eq(P.number, number))).limit(1);
  else if (kind === 'expense') rows = await tx.select({ id: E.id }).from(E).where(and(eq(E.companyId, companyId), eq(E.number, number))).limit(1);
  else if (kind === 'selfInvoice') rows = await tx.select({ id: D.id }).from(D).where(and(eq(D.companyId, companyId), eq(D.selfInvoiceNumber, number))).limit(1);
  else if (isVoucherKind(kind)) rows = await tx.select({ id: V.id }).from(V).where(and(eq(V.companyId, companyId), eq(V.kind, kind), eq(V.number, number))).limit(1);
  else rows = await tx.select({ id: D.id }).from(D).where(and(eq(D.companyId, companyId), eq(D.kind, kind), eq(D.number, number))).limit(1);
  return rows.length > 0;
}

/**
 * Takes the next number from a company's series for `kind`, inside the
 * caller's transaction. The series row is locked (`SELECT … FOR UPDATE`), so
 * two finalisations never draw the same number; if the transaction rolls
 * back, so does the draw.
 *
 * A yearly or monthly series restarts at 1 when `date` falls in a later
 * period than `last_reset_at`. A number that is already on a record (a
 * backdated document after a reset, or a series whose format drops the
 * year) is skipped, so a number is never issued twice.
 */
export async function assignNumber(
  tx: DbOrTx,
  opts: { companyId: string; kind: SeriesKind; branchId?: string | null; date: string },
): Promise<string> {
  let [series] = await tx.select().from(S).where(and(eq(S.companyId, opts.companyId), eq(S.kind, opts.kind))).for('update');
  // A kind added after the company was set up (credit and debit notes) starts its default series on first use.
  if (!series && DEFAULT_PREFIXES[opts.kind]) {
    const d = defaultSeries(opts.companyId, opts.kind, DEFAULT_PREFIXES[opts.kind]);
    await tx
      .insert(S)
      .values({ id: newId('ser'), companyId: opts.companyId, kind: opts.kind, prefix: d.prefix, nextNumber: d.nextNumber, padding: d.padding, includeFiscalYear: d.includeFiscalYear, includeBranchCode: d.includeBranchCode, resetPolicy: d.resetPolicy })
      .onConflictDoNothing();
    [series] = await tx.select().from(S).where(and(eq(S.companyId, opts.companyId), eq(S.kind, opts.kind))).for('update');
  }
  if (!series) throw conflict('NUMBERING_SERIES_MISSING', `The company has no numbering series for ${opts.kind}`);

  const [company] = await tx.select({ fy: schema.companies.fiscalYearStartMonth }).from(schema.companies).where(eq(schema.companies.id, opts.companyId));
  let branchCode: string | undefined;
  if (series.includeBranchCode && opts.branchId) {
    const [branch] = await tx.select({ code: schema.branches.code }).from(schema.branches).where(eq(schema.branches.id, opts.branchId));
    branchCode = branch?.code;
  }

  let next = series.nextNumber;
  let lastResetAt = series.lastResetAt;
  let past = false;
  const fyStart = company?.fy ?? 4;
  const period = periodStart(series.resetPolicy, opts.date, fyStart);
  if (period) {
    const lastPeriod = lastResetAt ? periodStart(series.resetPolicy, lastResetAt, fyStart) : null;
    if (!lastPeriod) lastResetAt = period;
    else if (period > lastPeriod) {
      next = 1;
      lastResetAt = period;
    } else if (period < lastPeriod) {
      // A document replayed into an earlier period takes that period's next free
      // number, and the current period's counter stays where it is.
      past = true;
      next = 1;
    }
  }

  const format = (sequence: number) =>
    formatNumber(
      {
        id: series.id,
        companyId: series.companyId,
        kind: series.kind,
        prefix: series.prefix,
        nextNumber: sequence,
        padding: series.padding,
        includeFiscalYear: series.includeFiscalYear,
        includeBranchCode: series.includeBranchCode,
        resetPolicy: series.resetPolicy,
      },
      { date: opts.date, branchCode, sequence, fiscalYearStartMonth: fyStart },
    );

  let number = format(next);
  for (let guard = 0; await taken(tx, opts.companyId, opts.kind, number); guard++) {
    if (guard > 10_000) throw conflict('NUMBERING_EXHAUSTED', 'Could not find an unused number in this series');
    next += 1;
    number = format(next);
  }

  if (TAX_INVOICE_KINDS.includes(opts.kind) && number.length > MAX_TAX_INVOICE_NUMBER) {
    throw unprocessable([{ field: 'number', message: `${number} is longer than the ${MAX_TAX_INVOICE_NUMBER} characters a tax invoice number can have; shorten the series prefix`, severity: 'blocking' }], 'NUMBER_TOO_LONG');
  }
  if (past) return number;

  const version = series.version + 1;
  await tx
    .update(S)
    .set({ nextNumber: next + 1, lastResetAt, version, updatedAt: new Date() })
    .where(eq(S.id, series.id));
  // Clients pull the new version and next number; without it their next
  // settings save carries a stale version and is refused. Not an audit event:
  // drawing a number is part of the document's own change.
  await tx.insert(schema.changeLog).values({ companyId: series.companyId, entityType: 'numbering_series', entityId: series.id, op: 'upsert', version });
  return number;
}
