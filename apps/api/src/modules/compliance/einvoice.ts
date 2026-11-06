import { actorFor } from '../webhooks/handlers';
import { and, eq, gt, isNotNull, lt, ne, sql } from 'drizzle-orm';
import {
  E_INVOICE_KINDS,
  blockingIssues,
  buildIrpPayload,
  canCancelEInvoice,
  isEInvoiceApplicable,
  requiresCancelRemark,
  validateEInvoice,
  type EInvoiceContext,
  type IrpInvoicePayload,
} from '@esmart/core/domain/eInvoice';
import { isFinalized } from '@esmart/core/domain/documentStates';
import type { CancelReasonCode, ComplianceIssue } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { defineHandlers, type AuthUser, type CompanyRow, type Deps } from '../../context';
import { ApiError, conflict, invalid, unprocessable } from '../../http/errors';
import { newId } from '../../lib/ids';
import { isUnanswered } from '../../providers/compliance';
import type { DbOrTx } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { companyCore, partyCore, type DocRow } from '../documents/engine';
import { documentsToWire } from '../documents/wire';
import { companyItems, coreDocument, findDocument, loadSettings, portalCredentials, portalRejected, settingsCore, touchDocument } from './shared';

const E = schema.eInvoices;
const D = schema.documents;

type Issue = Schema<'ComplianceIssue'>;

export type GenerateOutcome =
  | { kind: 'ok'; issues: ComplianceIssue[]; payload?: IrpInvoicePayload }
  | { kind: 'notApplicable' | 'invalid' | 'rejected'; issues: ComplianceIssue[]; payload?: IrpInvoicePayload }
  | { kind: 'skipped' };

/** Everything core's e-invoice rules read about a document, loaded inside `db`. */
async function eInvoiceContext(db: DbOrTx, company: CompanyRow, row: DocRow, now: Date): Promise<EInvoiceContext> {
  const settings = await loadSettings(db, company);
  const [party] = await db.select().from(schema.parties).where(eq(schema.parties.id, row.partyId));
  const [branch] = await db.select({ name: schema.branches.name }).from(schema.branches).where(eq(schema.branches.id, row.branchId));
  // Every IRN already issued in the company, cancelled ones included; the portal never reissues one.
  const irns = await db
    .select({ irn: E.irn })
    .from(E)
    .where(and(eq(E.companyId, company.id), ne(E.documentId, row.id), isNotNull(E.irn)));
  return {
    document: await coreDocument(db, company, row, now),
    company: companyCore(company),
    buyer: party ? partyCore(party) : undefined,
    settings: settingsCore(settings),
    items: await companyItems(db, company.id),
    branchName: branch?.name,
    existingIrns: irns.map((r) => r.irn!.trim()),
    now: now.toISOString(),
  };
}

/** Upserts the document's e-invoice row with `set`, counting the attempt when there was one. */
async function writeEInvoice(tx: DbOrTx, row: DocRow, set: Partial<typeof E.$inferInsert>, attempt: boolean, now: Date) {
  const values = { ...set, updatedAt: now };
  await tx
    .insert(E)
    .values({ documentId: row.id, companyId: row.companyId, attempts: attempt ? 1 : 0, ...values })
    .onConflictDoUpdate({
      target: E.documentId,
      set: { ...values, version: sql`${E.version} + 1`, ...(attempt ? { attempts: sql`${E.attempts} + 1` } : {}) },
    });
}

/**
 * Generates the IRN for a document, as the app's `generateEInvoice` does:
 * core decides applicability and validates (`isEInvoiceApplicable`,
 * `validateEInvoice`), builds the NIC schema 1.1 payload, and the portal
 * provider registers it. Every attempt is recorded on the document, a failed
 * one as `failed` with its issues, so the compliance register can show it.
 * The outcome is returned rather than thrown, so the record commits.
 *
 * A document that already has a live IRN gets it back (the portal's answer
 * to a duplicate, 2150, is the existing IRN).
 */
