import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';
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
import type { ComplianceIssue } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { defineHandlers, type AuthUser, type CompanyRow, type Deps } from '../../context';
import { conflict, invalid, unprocessable } from '../../http/errors';
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
  opts: { now: Date; dryRun?: boolean; onlyIfApplicable?: boolean },
): Promise<GenerateOutcome> {
  const { now, dryRun } = opts;
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(D).where(and(eq(D.companyId, company.id), eq(D.id, documentId))).for('update');
    const [existing] = await tx.select().from(E).where(eq(E.documentId, documentId));
    if (existing?.status === 'generated') {
      if (opts.onlyIfApplicable) return { kind: 'skipped' as const };
      return { kind: 'ok' as const, issues: (existing.issues as ComplianceIssue[] | null) ?? [], payload: (existing.requestPayload as IrpInvoicePayload | null) ?? undefined };
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
    const failed = async (found: ComplianceIssue[], request?: IrpInvoicePayload) => {
      const message = found[0]?.message ?? 'The portal refused the invoice';
      await writeEInvoice(tx, row, { status: 'failed', issues: found, lastAttemptAt: now, requestPayload: request ?? null }, true, now);
      await touchDocument(tx, actor, row, now, { complianceLastMessage: message, complianceLastAttemptAt: now }, { action: 'e-invoice rejected', after: found[0]?.code });
      await notify(tx, deps, { companyId: row.companyId, kind: 'compliance', title: 'E-invoice rejected', body: `${row.number}: ${message}`, entityType: 'document', entityId: row.id });
    };

    if (blocking.length) {
      if (!dryRun) await failed(issues);
      return { kind: 'invalid' as const, issues };
    }
    if (dryRun) return { kind: 'ok' as const, issues, payload };

    const creds = await portalCredentials(tx, deps.config, company);
    const response = await deps.providers.compliance.submitInvoice(creds, { payload, existingIrns: ctx.existingIrns ?? [], now: ctx.now });
    // The IRN is unique across the whole portal; another tenant holding it is a duplicate.
    const clash = response.ok ? (await tx.select({ id: E.documentId }).from(E).where(and(eq(E.irn, response.irn), ne(E.documentId, row.id))))[0] : undefined;
    if (!response.ok || clash) {
      const errors: ComplianceIssue[] = response.ok
        ? [{ code: '2150', field: 'document', message: 'Duplicate IRN: this document has already been reported for the financial year', severity: 'blocking' }]
        : response.errors;
      await failed(errors, payload);
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
      true,
      now,
    );
    await touchDocument(tx, actor, row, now, { complianceLastMessage: null, complianceLastAttemptAt: now }, { action: 'generated e-invoice', after: response.irn });
    await notify(tx, deps, { companyId: row.companyId, kind: 'compliance', title: 'IRN generated', body: `${row.number} · Ack ${response.ackNo}`, entityType: 'document', entityId: row.id });
    return { kind: 'ok' as const, issues, payload };
  });
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
    await ctx.db.transaction(async (tx) => {
      const row = await findDocument(tx, ctx.company, ctx.user, ctx.params.id, { lock: true });
      const [e] = await tx.select().from(E).where(eq(E.documentId, row.id));
      const now = ctx.now.toISOString();
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

      const creds = await portalCredentials(tx, ctx.deps.config, ctx.company);
      const response = await ctx.deps.providers.compliance.cancelIrn(creds, { irn: e!.irn!.trim(), irnGeneratedAt: e!.generatedAt!.toISOString(), reasonCode, remark, now });
      if (!response.ok) throw portalRejected(response.errors, 'IRP_REJECTED');

      await writeEInvoice(tx, row, { status: 'cancelled', cancelledAt: ctx.now, cancelReasonCode: reasonCode, cancelRemark: remark?.slice(0, 100) ?? null }, false, ctx.now);
      await touchDocument(tx, ctx.user, row, ctx.now, { complianceLastMessage: `IRN cancelled on the portal: ${response.reason.toLowerCase()}` }, { action: 'cancelled e-invoice', before: e!.irn?.trim(), after: response.reason });
      await notify(tx, ctx.deps, { companyId: row.companyId, kind: 'compliance', title: 'IRN cancelled', body: `${row.number} · ${response.reason}`, entityType: 'document', entityId: row.id });
    });
    return { ok: true, issues: [] };
  },
});
