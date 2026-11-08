import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { accumulatedDepreciation, assetEntries, assetSchedule, bookValue, depreciationEntries, type FixedAsset, type ScheduleRow } from '@esmart/core/domain/fixedAssets';
import { addDaysISO, businessDate, financialYearOf } from '@esmart/core/lib/date';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { conflict, notFound, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { compact, money, versioned } from '../../lib/wire';
import { costCentreIssues } from '../books/costCentres';

const FA = schema.fixedAssets;
type Row = typeof FA.$inferSelect;
type CompanyRow = typeof schema.companies.$inferSelect;

/** The register's row as core works it out. */
export function assetCore(r: Row): FixedAsset {
  return {
    id: r.id,
    branchId: r.branchId ?? undefined,
    name: r.name,
    category: r.category ?? undefined,
    account: r.account,
    assetCode: r.assetCode ?? undefined,
    acquiredOn: r.acquiredOn,
    inUseFrom: r.inUseFrom,
    costMinor: r.costMinor,
    residualMinor: r.residualMinor,
    method: r.method as FixedAsset['method'],
    lifeMonths: r.lifeMonths ?? undefined,
    rate: r.rate == null ? undefined : Number(r.rate),
    openingDepreciationMinor: r.openingDepreciationMinor,
    openingAsOf: r.openingAsOf ?? undefined,
    costCentreId: r.costCentreId ?? undefined,
    disposedOn: r.disposedOn ?? undefined,
  };
}

/** Every asset in the company's register, as core works it out: for the books (loadBook). */
export async function loadAssets(db: DbOrTx, companyId: string): Promise<FixedAsset[]> {
  return (await db.select().from(FA).where(eq(FA.companyId, companyId))).map(assetCore);
}

/** Depreciation by financial year, from the year it was put to use through the year it is written off or goes. */
function yearsOf(a: FixedAsset, fyStart: number, base: string): NonNullable<Schema<'FixedAsset'>['years']> {
  const far = addDaysISO(a.inUseFrom, 365 * 100);
  const entries = depreciationEntries(a, a.disposedOn ?? far, fyStart);
  const last = entries.at(-1)?.date ?? a.inUseFrom;
  const out: NonNullable<Schema<'FixedAsset'>['years']> = [];
  // From the year it starts depreciating here: after its opening figure, for one bought before the books.
  const first = a.openingAsOf && addDaysISO(a.openingAsOf, 1) > a.inUseFrom ? addDaysISO(a.openingAsOf, 1) : a.inUseFrom;
  for (let fy = financialYearOf(first, fyStart); fy.start <= last; fy = financialYearOf(addDaysISO(fy.end, 1), fyStart)) {
    const depreciation = entries.filter((e) => e.date >= fy.start && e.date <= fy.end).reduce((s, e) => s + e.amountMinor, 0);
    const closing = a.costMinor - accumulatedDepreciation(a, fy.end, fyStart);
    out.push({ label: fy.label, from: fy.start, to: fy.end, opening: money(closing + depreciation, base), depreciation: money(depreciation, base), closing: money(a.disposedOn && a.disposedOn <= fy.end ? 0 : closing, base) });
    if (out.length > 100) break;
  }
  return out;
}

function toWire(r: Row, company: CompanyRow, asOf: string, withYears = false): Schema<'FixedAsset'> {
  const base = company.baseCurrency.trim();
  const fy = company.fiscalYearStartMonth;
  const a = assetCore(r);
  const on = a.disposedOn && a.disposedOn < asOf ? a.disposedOn : asOf;
  return compact({
    id: r.id,
    companyId: r.companyId,
    branchId: r.branchId,
    name: r.name,
    category: r.category,
    account: r.account,
    assetCode: r.assetCode,
    acquiredOn: r.acquiredOn,
    inUseFrom: r.inUseFrom,
    cost: money(r.costMinor, base),
    residualValue: money(r.residualMinor, base),
    method: a.method,
    lifeMonths: r.lifeMonths,
    rate: a.rate,
    openingDepreciation: money(r.openingDepreciationMinor, base),
    openingAsOf: r.openingAsOf,
    sourceDocumentId: r.sourceDocumentId,
    costCentreId: r.costCentreId,
    disposedOn: r.disposedOn,
    disposalNote: r.disposalNote,
    notes: r.notes,
    status: a.disposedOn && a.disposedOn <= asOf ? ('disposed' as const) : ('active' as const),
    accumulatedDepreciation: money(accumulatedDepreciation(a, on, fy), base),
    bookValue: money(bookValue(a, asOf, fy), base),
    ...(withYears && { years: yearsOf(a, fy, base) }),
    ...versioned(r),
  });
}

async function find(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db.select().from(FA).where(and(eq(FA.companyId, companyId), eq(FA.id, id)));
  if (!row) throw notFound('Fixed asset');
  return row;
}

/** The first day on which what an asset posts differs between two versions of it (either may be absent). */
function firstChange(before: FixedAsset | undefined, after: FixedAsset | undefined, fy: number): string | undefined {
  const far = '2199-12-31';
  // Its branch and cost centre are on every entry it posts too, for the branch and cost-centre reports.
  const key = (a?: FixedAsset) => (a ? assetEntries(a, far, fy).map((e) => ({ date: e.date, k: JSON.stringify([e.entries, a.branchId ?? null, a.costCentreId ?? null]) })) : []);
  const x = key(before);
  const y = key(after);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i]?.date !== y[i]?.date || x[i]?.k !== y[i]?.k) {
      const dates = [x[i]?.date, y[i]?.date].filter((d): d is string => !!d);
      return dates.sort()[0];
    }
  }
  return undefined;
}

