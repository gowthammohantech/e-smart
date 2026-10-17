import { and, desc, eq, lte } from 'drizzle-orm';
import { SERIES_KINDS, formatNumber } from '@esmart/core/domain/numbering';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { invalid, notFound, preconditionFailed } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { audit } from './shared';
import { seriesToWire } from './wire';

const S = schema.numberingSeries;

async function findSeries(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db.select().from(S).where(and(eq(S.companyId, companyId), eq(S.id, id)));
  if (!row) throw notFound('Numbering series');
  return row;
}

export const numberingHandlers = defineHandlers({
  async listNumberingSeries(ctx) {
    const rows = await ctx.db.select().from(S).where(eq(S.companyId, ctx.company.id));
    rows.sort((a, b) => SERIES_KINDS.indexOf(a.kind) - SERIES_KINDS.indexOf(b.kind));
    return { data: rows.map(seriesToWire) };
  },

  /**
   * Numbers are never reused, so `nextNumber` only moves forward. The write
   * also re-checks that under the version guard, in case a document was
   * numbered from this series in between.
   */
  async saveNumberingSeries(ctx) {
    const current = await findSeries(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const body = ctx.body;
    if (body.kind !== current.kind) throw invalid('kind', `This is the ${current.kind} series; its kind can't change`);
    const prefix = body.prefix.trim();
    if (!prefix || prefix.length > 20) throw invalid('prefix', 'The prefix needs 1 to 20 characters');
    if (body.nextNumber < current.nextNumber) {
      throw invalid('nextNumber', `Numbers up to ${current.nextNumber - 1} may already be used; the next number can't go below ${current.nextNumber}`, 'NUMBER_REUSE');
    }
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(S)
        .set({
          prefix,
          nextNumber: body.nextNumber,
          padding: body.padding,
          includeFiscalYear: body.includeFiscalYear ?? current.includeFiscalYear,
          includeBranchCode: body.includeBranchCode ?? current.includeBranchCode,
          resetPolicy: body.resetPolicy ?? current.resetPolicy,
          version: current.version + 1,
          updatedAt: ctx.now,
        })
        .where(and(eq(S.id, current.id), eq(S.version, current.version), lte(S.nextNumber, body.nextNumber)))
        .returning();
      if (!updated) throw preconditionFailed();
      await audit(tx, ctx.user, ctx.company.id, 'numbering_series', 'updated', updated, `${updated.kind} series`, { before: seriesToWire(current), after: seriesToWire(updated) });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return seriesToWire(row);
  },

  /**
   * core's formatNumber on the series as it stands. The branch code comes
   * from `branchId`, else the primary branch, since every document belongs
   * to one.
   */
  async previewNextNumber(ctx) {
    const series = await findSeries(ctx.db, ctx.company.id, ctx.params.id);
    const B = schema.branches;
    let branchCode: string | undefined;
    if (ctx.query.branchId) {
      const [branch] = await ctx.db.select({ code: B.code }).from(B).where(and(eq(B.companyId, ctx.company.id), eq(B.id, ctx.query.branchId)));
      if (!branch) throw notFound('Branch');
      branchCode = branch.code;
    } else if (series.includeBranchCode) {
      const [primary] = await ctx.db.select({ code: B.code }).from(B).where(eq(B.companyId, ctx.company.id)).orderBy(desc(B.isPrimary), B.createdAt).limit(1);
      branchCode = primary?.code;
    }
    const date = ctx.query.date ?? ctx.now.toISOString().slice(0, 10);
    const { lastResetAt: _reset, version: _v, updatedAt: _u, ...core } = series;
    return { number: formatNumber(core, { date, branchCode }) };
  },
});