export async function generateEInvoiceFor(
  db: DbOrTx,
  deps: Deps,
  company: CompanyRow,
  actor: AuthUser,
  documentId: string,
  opts: { now: Date; dryRun?: boolean; onlyIfApplicable?: boolean; reconciling?: boolean },
): Promise<GenerateOutcome> {
  const { now, dryRun } = opts;
  const failed = async (tx: DbOrTx, row: DocRow, found: ComplianceIssue[], request?: IrpInvoicePayload, newAttempt = true) => {
    const message = found[0]?.message ?? 'The portal refused the invoice';
    await writeEInvoice(tx, row, { status: 'failed', issues: found, lastAttemptAt: now, requestPayload: request ?? null }, newAttempt, now);
    await touchDocument(tx, actor, row, now, { complianceLastMessage: message, complianceLastAttemptAt: now }, { action: 'e-invoice rejected', after: found[0]?.code });
    await notify(tx, deps, { companyId: row.companyId, kind: 'compliance', title: 'E-invoice rejected', body: `${row.number}: ${message}`, entityType: 'document', entityId: row.id });
  };
  const prepared = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(D).where(and(eq(D.companyId, company.id), eq(D.id, documentId))).for('update');
    const [existing] = await tx.select().from(E).where(eq(E.documentId, documentId));
    if (existing?.status === 'generated') {
      if (opts.onlyIfApplicable) return { kind: 'skipped' as const };
      return { kind: 'ok' as const, issues: (existing.issues as ComplianceIssue[] | null) ?? [], payload: (existing.requestPayload as IrpInvoicePayload | null) ?? undefined };
    }
    // Already sent and not yet answered (a double tap, or a second device): asking the portal
    // again would register it twice. The reconcile job settles it once the answer is overdue.
    if (!dryRun && !opts.reconciling && existing?.status === 'pending' && existing.lastAttemptAt && existing.lastAttemptAt > new Date(now.getTime() - RECONCILE_AFTER_MS)) {
      if (opts.onlyIfApplicable) return { kind: 'skipped' as const };
      throw conflict('EINVOICE_IN_PROGRESS', 'This invoice is already with the e-invoice portal; its IRN will show here once the portal answers');
    }

    const ctx = await eInvoiceContext(tx, company, row, now);
    const applicability = isEInvoiceApplicable(ctx);
    if (!applicability.applicable) {
      if (opts.onlyIfApplicable) return { kind: 'skipped' as const };
      if (!dryRun && !existing?.irn) {
        await writeEInvoice(tx, row, { status: 'notApplicable' }, false, now);
        await touchDocument(tx, actor, row, now, { complianceLastMessage: applicability.reason }, { action: 'e-invoice not applicable', after: applicability.reason });
      }
      return { kind: 'notApplicable' as const, issues: [{ code: 'NA', field: 'document', message: applicability.reason, severity: 'blocking' as const }] };
    }

    const issues = validateEInvoice(ctx);
    const blocking = blockingIssues(issues);
    const payload = buildIrpPayload(ctx);
    if (blocking.length) {
      if (!dryRun) await failed(tx, row, issues);
      return { kind: 'invalid' as const, issues };
    }
    if (dryRun) return { kind: 'ok' as const, issues, payload };

    const creds = await portalCredentials(tx, deps.config, company, 'einvoice');
    // Noted and committed before the call. The portal can't be rolled back, so no transaction is
    // held open across it, and if the answer is lost the reconcile job picks this up.
    await writeEInvoice(tx, row, { status: 'pending', requestPayload: payload, lastAttemptAt: now }, true, now);
    return { kind: 'submit' as const, creds, payload, issues, applicability, existingIrns: ctx.existingIrns ?? [], at: ctx.now };
  });
  if (prepared.kind !== 'submit') return prepared;
  const { creds, payload, issues, applicability } = prepared;

  const response = await deps.providers.compliance.submitInvoice(creds, { payload, existingIrns: prepared.existingIrns, now: prepared.at, companyId: company.id });

  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(D).where(and(eq(D.companyId, company.id), eq(D.id, documentId))).for('update');
    // No answer isn't a refusal: the portal may have it. It stays pending for the reconcile job.
    if (!response.ok && response.errors.some((x) => x.code === 'GSP_UNAVAILABLE')) {
      await touchDocument(tx, actor, row, now, { complianceLastMessage: response.errors[0].message, complianceLastAttemptAt: now }, { action: 'e-invoice unanswered', after: response.errors });
      return { kind: 'rejected' as const, issues: response.errors, payload };
    }
    // The IRN is unique across the whole portal; another tenant holding it is a duplicate.
    const clash = response.ok ? (await tx.select({ id: E.documentId }).from(E).where(and(eq(E.irn, response.irn), ne(E.documentId, row.id))))[0] : undefined;
    if (!response.ok || clash) {
      const errors: ComplianceIssue[] = response.ok
        ? [{ code: '2150', field: 'document', message: 'Duplicate IRN: this document has already been reported for the financial year', severity: 'blocking' }]
        : response.errors;
      await failed(tx, row, errors, payload, false);
      return { kind: 'rejected' as const, issues: errors, payload };
    }

    await writeEInvoice(
      tx,
      row,
      {
        status: 'generated',
        docType: applicability.docType,
        supplyType: applicability.supplyType,
        irn: response.irn,
        ackNo: response.ackNo,
        ackDate: response.ackDate,
        signedQrPayload: response.signedQrPayload,
        generatedAt: now,
        cancelledAt: null,
        cancelReasonCode: null,
        cancelRemark: null,
        issues: issues.length ? issues : null,
        requestPayload: payload,
        responsePayload: response,
        lastAttemptAt: now,
      },
      false,
      now,
    );
    await touchDocument(tx, actor, row, now, { complianceLastMessage: null, complianceLastAttemptAt: now }, { action: 'generated e-invoice', after: response.irn });
    await notify(tx, deps, { companyId: row.companyId, kind: 'compliance', title: 'IRN generated', body: `${row.number} · Ack ${response.ackNo}`, entityType: 'document', entityId: row.id });
    return { kind: 'ok' as const, issues, payload };
  });
}

