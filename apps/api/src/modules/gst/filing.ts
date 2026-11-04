import { and, eq, inArray } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { gstr3bJson, type Amounts, type TaxKind } from '@esmart/core/domain/gstr3b';
import { schema } from '@esmart/db';
import { defineHandlers, type AuthUser, type CompanyRow, type Deps } from '../../context';
import { ApiError, conflict, invalid } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { assignNumber } from '../../lib/numbering';
import { money } from '../../lib/wire';
import { ReturnsError, type ReturnType } from '../../providers/returns';
import { periodBounds } from './gstr2b';
import { build3b, branchesOf } from './gstr3bBuild';
import { gstnJson } from './gstn';
import { buildGstr1 } from './handlers';
import { assertCompanyGstin, portalContext, returnsFailure } from './portal';

const R = schema.gstReturns;
type ReturnRow = typeof R.$inferSelect;
const KINDS: TaxKind[] = ['igst', 'cgst', 'sgst', 'cess'];
/** What a lost answer leaves on the return, for the tracker to settle. */
export const ANSWER_LOST = 'No answer from the GST portal; checking whether it went through';

function returnWire(row: ReturnRow): Schema<'GstReturn'> {
  return {
    id: row.id,
    gstin: row.gstin,
    returnType: row.returnType,
    period: row.period,
    status: row.status,
    arn: row.arn ?? undefined,
    filedOn: row.filedAt?.toISOString().slice(0, 10),
    referenceId: row.referenceId ?? undefined,
    lastError: row.lastError ?? undefined,
  };
}

async function findReturn(db: DbOrTx, companyId: string, gstin: string, returnType: ReturnType, period: string) {
  const [row] = await db.select().from(R).where(and(eq(R.companyId, companyId), eq(R.gstin, gstin), eq(R.returnType, returnType), eq(R.period, period)));
  return row;
}

async function upsertReturn(db: DbOrTx, companyId: string, gstin: string, returnType: ReturnType, period: string, set: Partial<typeof R.$inferInsert>, now: Date) {
  const [row] = await db
    .insert(R)
    .values({ id: newId('gret'), companyId, gstin, returnType, period, ...set, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [R.companyId, R.gstin, R.returnType, R.period], set: { ...set, updatedAt: now } })
    .returning();
  return row;
}

/** The return's data as GSTN takes it, with our totals to compare against the portal's summary. */
async function payloadFor(db: DbOrTx, company: CompanyRow, gstin: string, returnType: ReturnType, period: string, now: Date) {
  if (returnType === 'gstr1') {
    const summary = await buildGstr1(db, company, period, now);
    return { json: { ...gstnJson(summary, gstin, period), totals: { taxableMinor: summary.totals.taxableValue.minor, taxMinor: summary.totals.tax.minor } }, utilization: undefined };
  }
  const built = await build3b(db, company, gstin, period, now);
  return { json: gstr3bJson(built.tables, gstin, built.utilization), utilization: built.utilization };
}

/** Asks the portal whether the return is already filed, and records it if so. */
async function settleFromTracker(db: DbOrTx, deps: Deps, company: CompanyRow, row: ReturnRow): Promise<ReturnRow | null> {
  const ctx = await portalContext(db, deps, company, row.gstin);
  const y = Number(row.period.slice(2));
  const m = Number(row.period.slice(0, 2));
  const fyStart = m >= 4 ? y : y - 1;
  const tracked = await deps.providers.returns.trackReturns(ctx, `${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}`);
  const filed = tracked.find((t) => t.returnType === row.returnType && t.period === row.period && t.status === 'filed');
  if (!filed) return null;
  const [updated] = await db
    .update(R)
    .set({ status: 'filed', arn: filed.arn ?? row.arn, filedAt: filed.filedOn ? new Date(`${filed.filedOn}T00:00:00Z`) : deps.now(), lastError: null, updatedAt: deps.now() })
    .where(eq(R.id, row.id))
    .returning();
  return updated;
}

/**
 * After GSTR-3B is filed: the books close through the period, and the set-off is posted as a GST
 * journal (output tax against the credit that paid it). Tax paid in cash stays on the output and
 * reverse-charge ledgers until the challan payment is recorded.
 */
