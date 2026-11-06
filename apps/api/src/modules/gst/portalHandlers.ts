import { and, eq, inArray } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { ApiError } from '../../http/errors';
import { recordChange } from '../../lib/audit';
import { encrypt } from '../../lib/crypto';
import { claimMatched, decide, fetchGstr2b, importGstr2b, reconciliation } from './gstr2b';
import { assertCompanyGstin, companyGstins, portalContext, returnsFailure, sessionWire } from './portal';

const S = schema.gstPortalSessions;
const R = schema.gstReturns;

/** An OTP request is accepted once a minute per GSTIN, as the portal itself allows. */
const OTP_GAP_MS = 60_000;

/** The twelve return periods (MMYYYY) of a financial year written 2026-27. */
function periodsOf(fy: string): string[] {
  const start = Number(fy.slice(0, 4));
  return [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map((m) => `${String(m).padStart(2, '0')}${m >= 4 ? start : start + 1}`);
}

/** GST portal: the taxpayer's session per GSTIN, and the returns filed through it. */
export const gstPortalHandlers = defineHandlers({
  async listGstPortalSessions(ctx) {
    const gstins = await companyGstins(ctx.db, ctx.company);
    const rows = gstins.length ? await ctx.db.select().from(S).where(and(eq(S.companyId, ctx.company.id), inArray(S.gstin, gstins))) : [];
    return { data: gstins.map((g) => sessionWire(rows.find((r) => r.gstin === g), g, ctx.now)) };
  },

  async requestGstPortalOtp(ctx) {
    const { gstin, username } = ctx.body;
    await assertCompanyGstin(ctx.db, ctx.company, gstin);
    const [row] = await ctx.db.select().from(S).where(and(eq(S.companyId, ctx.company.id), eq(S.gstin, gstin)));
    if (row?.otpRequestedAt && ctx.now.getTime() - row.otpRequestedAt.getTime() < OTP_GAP_MS) {
      throw new ApiError(429, 'OTP_TOO_SOON', 'Wait a minute before asking for another OTP');
    }
    try {
      await ctx.deps.providers.returns.requestOtp(gstin, username.trim());
    } catch (error) {
      returnsFailure(error);
    }
    await ctx.db
      .insert(S)
      .values({ companyId: ctx.company.id, gstin, username: username.trim(), otpRequestedAt: ctx.now, updatedAt: ctx.now })
      .onConflictDoUpdate({ target: [S.companyId, S.gstin], set: { username: username.trim(), otpRequestedAt: ctx.now, updatedAt: ctx.now } });
    ctx.reply.code(202);
    return undefined;
  },

  async connectGstPortal(ctx) {
    const { gstin, otp } = ctx.body;
    await assertCompanyGstin(ctx.db, ctx.company, gstin);
    const [row] = await ctx.db.select().from(S).where(and(eq(S.companyId, ctx.company.id), eq(S.gstin, gstin)));
    if (!row?.otpRequestedAt) throw new ApiError(409, 'GST_PORTAL_OTP_FIRST', 'Ask for an OTP first');
    let session;
    try {
      session = await ctx.deps.providers.returns.authenticate(gstin, row.username, otp);
    } catch (error) {
      returnsFailure(error);
    }
    const [saved] = await ctx.db
      .update(S)
      .set({ authTokenEncrypted: encrypt(session.authToken, ctx.deps.config.CREDENTIALS_KEY), expiresAt: session.expiresAt, refreshableUntil: session.refreshableUntil, otpRequestedAt: null, connectedBy: ctx.user.id, updatedAt: ctx.now })
      .where(and(eq(S.companyId, ctx.company.id), eq(S.gstin, gstin)))
      .returning();
    await recordChange(ctx.db, ctx.user, { companyId: ctx.company.id, action: 'connected to the GST portal', entityType: 'company', entityId: ctx.company.id, entityLabel: gstin, version: ctx.company.version });
    return sessionWire(saved, gstin, ctx.now);
  },

  async disconnectGstPortal(ctx) {
    await ctx.db.delete(S).where(and(eq(S.companyId, ctx.company.id), eq(S.gstin, ctx.params.gstin)));
    return undefined;
  },

  async listGstReturns(ctx) {
    const periods = periodsOf(ctx.query.fy);
    const gstins = ctx.query.gstin ? [ctx.query.gstin] : await companyGstins(ctx.db, ctx.company);
    const local = gstins.length
      ? await ctx.db.select().from(R).where(and(eq(R.companyId, ctx.company.id), inArray(R.gstin, gstins), inArray(R.period, periods)))
      : [];
    const out = new Map<string, Schema<'GstReturn'>>();
    for (const r of local) {
      out.set(`${r.gstin}|${r.returnType}|${r.period}`, { id: r.id, gstin: r.gstin, returnType: r.returnType, period: r.period, status: r.status, arn: r.arn ?? undefined, filedOn: r.filedAt?.toISOString().slice(0, 10), lastError: r.lastError ?? undefined });
    }
    // The portal knows of returns filed elsewhere (on the portal itself, or another app).
    let portal = false;
    for (const gstin of gstins) {
      try {
        const pctx = await portalContext(ctx.db, ctx.deps, ctx.company, gstin);
        for (const t of await ctx.deps.providers.returns.trackReturns(pctx, ctx.query.fy)) {
          const key = `${gstin}|${t.returnType}|${t.period}`;
          const mine = out.get(key);
          if (!mine || (t.status === 'filed' && mine.status !== 'filed')) out.set(key, { ...mine, gstin, returnType: t.returnType, period: t.period, status: t.status, arn: t.arn, filedOn: t.filedOn });
        }
        portal = true;
      } catch {
        // Not connected, or the portal didn't answer: what's recorded here stands.
      }
    }
    const order = (p: string) => periods.indexOf(p);
    return { data: [...out.values()].sort((a, b) => order(a.period!) - order(b.period!) || a.returnType!.localeCompare(b.returnType!)), portal };
  },
});

/** GSTR-2B: download it, match it to the purchase register, decide the lines, and claim the credit. */
export const gstr2bHandlers = defineHandlers({
  async getGstr2b(ctx) {
    await assertCompanyGstin(ctx.db, ctx.company, ctx.query.gstin);
    return reconciliation(ctx.db, ctx.company, ctx.query.gstin, ctx.query.period);
  },

  async fetchGstr2b(ctx) {
    const { gstin, period } = ctx.body;
    await assertCompanyGstin(ctx.db, ctx.company, gstin);
    const r = await fetchGstr2b(ctx.db, ctx.deps, ctx.company, ctx.user.id, gstin, period);
    if (!r.generated) throw new ApiError(409, 'GSTR2B_NOT_GENERATED', `GSTN hasn't made GSTR-2B for ${period.slice(0, 2)}/${period.slice(2)} yet; it usually comes on the 14th of the next month`);
    return reconciliation(ctx.db, ctx.company, gstin, period);
  },

  /** The 2B file a person downloaded from the portal themselves: no portal session needed. */
  async importGstr2b(ctx) {
    const { gstin, period, fileName, contentBase64 } = ctx.body;
    await assertCompanyGstin(ctx.db, ctx.company, gstin);
    const { lines } = await importGstr2b(ctx.db, ctx.company, ctx.user.id, gstin, period, fileName, contentBase64, ctx.now);
    await recordChange(ctx.db, ctx.user, { companyId: ctx.company.id, action: `imported the GSTR-2B file for ${period}`, entityType: 'company', entityId: ctx.company.id, entityLabel: gstin, version: ctx.company.version, after: { fileName, lines } });
    return reconciliation(ctx.db, ctx.company, gstin, period);
  },

  async claimGstr2b(ctx) {
    await assertCompanyGstin(ctx.db, ctx.company, ctx.body.gstin);
    const claimed = await claimMatched(ctx.db, ctx.company, ctx.body.gstin, ctx.body.period);
    await recordChange(ctx.db, ctx.user, { companyId: ctx.company.id, action: `claimed GSTR-2B credit for ${ctx.body.period}`, entityType: 'company', entityId: ctx.company.id, entityLabel: ctx.body.gstin, version: ctx.company.version, after: { claimed } });
    return { claimed };
  },

  async decideGstr2bLine(ctx) {
    await decide(ctx.db, ctx.company, ctx.user, ctx.params.id, ctx.body.decision, ctx.body.documentId, ctx.now);
    return undefined;
  },
});