const CA = schema.complianceAttempts;

/** No answer yet to a cancel: the portal may have cancelled the IRN. */
const cancelStillChecking = () =>
  new ApiError(502, 'IRP_PENDING', "The e-invoice portal didn't answer. We're checking whether it cancelled the IRN and will update this document in a few minutes.");

/** Records a cancel the portal made: on the request's answer, or found by the recovery lookup. */
export async function recordIrnCancelled(
  db: Deps['db'],
  deps: Deps,
  company: CompanyRow,
  actor: AuthUser,
  documentId: string,
  c: { reasonCode: CancelReasonCode; remark?: string | null; reason: string; irn: string; now: Date; attemptId?: string },
) {
  await db.transaction(async (tx) => {
    const row = await findDocument(tx, company, actor, documentId, { lock: true });
    await writeEInvoice(tx, row, { status: 'cancelled', cancelledAt: c.now, cancelReasonCode: c.reasonCode, cancelRemark: c.remark?.slice(0, 100) ?? null }, false, c.now);
    await touchDocument(tx, actor, row, c.now, { complianceLastMessage: `IRN cancelled on the portal: ${c.reason.toLowerCase()}` }, { action: 'cancelled e-invoice', before: c.irn, after: c.reason });
    await notify(tx, deps, { companyId: row.companyId, kind: 'compliance', title: 'IRN cancelled', body: `${row.number} · ${c.reason}`, entityType: 'document', entityId: row.id });
    if (c.attemptId) await tx.update(CA).set({ status: 'settled', settledAt: c.now }).where(eq(CA.id, c.attemptId));
  });
}

/** How old an unanswered attempt must be before the job takes it up, and how long it keeps trying. */
const RECONCILE_AFTER_MS = 5 * 60_000;
const RECONCILE_UNTIL_MS = 24 * 3_600_000;

/**
 * Settles e-invoices whose portal call never got an answer, by asking again:
 * the portal recognises a document it already has and hands back its IRN. Run by
 * the `einvoice.reconcile` job every 5 minutes.
 */