function assertUnlocked(company: CompanyRow, before: FixedAsset | undefined, after: FixedAsset | undefined) {
  const day = firstChange(before, after, company.fiscalYearStartMonth);
  if (day && company.lockedThroughDate && day <= company.lockedThroughDate) {
    throw conflict('PERIOD_LOCKED', `The books are closed through ${company.lockedThroughDate}; this changes the asset's depreciation from ${day}`);
  }
}

async function columns(db: DbOrTx, company: CompanyRow, body: Schema<'FixedAsset'>, today: string, selfId?: string) {
  const issues: Issue[] = [];
  const block = (field: string, message: string) => issues.push({ field, message, severity: 'blocking' });
  const base = company.baseCurrency.trim();
  const name = body.name.trim();
  if (!name) block('name', 'Give the asset a name');
  for (const [field, m] of [['cost', body.cost], ['residualValue', body.residualValue], ['openingDepreciation', body.openingDepreciation]] as const) {
    if (m && m.currency !== base) block(field, `The register is in ${base}`);
  }
  const cost = body.cost.minor;
  const residual = body.residualValue?.minor ?? 0;
  const opening = body.openingDepreciation?.minor ?? 0;
  if (cost <= 0) block('cost', 'The cost must be more than nothing');
  if (residual < 0 || residual >= cost) block('residualValue', 'The residual value is less than the cost, or nothing');
  if (opening < 0 || opening > Math.max(0, cost - residual)) block('openingDepreciation', 'What was written off can’t be more than the cost less the residual value');
  if (opening && !body.openingAsOf) block('openingAsOf', 'Give the day the depreciation already written off stood at');
  if (body.inUseFrom < body.acquiredOn) block('inUseFrom', 'It is put to use on or after the day it was acquired');
  if (body.openingAsOf && body.openingAsOf < body.acquiredOn) block('openingAsOf', 'The opening figure is on or after the day it was acquired');
  if (body.disposedOn && body.disposedOn < body.inUseFrom) block('disposedOn', 'It goes on or after the day it was put to use');
  if (body.disposedOn && body.openingAsOf && body.disposedOn <= body.openingAsOf) block('disposedOn', 'It goes after the day of its opening figure');
  if (body.disposedOn && body.disposedOn > today) block('disposedOn', 'A disposal is recorded once it has happened');
  if (body.method === 'slm' && !body.lifeMonths) block('lifeMonths', 'Straight line needs a useful life');
  if (body.method === 'wdv' && !body.rate) block('rate', 'Written down value needs a rate');

  // Its cost sits in a fixed-asset account: Plant and machinery, or one of the company's own.
  const account = body.account.trim();
  if (account !== 'sys:fixedAssets') {
    const id = account.startsWith('acc:') ? account.slice(4) : '';
    const LA = schema.ledgerAccounts;
    const [la] = id ? await db.select({ group: LA.group }).from(LA).where(and(eq(LA.companyId, company.id), eq(LA.id, id))) : [];
    if (!la || la.group !== 'fixedAssets') block('account', 'Choose a fixed-asset account: Plant and machinery, or one of yours under Fixed assets');
  }
  if (body.branchId) {
    const B = schema.branches;
    const [b] = await db.select({ id: B.id }).from(B).where(and(eq(B.companyId, company.id), eq(B.id, body.branchId)));
    if (!b) block('branchId', 'No such branch in this company');
  }
  issues.push(...(await costCentreIssues(db, company.id, [{ field: 'costCentreId', id: body.costCentreId }])));
  if (body.sourceDocumentId) {
    const D = schema.documents;
    const [d] = await db.select({ kind: D.kind }).from(D).where(and(eq(D.companyId, company.id), eq(D.id, body.sourceDocumentId)));
    if (!d || d.kind !== 'purchaseBill') block('sourceDocumentId', 'No such purchase bill in this company');
  }
  const code = body.assetCode?.trim() || null;
  if (code) {
    const [same] = await db.select({ id: FA.id }).from(FA).where(and(eq(FA.companyId, company.id), eq(FA.assetCode, code)));
    if (same && same.id !== selfId) block('assetCode', `Another asset is ${code}`);
  }
  if (issues.length) throw unprocessable(issues);
  return {
    branchId: body.branchId || null,
    name,
    category: body.category?.trim() || null,
    account,
    assetCode: code,
    acquiredOn: body.acquiredOn,
    inUseFrom: body.inUseFrom,
    costMinor: cost,
    residualMinor: residual,
    method: body.method,
    lifeMonths: body.method === 'slm' ? body.lifeMonths! : null,
    rate: body.method === 'wdv' ? String(body.rate) : null,
    openingDepreciationMinor: opening,
    openingAsOf: opening ? body.openingAsOf! : body.openingAsOf || null,
    sourceDocumentId: body.sourceDocumentId || null,
    costCentreId: body.costCentreId || null,
    disposedOn: body.disposedOn || null,
    disposalNote: body.disposalNote?.trim() || null,
    notes: body.notes?.trim() || null,
  };
}

