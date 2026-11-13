import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { CancelReasonCode } from '@esmart/core/types';
import { E_INVOICE_CANCEL_REASONS } from '@esmart/core/domain/eInvoice';
import type { Deps } from '../../context';
import { ApiError } from '../../http/errors';
import { notify } from '../../lib/notify';
import { isUnanswered, isUnsupported } from '../../providers/compliance';
import { actorFor } from '../webhooks/handlers';
import { recordIrnCancelled } from './einvoice';
import { generateEway } from './eway';
import { portalCredentials } from './shared';

const CA = schema.complianceAttempts;
type Attempt = typeof CA.$inferSelect;

/** Leave a fresh attempt alone: its request may still be on its way. */
const CHECK_AFTER_MS = 2 * 60_000;
/** Asked again at most this often. */
const RECHECK_EVERY_MS = 2 * 60_000;
/**
 * The portal answered "nothing there" this long after the call: it never got the request, so the
 * person can safely try again.
 */
const GIVE_UP_IF_ABSENT_MS = 30 * 60_000;
/** A gateway that can't look anything up: after a day, a person checks the portal. */
const GIVE_UP_MS = 24 * 3_600_000;

type Outcome = 'settled' | 'failed' | 'waiting';

/**
 * The `compliance.recover` job: settles e-way bill generates and IRN cancels whose answer was lost,
 * by asking the portal what it holds. Each attempt is claimed by moving `last_checked_at` on, so two
 * instances never check the same one at once.
 */
export async function recoverComplianceAttempts(deps: Deps): Promise<Record<Outcome, number>> {
  const now = deps.now();
  const counts: Record<Outcome, number> = { settled: 0, failed: 0, waiting: 0 };
  const due = await deps.db
    .select({ id: CA.id })
    .from(CA)
    .where(and(eq(CA.status, 'pending'), lt(CA.startedAt, new Date(now.getTime() - CHECK_AFTER_MS))));
  for (const { id } of due) {
    const [attempt] = await deps.db
      .update(CA)
      .set({ lastCheckedAt: now })
      .where(and(eq(CA.id, id), eq(CA.status, 'pending'), or(isNull(CA.lastCheckedAt), lt(CA.lastCheckedAt, new Date(now.getTime() - RECHECK_EVERY_MS)))))
      .returning();
    if (!attempt) continue;
    let outcome: Outcome;
    try {
      outcome = attempt.operation === 'ewb.generate' ? await recoverEwayBill(deps, attempt, now) : await recoverIrnCancel(deps, attempt, now);
    } catch (err) {
      await deps.db.update(CA).set({ lastError: String((err as Error).message ?? err).slice(0, 1000) }).where(eq(CA.id, attempt.id));
      outcome = now.getTime() - attempt.startedAt.getTime() > GIVE_UP_MS ? await fail(deps, attempt, now, 'We could not confirm this with the portal. Check it there before trying again.') : 'waiting';
    }
    counts[outcome] += 1;
  }
  return counts;
}

async function context(deps: Deps, attempt: Attempt) {
  const [company] = await deps.db.select().from(schema.companies).where(eq(schema.companies.id, attempt.companyId));
  const actor = await actorFor(deps.db, attempt.actorId, 'Portal check');
  if (!company || !actor) throw new Error('The attempt’s company or user is gone');
  return { company, actor };
}

async function fail(deps: Deps, attempt: Attempt, now: Date, message: string): Promise<Outcome> {
  await deps.db.update(CA).set({ status: 'failed', settledAt: now, lastError: message }).where(eq(CA.id, attempt.id));
  const [doc] = await deps.db.select({ number: schema.documents.number }).from(schema.documents).where(eq(schema.documents.id, attempt.documentId));
  const what = attempt.operation === 'ewb.generate' ? 'E-way bill not raised' : 'IRN not cancelled';
  await notify(deps.db, deps, { companyId: attempt.companyId, userId: attempt.actorId, kind: 'compliance', title: what, body: `${doc?.number ?? ''} · ${message}`, entityType: 'document', entityId: attempt.documentId });
  return 'failed';
}

