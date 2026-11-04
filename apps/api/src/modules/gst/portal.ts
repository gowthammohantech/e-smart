import { and, eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { CompanyRow, Deps } from '../../context';
import { ApiError, conflict, invalid } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { decrypt, encrypt } from '../../lib/crypto';
import { ReturnsError, type Ctx } from '../../providers/returns';

const S = schema.gstPortalSessions;
type SessionRow = typeof S.$inferSelect;

/** The GSTINs a company files for: its own, and each branch registered in another state. */
export async function companyGstins(db: DbOrTx, company: CompanyRow): Promise<string[]> {
  const branches = await db.select({ gstin: schema.branches.gstin }).from(schema.branches).where(eq(schema.branches.companyId, company.id));
  return [...new Set([company.taxIdentifier, ...branches.map((b) => b.gstin)].filter((g): g is string => !!g && g.length === 15))];
}

export async function assertCompanyGstin(db: DbOrTx, company: CompanyRow, gstin: string) {
  if (!(await companyGstins(db, company)).includes(gstin)) throw invalid('gstin', `${gstin} is not a GSTIN of this business`);
}

/** The portal's answer in API terms. */
export function returnsFailure(error: unknown): never {
  if (error instanceof ReturnsError) {
    switch (error.code) {
      case 'SESSION_EXPIRED':
        throw conflict('GST_PORTAL_SESSION_EXPIRED', 'The GST portal session has ended; connect again with a new OTP');
      case 'PORTAL_REFUSED':
        throw new ApiError(422, 'GST_PORTAL_REFUSED', error.message, { portalCodes: error.portalCodes });
      case 'UNANSWERED':
        throw new ApiError(502, 'GSP_UNAVAILABLE', 'No answer from the GST portal; nothing is assumed, try again shortly');
      case 'NOT_CONFIGURED':
        throw new ApiError(503, 'FEATURE_UNAVAILABLE', error.message);
      case 'NOT_FOUND':
        throw new ApiError(404, 'NOT_FOUND', error.message);
    }
  }
  throw error;
}

export function sessionWire(row: SessionRow | undefined, gstin: string, now: Date) {
  const connected = !!row?.authTokenEncrypted && !!row.refreshableUntil && row.refreshableUntil > now;
  return {
    gstin,
    username: row?.username,
    connected,
    expiresAt: row?.expiresAt?.toISOString(),
    refreshableUntil: connected ? row!.refreshableUntil!.toISOString() : undefined,
    otpRequestedAt: row?.otpRequestedAt?.toISOString(),
  };
}

/**
 * Who and with what session a returns call goes: the stored session, refreshed first when its
 * six hours are up but its refresh window isn't. 409 GST_PORTAL_NOT_CONNECTED or
 * GST_PORTAL_SESSION_EXPIRED when there's none to use.
 */
export async function portalContext(db: DbOrTx, deps: Deps, company: CompanyRow, gstin: string): Promise<Ctx> {
  const [row] = await db.select().from(S).where(and(eq(S.companyId, company.id), eq(S.gstin, gstin)));
  if (!row?.authTokenEncrypted || !row.expiresAt || !row.refreshableUntil) throw conflict('GST_PORTAL_NOT_CONNECTED', `Connect ${gstin} to the GST portal first (Settings → GST portal)`);
  const now = deps.now();
  if (row.refreshableUntil <= now) throw conflict('GST_PORTAL_SESSION_EXPIRED', 'The GST portal session has ended; connect again with a new OTP');
  let session = { authToken: decrypt(row.authTokenEncrypted, deps.config.CREDENTIALS_KEY), expiresAt: row.expiresAt, refreshableUntil: row.refreshableUntil };
  // Refresh a few minutes early, so a long save doesn't run out mid-call.
  if (row.expiresAt.getTime() - now.getTime() < 10 * 60_000) {
    try {
      session = await deps.providers.returns.refresh(gstin, row.username, session);
    } catch (error) {
      returnsFailure(error);
    }
    await db
      .update(S)
      .set({ authTokenEncrypted: encrypt(session.authToken, deps.config.CREDENTIALS_KEY), expiresAt: session.expiresAt, refreshableUntil: session.refreshableUntil, updatedAt: now })
      .where(and(eq(S.companyId, company.id), eq(S.gstin, gstin)));
  }
  return { gstin, username: row.username, session };
}