const audit = (r: Row) => ({ name: r.name, cost: r.costMinor, method: r.method, inUseFrom: r.inUseFrom, disposedOn: r.disposedOn });

const total = (rows: ScheduleRow[]) => {
  const keys = ['openingCost', 'additions', 'disposals', 'closingCost', 'openingDepreciation', 'depreciation', 'depreciationOnDisposals', 'closingDepreciation', 'openingValue', 'closingValue'] as const;
  return Object.fromEntries(keys.map((k) => [k, rows.reduce((s, r) => s + r[k], 0)])) as Pick<ScheduleRow, (typeof keys)[number]>;
};

/** The fixed asset register (RULES 6.15). */
export const fixedAssetHandlers = defineHandlers({
  async listFixedAssets(ctx) {
    const asOf = ctx.query.asOf ?? businessDate(ctx.now);
    const rows = await ctx.db
      .select()
      .from(FA)
      .where(and(eq(FA.companyId, ctx.company.id), ctx.query.status === 'disposed' ? isNotNull(FA.disposedOn) : ctx.query.status === 'active' ? isNull(FA.disposedOn) : undefined))
      .orderBy(asc(FA.category), asc(FA.name), asc(FA.id));
    return { data: rows.map((r) => toWire(r, ctx.company, asOf)) };
  },

  async getFixedAssetSchedule(ctx) {
    const { from, to, branchId } = ctx.query;
    const assets = (await loadAssets(ctx.db, ctx.company.id)).filter((a) => !branchId || a.branchId === branchId);
    const rows = assetSchedule(assets, { from, to }, ctx.company.fiscalYearStartMonth);
    return { from, to, rows: rows.map((r) => compact(r)), totals: total(rows) };
  },

  async createFixedAsset(ctx) {
    const cols = await columns(ctx.db, ctx.company, ctx.body, businessDate(ctx.now));
    const id = newId('fa');
    assertUnlocked(ctx.company, undefined, assetCore({ id, ...cols } as Row));
    const row = await ctx.db.transaction(async (tx) => {
      const [created] = await tx.insert(FA).values({ id, companyId: ctx.company.id, createdBy: ctx.user.id, ...cols, createdAt: ctx.now, updatedAt: ctx.now }).returning();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'created', entityType: 'fixed_asset', entityId: created.id, entityLabel: created.name, version: created.version, after: audit(created) });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return toWire(row, ctx.company, businessDate(ctx.now), true);
  },

  async getFixedAsset(ctx) {
    const row = await find(ctx.db, ctx.company.id, ctx.params.id);
    setEtag(ctx.reply, row.version);
    return toWire(row, ctx.company, businessDate(ctx.now), true);
  },

  async saveFixedAsset(ctx) {
    const current = await find(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const cols = await columns(ctx.db, ctx.company, ctx.body, businessDate(ctx.now), current.id);
    assertUnlocked(ctx.company, assetCore(current), assetCore({ ...current, ...cols }));
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx.update(FA).set({ ...cols, version: current.version + 1, updatedAt: ctx.now }).where(and(eq(FA.id, current.id), eq(FA.version, current.version))).returning();
      if (!updated) throw preconditionFailed();
      const action = !current.disposedOn && updated.disposedOn ? 'disposed' : 'updated';
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action, entityType: 'fixed_asset', entityId: updated.id, entityLabel: updated.name, version: updated.version, before: audit(current), after: audit(updated) });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return toWire(row, ctx.company, businessDate(ctx.now), true);
  },

  async removeFixedAsset(ctx) {
    const current = await find(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    assertUnlocked(ctx.company, assetCore(current), undefined);
    await ctx.db.transaction(async (tx) => {
      const deleted = await tx.delete(FA).where(and(eq(FA.id, current.id), eq(FA.version, current.version))).returning({ id: FA.id });
      if (!deleted.length) throw preconditionFailed();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'deleted', entityType: 'fixed_asset', entityId: current.id, entityLabel: current.name, version: current.version + 1, deleted: true, before: audit(current) });
    });
    return undefined;
  },
});
