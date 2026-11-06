import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { cashLedgerBalance, HEADS, oldReverseChargeOpen, outputCheck, prefillSetOff, setOffIssues, setOffLines, zeroHeads, type Heads, type SetOff, type SetOffInput } from '@esmart/core/domain/gstUtilization';
import { liabilityOf } from '@esmart/core/domain/gstr3b';
import { postVoucher } from '@esmart/core/domain/ledger/postings';
import { businessDate } from '@esmart/core/lib/date';
import { schema } from '@esmart/db';
import { defineHandlers, type AuthUser, type CompanyRow } from '../../context';
import { conflict, invalid, unprocessable } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { assignNumber } from '../../lib/numbering';
import { loadBook, loadVouchers } from '../books/book';
import { voucherToWire } from '../books/handlers';
import { assertPeriodOpen } from '../documents/lifecycle';
import { periodBounds } from './gstr2b';
import { branchesOf, build3b } from './gstr3bBuild';
import { assertCompanyGstin } from './portal';

const V = schema.vouchers;

/** The set-off journals already posted for a GSTIN and period: by hand from Utilization, or when 3B was filed. */
export async function existingSetOffs(db: DbOrTx, companyId: string, gstin: string, period: string) {
  return db
    .select()
    .from(V)
    .where(and(eq(V.companyId, companyId), eq(V.kind, 'gstJournal'), eq(V.gstin, gstin), eq(V.gstPeriod, period), ne(V.status, 'draft')));
}

/** The GST cash ledger by head on `asOf`, for a GSTIN's branches. Only vouchers move it (challans in, set-offs out). */
export async function cashLedgerOf(db: DbOrTx, company: CompanyRow, gstin: string, asOf: string): Promise<Heads> {
  const branchIds = await branchesOf(db, company, gstin);
  const vouchers = await loadVouchers({ db, company, to: asOf });
  return cashLedgerBalance(vouchers.flatMap(postVoucher), asOf, branchIds);
}

/** Everything the set-off is checked against: the 3B's liability and credit, the books' cash ledger and open reverse charge. */
async function setOffInput(db: DbOrTx, company: CompanyRow, user: AuthUser, gstin: string, period: string, date: string, now: Date) {
  const built = await build3b(db, company, gstin, period, now);
  const t = built.tables;
  const { forward, reverseCharge } = liabilityOf(t);
  const available = zeroHeads();
  for (const k of HEADS) available[k] = t.itc.net[k] + built.carriedIn[k];
  const branchIds = await branchesOf(db, company, gstin);
  const { from, to } = periodBounds(period);
  const { postings } = await loadBook({ db, company, user, now, from: '1900-01-01', to: date > to ? date : to });
  const setOffIds = new Set(
    (await db.select({ id: V.id }).from(V).where(and(eq(V.companyId, company.id), eq(V.kind, 'gstJournal'), isNotNull(V.gstPeriod)))).map((r) => r.id),
  );
  const input: SetOffInput = {
    forward,
    reverseCharge,
    available,
    cashBalance: cashLedgerBalance(postings, date, branchIds),
    oldReverseChargeOpen: oldReverseChargeOpen(postings, date, branchIds),
    interest: { igst: t.interest.igst, cgst: t.interest.cgst, sgst: t.interest.sgst, cess: t.interest.cess },
    lateFee: { igst: 0, cgst: t.lateFee.cgst, sgst: t.lateFee.sgst, cess: 0 },
  };
  const check = outputCheck(postings, { from, to }, { forward, reverseCharge }, { branchIds, isSetOff: (p) => p.source.type === 'voucher' && setOffIds.has(p.source.id) });
  return { input, carriedIn: built.carriedIn as Heads, check, from, to };
}

const heads = (h: Partial<Heads> | undefined): Heads => ({ igst: h?.igst ?? 0, cgst: h?.cgst ?? 0, sgst: h?.sgst ?? 0, cess: h?.cess ?? 0 });