async function afterFiled3b(tx: DbOrTx, company: CompanyRow, actor: AuthUser, row: ReturnRow, now: Date) {
  const { to } = periodBounds(row.period);
  if (!company.lockedThroughDate || company.lockedThroughDate < to) {
    await tx.update(schema.companies).set({ lockedThroughDate: to, updatedAt: now }).where(eq(schema.companies.id, company.id));
  }
  const used = (row.payload as { utilization?: { credit: Record<TaxKind, Record<TaxKind, number>> } } | null)?.utilization?.credit;
  if (!used) return;
  const out: Record<TaxKind, number> = { igst: 0, cgst: 0, sgst: 0, cess: 0 };
  const inp: Record<TaxKind, number> = { igst: 0, cgst: 0, sgst: 0, cess: 0 };
  for (const from of KINDS) for (const to2 of KINDS) {
    out[to2] += used[from][to2];
    inp[from] += used[from][to2];
  }
  const cap = (k: TaxKind) => k.charAt(0).toUpperCase() + k.slice(1);
  const lines = [
    ...KINDS.filter((k) => out[k]).map((k) => ({ account: `sys:output${cap(k)}`, debitMinor: out[k], creditMinor: 0 })),
    ...KINDS.filter((k) => inp[k]).map((k) => ({ account: `sys:input${cap(k)}`, debitMinor: 0, creditMinor: inp[k] })),
  ];
  if (!lines.length) return;
  const [branchId] = await branchesOf(tx, company, row.gstin);
  const number = await assignNumber(tx, { companyId: company.id, kind: 'gstJournal', branchId, date: to });
  await tx.insert(schema.vouchers).values({
    id: newId('vch'),
    companyId: company.id,
    branchId,
    kind: 'gstJournal',
    number,
    date: to,
    narration: `GST set-off for ${row.period.slice(0, 2)}/${row.period.slice(2)} (GSTR-3B ${row.arn ?? ''})`.trim(),
    reference: row.arn,
    lines,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  });
}

function assertNotFiled(row: ReturnRow | undefined) {
  if (row?.status === 'filed') throw conflict('RETURN_FILED', `This return was filed (ARN ${row.arn ?? 'on record'}); corrections go in a later period`);
}

const call = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (error) {
    returnsFailure(error);
  }
};

const amounts = (a: Partial<Amounts> | Record<TaxKind, number>, base: string): Schema<'GstAmounts'> => ({
  taxable: money('taxable' in a ? (a.taxable ?? 0) : 0, base),
  igst: money(a.igst ?? 0, base),
  cgst: money(a.cgst ?? 0, base),
  sgst: money(a.sgst ?? 0, base),
  cess: money(a.cess ?? 0, base),
});