export async function reconcileEInvoices(deps: Deps): Promise<number> {
  const now = deps.now();
  const stuck = await deps.db
    .select({ documentId: E.documentId, companyId: E.companyId })
    .from(E)
    .where(and(eq(E.status, 'pending'), lt(E.lastAttemptAt, new Date(now.getTime() - RECONCILE_AFTER_MS)), gt(E.lastAttemptAt, new Date(now.getTime() - RECONCILE_UNTIL_MS))));
  let settled = 0;
  for (const { documentId, companyId } of stuck) {
    // Claim it: only the instance whose update moves the attempt time on asks the portal. Another
    // running the same reconcile finds the row too fresh and leaves it, so the invoice isn't sent twice.
    const [claimed] = await deps.db
      .update(E)
      .set({ lastAttemptAt: now })
      .where(and(eq(E.documentId, documentId), eq(E.status, 'pending'), lt(E.lastAttemptAt, new Date(now.getTime() - RECONCILE_AFTER_MS))))
      .returning({ documentId: E.documentId });
    if (!claimed) continue;
    try {
      const [company] = await deps.db.select().from(schema.companies).where(eq(schema.companies.id, companyId));
      const [doc] = await deps.db.select({ createdBy: D.createdBy }).from(D).where(eq(D.id, documentId));
      const actor = await actorFor(deps.db, doc?.createdBy, 'Reconcile');
      if (!company || !actor) continue;
      const outcome = await generateEInvoiceFor(deps.db, deps, company, actor, documentId, { now, reconciling: true });
      if (outcome.kind === 'ok') settled += 1;
    } catch {
      // Still no answer: the next run asks again.
    }
  }
  return settled;
}

/**
 * Runs after a document is finalised, outside the finalise transaction:
 * when the company asked for it and the document needs an e-invoice, it gets
 * its IRN now. A portal failure is recorded on the document as a failed
 * attempt and never undoes the finalise (its number is already drawn).
 * Returns the document as it now stands.
 */
export async function afterFinalize(db: DbOrTx, deps: Deps, document: DocRow, actor: AuthUser): Promise<DocRow> {
  if (!E_INVOICE_KINDS.includes(document.kind) || !isFinalized(document.status)) return document;
  try {
    const [settings] = await db.select().from(schema.complianceSettings).where(eq(schema.complianceSettings.companyId, document.companyId));
    if (!settings?.autoGenerateEinvoiceOnFinalise || !settings.einvoiceEnabled) return document;
    const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, document.companyId));
    const outcome = await generateEInvoiceFor(db, deps, company, actor, document.id, { now: deps.now(), onlyIfApplicable: true });
    if (outcome.kind === 'skipped') return document;
    const [fresh] = await db.select().from(D).where(eq(D.id, document.id));
    return fresh ?? document;
  } catch {
    // The document is final either way; the user can generate the IRN by hand.
    return document;
  }
}

async function complianceOf(db: DbOrTx, company: CompanyRow, row: DocRow, now: Date): Promise<Schema<'ComplianceInfo'>> {
  const [doc] = await documentsToWire(db, [row], now, company.baseCurrency.trim());
  return doc.compliance ?? {};
}

