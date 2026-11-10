import { and, asc, eq, sql } from 'drizzle-orm';
import type { DocumentKind } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { AuthUser, CompanyRow, Deps } from '../../context';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { notify, noteMoney } from '../../lib/notify';
import { conflict } from '../../http/errors';

const D = schema.documents;
type DocRow = typeof D.$inferSelect;

export type ApprovalRule = { kind: DocumentKind; overMinor: number };
export type Approval = { status: 'pending' | 'approved' | 'rejected'; requestedBy: string; requestedAt: string; decidedBy?: string; decidedAt?: string; note?: string };

/** Who decides: owners and admins never wait on themselves. */
export const APPROVERS = ['owner', 'admin'];

/**
 * Whether issuing this document has to wait for an owner or admin: a rule covers its kind, its total
 * in base currency is over the rule's amount, the person issuing it isn't an approver, and it hasn't
 * been approved already.
 */
export function needsApproval(company: CompanyRow, user: AuthUser, row: Pick<DocRow, 'kind' | 'grandTotalBaseMinor' | 'approval'>): boolean {
  if (APPROVERS.includes(user.role)) return false;
  if ((row.approval as Approval | null)?.status === 'approved') return false;
  const rules = (company.approvalRules as ApprovalRule[] | null) ?? [];
  return rules.some((r) => r.kind === row.kind && row.grandTotalBaseMinor > r.overMinor);
}

/** Keeps the draft and sends it for approval, telling the owners and admins. */
export async function sendForApproval(tx: DbOrTx, deps: Deps, user: AuthUser, row: DocRow, now: Date): Promise<DocRow> {
  const approval: Approval = { status: 'pending', requestedBy: user.id, requestedAt: now.toISOString() };
  const [updated] = await tx.update(D).set({ approval, version: row.version + 1, updatedAt: now }).where(eq(D.id, row.id)).returning();
  await recordChange(tx, user, { companyId: row.companyId, action: 'approvalRequested', entityType: 'document', entityId: row.id, entityLabel: row.number, version: updated.version });
  await notify(tx, deps, {
    companyId: row.companyId,
    kind: 'system',
    title: 'A document is waiting for your approval',
    body: `${user.name} sent ${row.number || 'a draft'} for ${noteMoney(row.grandTotalMinor, row.currency)} for approval.`,
    entityType: 'document',
    entityId: row.id,
  });
  return updated;
}

/** Marks the decision on a document that was waiting. */
export async function decide(tx: DbOrTx, user: AuthUser, row: DocRow, status: 'approved' | 'rejected', now: Date, note?: string): Promise<DocRow> {
  const was = row.approval as Approval;
  const approval: Approval = { ...was, status, decidedBy: user.id, decidedAt: now.toISOString(), ...(note && { note }) };
  const [updated] = await tx.update(D).set({ approval, version: row.version + 1, updatedAt: now }).where(and(eq(D.id, row.id), eq(D.version, row.version))).returning();
  // Someone else decided first (or the same tap landed twice): theirs stands.
  if (!updated) throw conflict('ALREADY_DECIDED', 'This document was decided on a moment ago; refresh to see it');
  await recordChange(tx, user, { companyId: row.companyId, action: status === 'approved' ? 'approved' : 'approvalRejected', entityType: 'document', entityId: row.id, entityLabel: row.number, version: updated.version, after: { approval } });
  return updated;
}

/**
 * Tells whoever sent the document for approval what was decided, as a payment request's decision does
 * (RULES 6.14): approved (and issued, under its number), or sent back with the approver's note.
 * `title` is what the document is called, e.g. "Invoice".
 */
export async function notifyDecision(tx: DbOrTx, deps: Deps, decider: AuthUser, row: DocRow, was: Approval, title: string, note?: string): Promise<void> {
  if (!was?.requestedBy || was.requestedBy === decider.id) return;
  const what = title.toLowerCase();
  await notify(tx, deps, {
    companyId: row.companyId,
    userId: was.requestedBy,
    kind: 'system',
    ...(note === undefined
      ? { title: `Your ${what} was approved`, body: `${row.number} was approved and issued by ${decider.name}.` }
      : { title: `Your ${what} was sent back`, body: `${decider.name} sent back your ${what} for ${noteMoney(row.grandTotalMinor, row.currency)}: ${note}` }),
    entityType: 'document',
    entityId: row.id,
  });
}

/** Documents waiting for a decision, oldest request first. */
export async function pendingApprovals(db: DbOrTx, companyId: string): Promise<DocRow[]> {
  return db
    .select()
    .from(D)
    .where(and(eq(D.companyId, companyId), sql`${D.approval} ->> 'status' = 'pending'`))
    .orderBy(asc(sql`${D.approval} ->> 'requestedAt'`));
}