/** GST returns: GSTR-3B from the books, and saving and filing both returns through the portal. */
export const gstFilingHandlers = defineHandlers({
  async getGstr3b(ctx) {
    const { gstin, period } = ctx.query;
    await assertCompanyGstin(ctx.db, ctx.company, gstin);
    const base = ctx.company.baseCurrency.trim();
    const b = await build3b(ctx.db, ctx.company, gstin, period, ctx.now);
    const t = b.tables;
    const returns = await ctx.db.select().from(R).where(and(eq(R.companyId, ctx.company.id), eq(R.gstin, gstin), eq(R.period, period), inArray(R.returnType, ['gstr1', 'gstr3b'])));
    const a = (x: Amounts) => amounts(x, base);
    return {
      gstin,
      period,
      dueDate: b.due,
      filingEnabled: ctx.deps.config.GST_FILING_ENABLED,
      outward: { taxable: a(t.outward.taxable), zeroRated: a(t.outward.zeroRated), nilExempt: a(t.outward.nilExempt), reverseCharge: a(t.outward.reverseCharge), nonGst: a(t.outward.nonGst) },
      interStateUnregistered: t.interStateUnregistered.map((x) => ({ placeOfSupply: x.placeOfSupply, taxable: money(x.taxable, base), igst: money(x.igst, base) })),
      itc: Object.fromEntries(Object.entries(t.itc).map(([k, v]) => [k, a(v)])),
      inwardExempt: { interState: money(t.inwardExempt.interState, base), intraState: money(t.inwardExempt.intraState, base) },
      interest: a(t.interest),
      lateFee: amounts({ cgst: t.lateFee.cgst, sgst: t.lateFee.sgst }, base),
      setOff: {
        liability: amounts(b.utilization.liability, base),
        credit: Object.fromEntries(KINDS.map((k) => [k, amounts(b.utilization.credit[k], base)])),
        cash: amounts(b.utilization.cash, base),
        carriedIn: amounts(b.carriedIn, base),
        carriedForward: amounts(b.utilization.carriedForward, base),
      },
      returns: returns.map(returnWire),
    };
  },

  async saveGstReturn(ctx) {
    const returnType = ctx.params.returnType as ReturnType;
    const { gstin, period } = ctx.body;
    await assertCompanyGstin(ctx.db, ctx.company, gstin);
    assertNotFiled(await findReturn(ctx.db, ctx.company.id, gstin, returnType, period));
    const { json, utilization } = await payloadFor(ctx.db, ctx.company, gstin, returnType, period, ctx.now);
    const pctx = await portalContext(ctx.db, ctx.deps, ctx.company, gstin);
    // Saving replaces what was saved, so a save whose answer was lost is simply saved again.
    const { referenceId } = await call(() => ctx.deps.providers.returns.save(pctx, returnType, period, json));
    const status = await call(() => ctx.deps.providers.returns.returnStatus(pctx, period, referenceId));
    const row = await upsertReturn(
      ctx.db,
      ctx.company.id,
      gstin,
      returnType,
      period,
      { status: status.status === 'error' ? 'failed' : 'saved', payload: { ...json, utilization }, referenceId, lastError: status.errors?.join('; ') || null },
      ctx.now,
    );
    await recordChange(ctx.db, ctx.user, { companyId: ctx.company.id, action: `saved ${returnType.toUpperCase()} for ${period}`, entityType: 'company', entityId: ctx.company.id, entityLabel: gstin, version: ctx.company.version });
    return returnWire(row);
  },

  async offsetGstReturn(ctx) {
    if (ctx.params.returnType !== 'gstr3b') throw invalid('returnType', 'Only GSTR-3B is set off');
    const { gstin, period } = ctx.body;
    const row = await findReturn(ctx.db, ctx.company.id, gstin, 'gstr3b', period);
    if (!row || row.status === 'prepared' || row.status === 'failed') throw conflict('RETURN_NOT_SAVED', 'Save the return first');
    assertNotFiled(row);
    const pctx = await portalContext(ctx.db, ctx.deps, ctx.company, gstin);
    const utilization = (row.payload as { utilization?: unknown } | null)?.utilization;
    const { referenceId } = await call(() => ctx.deps.providers.returns.offset(pctx, period, utilization));
    const [updated] = await ctx.db.update(R).set({ status: 'submitted', referenceId, lastError: null, updatedAt: ctx.now }).where(eq(R.id, row.id)).returning();
    return returnWire(updated);
  },

  async proceedGstReturn(ctx) {
    if (ctx.params.returnType !== 'gstr1') throw invalid('returnType', 'Only GSTR-1 is frozen before filing; GSTR-3B is set off');
    const { gstin, period } = ctx.body;
    const row = await findReturn(ctx.db, ctx.company.id, gstin, 'gstr1', period);
    if (!row || row.status === 'prepared' || row.status === 'failed') throw conflict('RETURN_NOT_SAVED', 'Save the return first');
    assertNotFiled(row);
    const pctx = await portalContext(ctx.db, ctx.deps, ctx.company, gstin);
    const { referenceId } = await call(() => ctx.deps.providers.returns.proceedToFile(pctx, 'gstr1', period));
    const [updated] = await ctx.db.update(R).set({ status: 'submitted', referenceId, lastError: null, updatedAt: ctx.now }).where(eq(R.id, row.id)).returning();
    return returnWire(updated);
  },

  async requestGstReturnEvc(ctx) {
    const returnType = ctx.params.returnType as ReturnType;
    const { gstin, period } = ctx.body;
    const row = await findReturn(ctx.db, ctx.company.id, gstin, returnType, period);
    if (!row) throw conflict('RETURN_NOT_SAVED', 'Save the return first');
    const pctx = await portalContext(ctx.db, ctx.deps, ctx.company, gstin);
    await call(() => ctx.deps.providers.returns.requestEvc(pctx, returnType, ctx.body.pan ?? gstin.slice(2, 12)));
    return returnWire(row);
  },

  async fileGstReturn(ctx) {
    if (!ctx.deps.config.GST_FILING_ENABLED) throw new ApiError(503, 'FILING_DISABLED', 'Filing through the app is not switched on yet; file on the GST portal, using the saved return');
    const returnType = ctx.params.returnType as ReturnType;
    const { gstin, period, otp } = ctx.body;
    const pan = ctx.body.pan ?? gstin.slice(2, 12);
    await assertCompanyGstin(ctx.db, ctx.company, gstin);
    let row = await findReturn(ctx.db, ctx.company.id, gstin, returnType, period);
    assertNotFiled(row);
    if (!row || row.status !== 'submitted') throw conflict('RETURN_NOT_READY', returnType === 'gstr1' ? 'Save and proceed to file first' : 'Save and set off the liability first');
    if (returnType === 'gstr3b') {
      const r1 = await findReturn(ctx.db, ctx.company.id, gstin, 'gstr1', period);
      if (r1?.status !== 'filed') throw conflict('GSTR1_FIRST', 'File the period’s GSTR-1 before its GSTR-3B');
    }
    // Never twice: the portal is asked first.
    const already = await call(() => settleFromTracker(ctx.db, ctx.deps, ctx.company, row!));
    if (already) return returnWire(already);
    const pctx = await portalContext(ctx.db, ctx.deps, ctx.company, gstin);
    const summary = await call(() => ctx.deps.providers.returns.summary(pctx, returnType, period));
    let arn: string;
    try {
      ({ arn } = await ctx.deps.providers.returns.file(pctx, returnType, period, pan, otp, summary.hash));
    } catch (error) {
      if (error instanceof ReturnsError && error.code === 'UNANSWERED') {
        await ctx.db.update(R).set({ lastError: ANSWER_LOST, updatedAt: ctx.now }).where(eq(R.id, row.id));
        const settled = await call(() => settleFromTracker(ctx.db, ctx.deps, ctx.company, row!)).catch(() => null);
        if (settled) row = settled;
        else throw new ApiError(502, 'GSP_UNAVAILABLE', `${ANSWER_LOST}; it will be checked again, so don't file it on the portal yet`);
      } else returnsFailure(error);
    }
    const filed = await ctx.db.transaction(async (tx) => {
      const [updated] =
        row!.status === 'filed'
          ? [row!]
          : await tx.update(R).set({ status: 'filed', arn: arn!, summaryHash: summary.hash, filedAt: ctx.now, lastError: null, updatedAt: ctx.now }).where(eq(R.id, row!.id)).returning();
      if (returnType === 'gstr3b') await afterFiled3b(tx, ctx.company, ctx.user, updated, ctx.now);
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: `filed ${returnType.toUpperCase()} for ${period}`, entityType: 'company', entityId: ctx.company.id, entityLabel: gstin, version: ctx.company.version, after: { arn: updated.arn } });
      return updated;
    });
    return returnWire(filed);
  },
});

/** The `gst.returns.recover` job: returns whose filing answer was lost, settled from the portal's tracker. */
export async function recoverLostFilings(deps: Deps): Promise<number> {
  const rows = await deps.db.select().from(R).where(and(eq(R.status, 'submitted'), eq(R.lastError, ANSWER_LOST)));
  let settled = 0;
  for (const row of rows) {
    const [company] = await deps.db.select().from(schema.companies).where(eq(schema.companies.id, row.companyId));
    try {
      const done = await settleFromTracker(deps.db, deps, company, row);
      if (!done) continue;
      settled++;
      if (done.returnType === 'gstr3b') {
        const [owner] = await deps.db.select().from(schema.users).where(eq(schema.users.accountId, company.accountId)).limit(1);
        await deps.db.transaction((tx) => afterFiled3b(tx, company, { id: owner.id } as AuthUser, done, deps.now()));
      }
    } catch {
      // Not connected or no answer: the next run asks again.
    }
  }
  return settled;
}