async function recoverEwayBill(deps: Deps, attempt: Attempt, now: Date): Promise<Outcome> {
  const provider = deps.providers.compliance;
  const age = now.getTime() - attempt.startedAt.getTime();
  // No lookup to ask (the gateway has none): wait, then leave it to a person to check on the portal.
  const noLookup = () => (age > GIVE_UP_MS ? fail(deps, attempt, now, 'The portal gave no answer. Check on the e-way bill portal whether the bill was raised.') : ('waiting' as const));
  if (!provider.findEwayBillByDocument) return noLookup();
  const { company, actor } = await context(deps, attempt);
  const request = attempt.request as { input: Parameters<typeof generateEway>[1]; docType: string; docNo: string; docDate: string; fromGstin: string };
  const creds = await portalCredentials(deps.db, deps.config, company, 'ewaybill');
  const answer = await provider.findEwayBillByDocument(creds, { docType: request.docType, docNo: request.docNo, docDate: request.docDate, fromGstin: request.fromGstin, now: now.toISOString() });
  if (!answer.ok) {
    if (isUnsupported(answer)) return noLookup();
    if (isUnanswered(answer)) return 'waiting';
    throw new Error(answer.errors[0]?.message ?? 'The portal refused the lookup');
  }
  if (!answer.found) {
    // The portal never got it: safe for the person to generate again.
    return age > GIVE_UP_IF_ABSENT_MS ? fail(deps, attempt, now, 'The portal has no e-way bill for this document. Generate it again.') : 'waiting';
  }
  const ctx = { db: deps.db, deps, company, user: actor, now, query: {}, req: null, reply: null } as unknown as Parameters<typeof generateEway>[0];
  try {
    await generateEway(ctx, request.input, { recovered: answer.found, attemptId: attempt.id });
  } catch (err) {
    // Already on record (the first request's answer did arrive, after all): nothing left to do.
    if (err instanceof ApiError && err.code === 'EWAY_BILL_EXISTS') {
      await deps.db.update(CA).set({ status: 'settled', settledAt: now }).where(eq(CA.id, attempt.id));
      return 'settled';
    }
    throw err;
  }
  return 'settled';
}

async function recoverIrnCancel(deps: Deps, attempt: Attempt, now: Date): Promise<Outcome> {
  const provider = deps.providers.compliance;
  const age = now.getTime() - attempt.startedAt.getTime();
  const noLookup = () => (age > GIVE_UP_MS ? fail(deps, attempt, now, 'The portal gave no answer. Check on the e-invoice portal whether the IRN was cancelled.') : ('waiting' as const));
  if (!provider.getIrnStatus) return noLookup();
  const { company, actor } = await context(deps, attempt);
  const request = attempt.request as { irn: string; reasonCode: CancelReasonCode; remark: string | null };
  const creds = await portalCredentials(deps.db, deps.config, company, 'einvoice');
  const answer = await provider.getIrnStatus(creds, { irn: request.irn, now: now.toISOString() });
  if (!answer.ok) {
    if (isUnsupported(answer)) return noLookup();
    if (isUnanswered(answer)) return 'waiting';
    throw new Error(answer.errors[0]?.message ?? 'The portal refused the lookup');
  }
  if (answer.status === 'active') {
    return age > GIVE_UP_IF_ABSENT_MS ? fail(deps, attempt, now, 'The portal still has the IRN active. Cancel it again.') : 'waiting';
  }
  await recordIrnCancelled(deps.db, deps, company, actor, attempt.documentId, { reasonCode: request.reasonCode, remark: request.remark, reason: E_INVOICE_CANCEL_REASONS[request.reasonCode], irn: request.irn, now, attemptId: attempt.id });
  return 'settled';
}