/** GST set-off (utilization) by hand, for a GSTIN and return period (RULES 6.21, pending CA). */
export const gstUtilizationHandlers = defineHandlers({
  async getGstUtilization(ctx) {
    const { gstin, period } = ctx.query;
    await assertCompanyGstin(ctx.db, ctx.company, gstin);
    const date = ctx.query.date ?? businessDate(ctx.now);
    const { input, carriedIn, check, from, to } = await setOffInput(ctx.db, ctx.company, ctx.user, gstin, period, date, ctx.now);
    const base = ctx.company.baseCurrency.trim();
    const existing = await existingSetOffs(ctx.db, ctx.company.id, gstin, period);
    return {
      gstin,
      period,
      from,
      to,
      currency: base,
      forward: input.forward,
      reverseCharge: input.reverseCharge,
      available: input.available,
      carriedIn,
      cashBalance: input.cashBalance,
      oldReverseChargeOpen: input.oldReverseChargeOpen,
      interest: input.interest,
      lateFee: input.lateFee,
      prefill: prefillSetOff(input),
      outputCheck: check,
      existing: existing.map((v) => voucherToWire(v, base)),
    };
  },

  async postGstUtilization(ctx) {
    const { gstin, period, date } = ctx.body;
    await assertCompanyGstin(ctx.db, ctx.company, gstin);
    const { to } = periodBounds(period);
    if (date < to) throw invalid('date', `A set-off for ${period.slice(0, 2)}/${period.slice(2)} is dated on or after ${to}`);
    if (date > businessDate(ctx.now)) throw invalid('date', 'The set-off date cannot be in the future');
    assertPeriodOpen(ctx.company, date);
    const b = ctx.body.setOff;
    const setOff: SetOff = {
      credit: { igst: heads(b.credit.igst), cgst: heads(b.credit.cgst), sgst: heads(b.credit.sgst), cess: heads(b.credit.cess) },
      cash: heads(b.cash),
      reverseCharge: heads(b.reverseCharge),
      oldReverseCharge: heads(b.oldReverseCharge),
      interest: heads(b.interest),
      lateFee: heads(b.lateFee),
    };
    const row = await ctx.db.transaction(async (tx) => {
      // One set-off a period: a second waits for the first and then finds it.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`gst-setoff:${ctx.company.id}:${gstin}:${period}`}))`);
      const [already] = await existingSetOffs(tx, ctx.company.id, gstin, period);
      if (already) throw conflict('SET_OFF_EXISTS', `${period.slice(0, 2)}/${period.slice(2)} is already set off by ${already.number}; reverse it to record another`);
      const { input } = await setOffInput(tx, ctx.company, ctx.user, gstin, period, date, ctx.now);
      const issues = setOffIssues(input, setOff);
      if (issues.length) {
        throw unprocessable(
          issues.map((i) => ({ field: i.field, message: i.message, severity: 'blocking' as const })),
          issues.some((i) => i.code === 'CASH_LEDGER_SHORT') ? 'CASH_LEDGER_SHORT' : 'VALIDATION_FAILED',
        );
      }
      const lines = setOffLines(setOff);
      if (!lines.length) throw invalid('setOff', 'Nothing to set off for this period');
      const [branchId] = await branchesOf(tx, ctx.company, gstin);
      const id = newId('vch');
      const number = await assignNumber(tx, { companyId: ctx.company.id, kind: 'gstJournal', branchId, date });
      const [created] = await tx
        .insert(V)
        .values({
          id,
          companyId: ctx.company.id,
          branchId,
          kind: 'gstJournal',
          number,
          status: 'posted',
          postedAt: ctx.now,
          postedBy: ctx.user.id,
          date,
          narration: ctx.body.narration?.trim() || `GST set-off for ${period.slice(0, 2)}/${period.slice(2)}`,
          lines,
          gstin,
          gstPeriod: period,
          createdBy: ctx.user.id,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        })
        .returning();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: `set off GST for ${period}`, entityType: 'voucher', entityId: created.id, entityLabel: created.number, version: created.version, after: { lines } });
      return created;
    });
    return voucherToWire(row, ctx.company.baseCurrency.trim());
  },
});