/** E-invoice: getEInvoice, generateEInvoice, cancelEInvoice. */
export const eInvoiceHandlers = defineHandlers({
  /** The stored state; before any attempt, whether core says the document needs one. */
  async getEInvoice(ctx) {
    const row = await findDocument(ctx.db, ctx.company, ctx.user, ctx.params.id);
    const info = await complianceOf(ctx.db, ctx.company, row, ctx.now);
    if (info.eInvoiceStatus) return info;
    const applicability = isEInvoiceApplicable(await eInvoiceContext(ctx.db, ctx.company, row, ctx.now));
    return { ...info, eInvoiceStatus: applicability.applicable ? 'pending' : 'notApplicable', lastMessage: info.lastMessage ?? applicability.reason };
  },

  async generateEInvoice(ctx) {
    const row = await findDocument(ctx.db, ctx.company, ctx.user, ctx.params.id);
    const outcome = await generateEInvoiceFor(ctx.db, ctx.deps, ctx.company, ctx.user, row.id, { now: ctx.now, dryRun: ctx.query.dryRun });
    if (outcome.kind === 'notApplicable') throw unprocessable(outcome.issues as Issue[], 'EINVOICE_NOT_APPLICABLE');
    if (outcome.kind === 'invalid') throw unprocessable(outcome.issues as Issue[], 'EINVOICE_VALIDATION_FAILED', blockingIssues(outcome.issues)[0]?.message);
    if (outcome.kind === 'rejected') throw portalRejected(outcome.issues, 'IRP_REJECTED');
    const issues = (outcome.kind === 'ok' ? outcome.issues : []) as Issue[];
    const [fresh] = await ctx.db.select().from(D).where(eq(D.id, row.id));
    // The contract types a free-form object as Record<string, never>.
    const payload = (outcome.kind === 'ok' ? outcome.payload : undefined) as unknown as Record<string, never> | undefined;
    return { ok: true, issues, compliance: await complianceOf(ctx.db, ctx.company, fresh, ctx.now), payload };
  },

  /** Inside 24 hours of generation, and only once any live e-way bill on the document is cancelled. */
  async cancelEInvoice(ctx) {
    const { reasonCode, remark } = ctx.body;
    if (requiresCancelRemark(reasonCode) && !remark?.trim()) throw invalid('remark', 'Say why the IRN is being cancelled');
    const now = ctx.now.toISOString();
    const [open] = await ctx.db.select({ id: CA.id }).from(CA).where(and(eq(CA.documentId, ctx.params.id), eq(CA.operation, 'irn.cancel'), eq(CA.status, 'pending')));
    if (open) throw cancelStillChecking();
    const checked = await ctx.db.transaction(async (tx) => {
      const row = await findDocument(tx, ctx.company, ctx.user, ctx.params.id, { lock: true });
      const [e] = await tx.select().from(E).where(eq(E.documentId, row.id));
      const allowed = canCancelEInvoice(
        e ? { eInvoiceStatus: e.status, irn: e.irn?.trim(), irnGeneratedAt: e.generatedAt?.toISOString() } : undefined,
        now,
      );
      if (!allowed.allowed) throw conflict(allowed.deadline ? 'EINVOICE_CANCEL_WINDOW_CLOSED' : 'EINVOICE_NOT_ACTIVE', allowed.reason);
      if (row.currentEwayBillId) {
        const [bill] = await tx.select().from(schema.ewayBills).where(eq(schema.ewayBills.id, row.currentEwayBillId));
        if (bill && bill.status === 'active' && bill.validUpto >= ctx.now) {
          throw conflict('EWAY_BILL_ACTIVE', `Cancel e-way bill ${bill.ewayBillNumber.trim()} before cancelling the IRN`);
        }
      }

      const creds = await portalCredentials(tx, ctx.deps.config, ctx.company, 'einvoice');
      return { creds, irn: e!.irn!.trim(), generatedAt: e!.generatedAt!.toISOString() };
    });
    // Outside the transaction: a cancel the portal has made can't be rolled back with it. The attempt is
    // written first, so a lost answer is settled later by asking the portal for the IRN's status.
    const attemptId = newId('cat');
    try {
      await ctx.db.insert(CA).values({ id: attemptId, companyId: ctx.company.id, documentId: ctx.params.id, operation: 'irn.cancel', request: { irn: checked.irn, reasonCode, remark: remark ?? null }, actorId: ctx.user.id, startedAt: ctx.now });
    } catch {
      throw cancelStillChecking();
    }
    const response = await ctx.deps.providers.compliance.cancelIrn(checked.creds, { irn: checked.irn, irnGeneratedAt: checked.generatedAt, reasonCode, remark, now });
    if (!response.ok) {
      if (isUnanswered(response)) throw cancelStillChecking();
      await ctx.db.update(CA).set({ status: 'failed', settledAt: ctx.now, lastError: response.errors[0]?.message ?? 'rejected' }).where(eq(CA.id, attemptId));
      throw portalRejected(response.errors, 'IRP_REJECTED');
    }
    await recordIrnCancelled(ctx.db, ctx.deps, ctx.company, ctx.user, ctx.params.id, { reasonCode, remark, reason: response.reason, irn: checked.irn, now: ctx.now, attemptId });
    return { ok: true, issues: [] };
  },
});
