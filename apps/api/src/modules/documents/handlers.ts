import { and, asc, desc, eq, exists, getTableColumns, gte, ilike, inArray, lte, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { decide, needsApproval, pendingApprovals, sendForApproval, type Approval } from './approvals';
import { NOTE_SOURCE, PAYABLE_KINDS, SALES_KINDS, canTransition, conversionBlock, isFinalized, isPayableDocument, nextStatuses } from '@esmart/core/domain/documentStates';
import { hasModule } from '@esmart/core/domain/plan';
import type { DocStatus, DocumentKind } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { RawBody, defineHandlers, type AuthUser, type Ctx } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { conflict, invalid, notFound, preconditionFailed, unprocessable, upstream } from '../../http/errors';
import { keyset } from '../../http/pagination';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { notify } from '../../lib/notify';
import { money } from '../../lib/wire';
import { tdsOn, tdsSectionFor } from '../../lib/tds';
import { afterFinalize } from '../compliance/handlers';
import { partyToWire } from '../parties/wire';
import { paymentsToWire } from '../payments/wire';
import {
  assertKindAllowed,
  auditSnapshot,
  deleteLines,
  draftNumber,
  fieldsFromRow,
  fieldsFromWire,
  isPurchaseKind,
  linesFromRows,
  linesFromWire,
  prepareDocument,
  requestedStatus,
  writeLines,
  type DocFields,
  type DocRow,
  type LineInput,
} from './engine';
import { CONVERSIONS, DERIVED, FINAL_STATUS, effectiveStatus, effectiveStatusSql, assertNoLiveReturns, assertPeriodOpen, finalizeInTx, isCredit, reverseStock, syncPaymentState, today } from './lifecycle';
import { SHARE_LINK_DAYS, createShareLinkFor, paymentLinkFor, pdfFilename, renderDocumentPdf, storePdfLinkFor } from './outbound';
import { companyLogoFile } from '../companies/logo';
import { renderDocumentEmailHtml } from '../../lib/emailLayout';
import { formatMoney } from '@esmart/core/lib/format';
import { addDaysISO, formatDate } from '@esmart/core/lib/date';
import { nextRecurrence } from '../expenses/engine';
import { documentsToWire, summariesToWire, type DocumentWire, type SummaryRow } from './wire';

/** How the email's HTML refers to the business logo it carries. */
const BUSINESS_LOGO_CID = 'business-logo';
/** A logo bigger than this stays out of the email rather than weigh it down; the name shows instead. */
const LOGO_EMAIL_MAX_BYTES = 1024 * 1024;

/** What a sent document calls itself in the email, as the app names it. */
const EMAIL_TITLES: Record<DocumentKind, string> = {
  quote: 'Quotation',
  proforma: 'Proforma invoice',
  salesOrder: 'Sales order',
  delivery: 'Delivery note',
  invoice: 'Invoice',
  salesReturn: 'Sales return',
  purchaseOrder: 'Purchase order',
  goodsReceipt: 'Goods receipt',
  purchaseBill: 'Purchase bill',
  purchaseReturn: 'Purchase return',
  creditNote: 'Credit note',
  debitNote: 'Debit note',
  supplierCreditNote: 'Supplier credit note',
  supplierDebitNote: 'Supplier debit note',
};

/** Sending a document to the same person again this soon is a retry, not a decision. */
const RESEND_WINDOW_MS = 2 * 60_000;

const D = schema.documents;
const P = schema.parties;
/** What the helpers need from any document operation's context. */
export type AnyCtx = Pick<Ctx<'getDocument'>, 'company' | 'user' | 'db' | 'now' | 'deps' | 'req' | 'reply'>;

/** A document in the caller's company (and branches), or 404. Purchase-side kinds need the purchases module. */
async function findDocument(ctx: AnyCtx, db: DbOrTx, id: string, opts: { lock?: boolean } = {}): Promise<DocRow> {
  const q = db.select().from(D).where(and(eq(D.companyId, ctx.company.id), eq(D.id, id)));
  const [row] = opts.lock ? await q.for('update') : await q;
  if (!row || !branchVisible(ctx.user, row.branchId)) throw notFound('Document');
  assertKindAllowed(ctx.company, row.kind);
  return row;
}

const branchVisible = (user: AuthUser, branchId: string) => !user.branchIds.length || user.branchIds.includes(branchId);

async function toWire(ctx: AnyCtx, row: DocRow): Promise<DocumentWire> {
  const [doc] = await documentsToWire(ctx.db, [row], ctx.now, ctx.company.baseCurrency.trim());
  return doc;
}

/** Attachments listed on a document point back at it. */
async function linkAttachments(tx: DbOrTx, companyId: string, documentId: string, ids: string[] | undefined) {
  if (ids === undefined) return;
  const A = schema.attachments;
  await tx.update(A).set({ entityType: null, entityId: null }).where(and(eq(A.companyId, companyId), eq(A.entityType, 'document'), eq(A.entityId, documentId)));
  if (ids.length) await tx.update(A).set({ entityType: 'document', entityId: documentId }).where(and(eq(A.companyId, companyId), inArray(A.id, ids)));
}

/** A finalised status in the body must be the one the kind finalises to. */
function checkRequestedStatus(kind: DocumentKind, status: string): DocStatus {
  const s = requestedStatus(kind, status) as DocStatus;
  if (isFinalized(s) && s !== FINAL_STATUS[kind]) throw invalid('status', `A ${kind} is created as a draft or as ${FINAL_STATUS[kind]}`);
  return s;
}

/**
 * Inserts a new document from prepared fields, finalising it in the same
 * transaction when asked. Shared by create, convert and duplicate.
 */
export async function insertDocument(ctx: AnyCtx, f: DocFields, lines: LineInput[], status: DocStatus, extra: { attachmentIds?: string[]; snapshotRates?: boolean; action?: string; overrideCreditLimit?: boolean } = {}) {
  const prepared = await prepareDocument(ctx.db, ctx.company, f, lines, { snapshotRates: extra.snapshotRates ?? true });
  if (!branchVisible(ctx.user, prepared.columns.branchId)) throw invalid('branchId', 'You cannot create documents in this branch');
  const draftStatus = requestedStatus(f.kind, 'draft') as DocStatus;
  const row = await ctx.db.transaction(async (tx) => {
    const [created] = await tx
      .insert(D)
      .values({ id: newId('doc'), companyId: ctx.company.id, number: draftNumber(f.kind), status: draftStatus, createdBy: ctx.user.id, ...prepared.columns, createdAt: ctx.now, updatedAt: ctx.now })
      .returning();
    await writeLines(tx, created.id, prepared);
    await linkAttachments(tx, ctx.company.id, created.id, extra.attachmentIds);
    await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: extra.action ?? 'created', entityType: 'document', entityId: created.id, entityLabel: created.number, version: created.version });
    if (status === draftStatus) return created;
    // Over an approval rule's amount: it stays a draft until an owner or admin approves it.
    if (needsApproval(ctx.company, ctx.user, created)) return sendForApproval(tx, ctx.deps, ctx.user, created, ctx.now);
    const done = await finalizeInTx(tx, ctx.company, ctx.user, created, status, ctx.now, { overrideCreditLimit: extra.overrideCreditLimit });
    await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'finalized', entityType: 'document', entityId: done.id, entityLabel: done.number, version: done.version });
    return done;
  });
  return afterFinalize(ctx.db, ctx.deps, row, ctx.user);
}

/**
 * Recomputes a draft from what is stored (tax rates re-read from the
 * categories) and finalises it to `target`. Totals are always the server's.
 */
async function finalizeDraft(ctx: AnyCtx, id: string, target: DocStatus, opts: { overrideCreditLimit?: boolean } = {}): Promise<DocRow> {
  const finalized = await ctx.db.transaction(async (tx) => {
    const row = await findDocument(ctx, tx, id, { lock: true });
    checkIfMatch(ctx.req, row.version);
    if (isFinalized(row.status) || row.status === 'cancelled') throw conflict('DOCUMENT_ALREADY_FINAL', `${row.number} is already ${row.status}`);
    const lines = await tx.select().from(schema.documentLines).where(eq(schema.documentLines.documentId, row.id));
    const prepared = await prepareDocument(tx, ctx.company, fieldsFromRow(row), linesFromRows(lines), { snapshotRates: true, documentId: row.id });
    const [recomputed] = await tx.update(D).set({ ...prepared.columns, updatedAt: ctx.now }).where(eq(D.id, row.id)).returning();
    await writeLines(tx, row.id, prepared);
    if (needsApproval(ctx.company, ctx.user, recomputed)) return sendForApproval(tx, ctx.deps, ctx.user, recomputed, ctx.now);
    const done = await finalizeInTx(tx, ctx.company, ctx.user, recomputed, target, ctx.now, opts);
    await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'finalized', entityType: 'document', entityId: done.id, entityLabel: done.number, version: done.version, after: { status: done.status, number: done.number } });
    return done;
  });
  // Outside the transaction: an IRN the company auto-generates never rolls back the number.
  return afterFinalize(ctx.db, ctx.deps, finalized, ctx.user);
}

/**
 * Moves a document between statuses (not out of draft; see finalizeDraft)
 * under a row lock, re-checking the transition against the locked row.
 * Cancelling reverses its stock and withdraws its payment links; a document
 * with money allocated, a live e-way bill or a live e-invoice cannot be
 * cancelled. The e-way bill comes first: the IRN can't go while it is live.
 */
async function changeStatus(ctx: AnyCtx, id: string, target: DocStatus, reason?: string): Promise<DocRow> {
  return ctx.db.transaction(async (tx) => {
    const locked = await findDocument(ctx, tx, id, { lock: true });
    checkIfMatch(ctx.req, locked.version);
    const from = effectiveStatus(locked, today(ctx.now));
    // Before the transition: a fully credited invoice reads as paid, which would hide the reason.
    if (target === 'cancelled') await assertNoLiveReturns(tx, locked);
    if (!canTransition(locked.kind, from, target)) throw conflict('INVALID_TRANSITION', `A ${locked.kind} cannot go from ${from} to ${target}`);
    if (target === 'cancelled') {
      assertPeriodOpen(ctx.company, locked.date);
      if (locked.amountPaidMinor > 0) throw conflict('DOCUMENT_HAS_PAYMENTS', 'Remove the payments allocated to this document before cancelling it');
      if (locked.currentEwayBillId) {
        const [bill] = await tx.select().from(schema.ewayBills).where(eq(schema.ewayBills.id, locked.currentEwayBillId));
        if (bill && bill.status === 'active' && bill.validUpto >= ctx.now) {
          throw conflict('EWAY_BILL_ACTIVE', `Cancel e-way bill ${bill.ewayBillNumber.trim()} before cancelling the document`);
        }
      }
      if (await eInvoiceGenerated(tx, locked.id)) throw conflict('EINVOICE_ACTIVE', 'Cancel the e-invoice (IRN) before cancelling the document');
      await reverseStock(tx, ctx.company, locked, ctx.user.id, 'cancelled');
      await tx.update(schema.paymentLinks).set({ status: 'cancelled' }).where(and(eq(schema.paymentLinks.documentId, locked.id), eq(schema.paymentLinks.status, 'active')));
    }
    const [updated] = await tx
      .update(D)
      .set({ status: target, version: locked.version + 1, updatedAt: ctx.now })
      .where(and(eq(D.id, locked.id), eq(D.version, locked.version)))
      .returning();
    if (!updated) throw preconditionFailed();
    if (isCredit(updated) && updated.sourceDocumentId) {
      await tx.select({ id: D.id }).from(D).where(eq(D.id, updated.sourceDocumentId)).for('update');
      await syncPaymentState(tx, ctx.user, ctx.company.id, [updated.sourceDocumentId], ctx.now);
    }
    await recordChange(tx, ctx.user, {
      companyId: ctx.company.id,
      action: `marked ${target}`,
      entityType: 'document',
      entityId: updated.id,
      entityLabel: updated.number,
      version: updated.version,
      before: { status: from },
      after: { status: target, reason },
    });
    return updated;
  });
}

/** Fields that freeze once a document is finalised; only notes, terms, reference and attachments stay editable. */
function frozenChanges(row: DocRow, body: Schema<'NewDocumentInput'>, stored: LineInput[]): string[] {
  const changed: string[] = [];
  const cmp = (field: string, sent: unknown, have: unknown) => {
    if (sent !== undefined && sent !== have) changed.push(field);
  };
  cmp('kind', body.kind, row.kind);
  cmp('partyId', body.partyId, row.partyId);
  cmp('date', body.date, row.date);
  cmp('currency', body.currency, row.currency.trim());
  cmp('branchId', body.branchId, row.branchId);
  cmp('dueDate', body.dueDate, row.dueDate);
  cmp('validUntil', body.validUntil, row.validUntil);
  cmp('exchangeRate', body.exchangeRate, Number(row.exchangeRate));
  cmp('documentDiscountMode', body.documentDiscountMode, row.documentDiscountMode);
  cmp('documentDiscountValue', body.documentDiscountValue, Number(row.documentDiscountValue));
  cmp('charges', body.charges?.minor, row.chargesMinor);
  cmp('applyRoundOff', body.applyRoundOff, row.applyRoundOff);
  cmp('roundOffManual', body.roundOffManual?.minor, row.roundOffManualMinor);
  cmp('placeOfSupplyStateCode', body.placeOfSupplyStateCode, row.placeOfSupplyStateCode);
  cmp('supplierDocNumber', body.supplierDocNumber, row.supplierDocNumber);
  cmp('sourceDocumentId', body.sourceDocumentId, row.sourceDocumentId);
  const sig = (l: LineInput) => [l.itemId ?? '', l.name, l.quantity, l.unit, l.unitPriceMinor, l.discountMode, l.discountValue, l.taxCategoryId, l.taxInclusive].join('|');
  const sent = linesFromWire(body.lines).map(sig);
  const have = stored.map(sig);
  if (sent.length !== have.length || sent.some((s, i) => s !== have[i])) changed.push('lines');
  return changed;
}

async function eInvoiceGenerated(db: DbOrTx, documentId: string): Promise<boolean> {
  const [e] = await db.select({ status: schema.eInvoices.status }).from(schema.eInvoices).where(eq(schema.eInvoices.documentId, documentId));
  return e?.status === 'generated';
}

/**
 * Documents: listDocuments, createDocument, calculateDocument, getDocument,
 * updateDocument, removeDocument, finalizeDocument, setDocumentStatus,
 * convertDocument, duplicateDocument, getDocumentPdf, createShareLink,
 * sendDocument, createPaymentLink.
 */
const splitList = <T extends string>(v: T[] | undefined) => (v ?? []).flatMap((x) => String(x).split(',')).filter(Boolean) as T[];

type ListQuery = Pick<Ctx<'listDocuments'>['query'], 'kind' | 'status' | 'partyId' | 'branchId' | 'from' | 'to' | 'q'> & Partial<Pick<Ctx<'listDocuments'>['query'], 'sourceDocumentId' | 'outstanding' | 'overdue' | 'eInvoiceStatus' | 'recurring'>>;

/** The WHERE of a document list, shared by the list and its summary so the two never disagree. */
function listFilters(ctx: Pick<Ctx<'listDocuments'>, 'company' | 'user' | 'db' | 'now'>, q: ListQuery): (SQL | undefined)[] {
  const asOf = today(ctx.now);
  const kinds = splitList(q.kind);
  const statuses = splitList(q.status);
  const full = hasModule(ctx.company.plan, 'purchases');
  for (const k of kinds) assertKindAllowed(ctx.company, k);

  const filters: (SQL | undefined)[] = [eq(D.companyId, ctx.company.id)];
  if (kinds.length) filters.push(inArray(D.kind, kinds));
  else if (!full) filters.push(inArray(D.kind, SALES_KINDS));
  if (ctx.user.branchIds.length) filters.push(inArray(D.branchId, ctx.user.branchIds));
  if (statuses.length) filters.push(inArray(effectiveStatusSql(asOf), statuses));
  if (q.partyId) filters.push(eq(D.partyId, q.partyId));
  if (q.recurring) filters.push(ne(D.recurrence, 'none'));
  if (q.branchId) filters.push(eq(D.branchId, q.branchId));
  if (q.from) filters.push(gte(D.date, q.from));
  if (q.to) filters.push(lte(D.date, q.to));
  if (q.sourceDocumentId) filters.push(eq(D.sourceDocumentId, q.sourceDocumentId));
  if (q.outstanding !== undefined) {
    const open = and(inArray(D.kind, PAYABLE_KINDS), notInArray(D.status, ['draft', 'cancelled']), sql`${D.grandTotalMinor} > ${D.amountPaidMinor}`);
    filters.push(q.outstanding ? open : sql`not (${open})`);
  }
  if (q.overdue !== undefined) filters.push(q.overdue ? sql`${effectiveStatusSql(asOf)} = 'overdue'` : sql`${effectiveStatusSql(asOf)} <> 'overdue'`);
  if (q.eInvoiceStatus) {
    const E = schema.eInvoices;
    filters.push(exists(ctx.db.select({ one: sql`1` }).from(E).where(and(eq(E.documentId, D.id), eq(E.status, q.eInvoiceStatus)))));
  }
  if (q.q) {
    const like = `%${q.q.trim()}%`;
    filters.push(or(ilike(D.number, like), ilike(D.reference, like), ilike(D.supplierDocNumber, like), ilike(P.name, like)));
  }
  return filters;
}

export const documentsHandlers = defineHandlers({
  async listDocuments(ctx) {
    const q = ctx.query;
    const filters = listFilters(ctx, q);
    const sort = q.sort ?? '-date';
    const column = sort.endsWith('number') ? D.number : sort.endsWith('total') ? D.grandTotalMinor : D.date;
    const k = keyset({ cursor: q.cursor, limit: q.limit, sort: column, id: D.id, order: sort.startsWith('-') ? 'desc' : 'asc' });
    const rows = await ctx.db
      .select({ ...getTableColumns(D), partyName: P.name })
      .from(D)
      .innerJoin(P, eq(P.id, D.partyId))
      .where(and(...filters, k.where))
      .orderBy(...k.orderBy)
      .limit(k.take);
    const page = rows.slice(0, k.take - 1) as SummaryRow[];
    return k.page(await summariesToWire(ctx.db, page, ctx.now), rows);
  },

  async summarizeDocumentList(ctx) {
    const base = ctx.company.baseCurrency.trim();
    const asOf = today(ctx.now);
    const status = effectiveStatusSql(asOf);
    // Chips show every status there is, so they ignore the status filter; the count and total keep it.
    const rows = await ctx.db
      .select({ status: sql<DocStatus>`${status}`, count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(round(${D.grandTotalMinor} * ${D.exchangeRate})), 0)::bigint` })
      .from(D)
      .innerJoin(P, eq(P.id, D.partyId))
      .where(and(...listFilters(ctx, { ...ctx.query, status: undefined })))
      // By position: the status expression carries the date as a parameter, which GROUP BY can't match by text.
      .groupBy(sql`1`);
    const wanted = new Set(splitList(ctx.query.status));
    const counted = rows.filter((r) => !wanted.size || wanted.has(r.status));
    return {
      count: counted.reduce((a, r) => a + r.count, 0),
      // A cancelled or rejected document no longer counts towards what was billed.
      total: money(counted.filter((r) => r.status !== 'cancelled' && r.status !== 'rejected').reduce((a, r) => a + Number(r.total), 0), base),
      byStatus: rows.map((r) => ({ status: r.status, count: r.count, total: money(Number(r.total), base) })).sort((a, b) => a.status.localeCompare(b.status)),
    };
  },

  async previewTds(ctx) {
    const base = ctx.company.baseCurrency.trim();
    const [party] = await ctx.db.select().from(P).where(and(eq(P.companyId, ctx.company.id), eq(P.id, ctx.body.partyId)));
    if (!party) throw notFound('Party');
    const section = tdsSectionFor(ctx.company, party, ctx.body.section);
    const r = await tdsOn(ctx.db, ctx.company, party, section, ctx.body.date, ctx.body.taxable.minor, { documentId: ctx.body.documentId });
    return { ...(r.section ? { section: r.section } : {}), rate: r.rate, amount: money(r.amountMinor, base), reason: r.reason };
  },

  async createDocument(ctx) {
    const body = ctx.body;
    assertKindAllowed(ctx.company, body.kind);
    const status = checkRequestedStatus(body.kind, body.status);
    const row = await insertDocument(ctx, fieldsFromWire(body), linesFromWire(body.lines), status, { attachmentIds: body.attachmentIds, overrideCreditLimit: body.overrideCreditLimit });
    setEtag(ctx.reply, row.version);
    return toWire(ctx, row);
  },

  async setDocumentRecurrence(ctx) {
    const { recurrence, endDate, autoSend } = ctx.body;
    const row = await ctx.db.transaction(async (tx) => {
      const current = await findDocument(ctx, tx, ctx.params.id, { lock: true });
      checkIfMatch(ctx.req, current.version);
      const status = effectiveStatus(current, today(ctx.now));
      if (recurrence !== 'none') {
        if (current.kind !== 'invoice') throw unprocessable([{ field: 'recurrence', message: 'Only an invoice can repeat', severity: 'blocking' }], 'NOT_RECURRABLE');
        if (current.recurringParentId) throw unprocessable([{ field: 'recurrence', message: `${current.number} is a copy of a recurring invoice; change the series on the original`, severity: 'blocking' }], 'NOT_RECURRABLE');
        if (!isFinalized(current.status) || status === 'cancelled') throw unprocessable([{ field: 'recurrence', message: 'Issue the invoice before it can repeat; a cancelled one cannot', severity: 'blocking' }], 'NOT_RECURRABLE');
        if (endDate && endDate <= current.date) throw invalid('endDate', 'The series must end after the invoice date');
      }
      // The next copy is the first date of the series after today, counted from the invoice's own date,
      // so turning it on doesn't back-date a run of copies. Changing the frequency recounts it.
      const next = recurrence === 'none' ? null : nextRecurrence(current.date, recurrence, current.recurrence === recurrence && current.nextRecurrenceDate ? addDaysISO(current.nextRecurrenceDate, -1) : [current.date, addDaysISO(today(ctx.now), -1)].sort().at(-1)!);
      const ended = next && endDate && next > endDate ? null : next;
      const [updated] = await tx
        .update(D)
        .set({ recurrence, nextRecurrenceDate: ended, recurrenceEndDate: recurrence === 'none' ? null : (endDate ?? null), recurrenceAutoSend: recurrence !== 'none' && !!autoSend, version: current.version + 1, updatedAt: ctx.now })
        .where(eq(D.id, current.id))
        .returning();
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: 'updated',
        entityType: 'document',
        entityId: updated.id,
        entityLabel: updated.number,
        version: updated.version,
        before: { recurrence: current.recurrence, nextRecurrenceDate: current.nextRecurrenceDate },
        after: { recurrence: updated.recurrence, nextRecurrenceDate: updated.nextRecurrenceDate },
      });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return toWire(ctx, row);
  },

  async listApprovals(ctx) {
    const rows = await pendingApprovals(ctx.db, ctx.company.id);
    return { data: await documentsToWire(ctx.db, rows.filter((r) => branchVisible(ctx.user, r.branchId)), ctx.now, ctx.company.baseCurrency.trim()) };
  },

  async approveDocument(ctx) {
    const current = await findDocument(ctx, ctx.db, ctx.params.id);
    if ((current.approval as Approval | null)?.status !== 'pending') throw conflict('NOT_AWAITING_APPROVAL', `${current.number} is not waiting for approval`);
    await ctx.db.transaction((tx) => decide(tx, ctx.user, current, 'approved', ctx.now));
    // Issued as the approver, the way its creator asked.
    const row = await finalizeDraft(ctx, current.id, FINAL_STATUS[current.kind]);
    setEtag(ctx.reply, row.version);
    return toWire(ctx, row);
  },

  async rejectDocument(ctx) {
    const current = await findDocument(ctx, ctx.db, ctx.params.id);
    if ((current.approval as Approval | null)?.status !== 'pending') throw conflict('NOT_AWAITING_APPROVAL', `${current.number} is not waiting for approval`);
    const row = await ctx.db.transaction((tx) => decide(tx, ctx.user, current, 'rejected', ctx.now, ctx.body.note.trim()));
    setEtag(ctx.reply, row.version);
    return toWire(ctx, row);
  },

  async calculateDocument(ctx) {
    assertKindAllowed(ctx.company, ctx.body.kind);
    const prepared = await prepareDocument(ctx.db, ctx.company, fieldsFromWire(ctx.body), linesFromWire(ctx.body.lines), { snapshotRates: true });
    return prepared.totals;
  },

  async getDocument(ctx) {
    const row = await findDocument(ctx, ctx.db, ctx.params.id);
    const doc = await toWire(ctx, row);
    const status = doc.status as DocStatus;
    const A = schema.paymentAllocations;
    const [[party], paymentRows, related] = await Promise.all([
      ctx.db.select().from(P).where(eq(P.id, row.partyId)),
      ctx.db
        .select(getTableColumns(schema.payments))
        .from(schema.payments)
        .innerJoin(A, eq(A.paymentId, schema.payments.id))
        .where(and(eq(schema.payments.companyId, ctx.company.id), eq(A.documentId, row.id)))
        .orderBy(asc(schema.payments.date), asc(schema.payments.id)),
      ctx.db
        .select({ ...getTableColumns(D), partyName: P.name })
        .from(D)
        .innerJoin(P, eq(P.id, D.partyId))
        .where(and(eq(D.companyId, ctx.company.id), or(eq(D.sourceDocumentId, row.id), row.sourceDocumentId ? eq(D.id, row.sourceDocumentId) : undefined)))
        .orderBy(desc(D.date)),
    ]);
    const currency = row.currency.trim();
    const open = isFinalized(status) && status !== 'cancelled';
    const conversions = CONVERSIONS[row.kind].filter((target) => {
      if (isPurchaseKind(target) && !hasModule(ctx.company.plan, 'purchases')) return false;
      return !conversionBlock({ id: row.id, status }, target, related as { kind: DocumentKind; status: DocStatus; sourceDocumentId: string | null }[]);
    });
    setEtag(ctx.reply, row.version);
    return {
      ...doc,
      party: partyToWire(party),
      allocated: money(row.amountPaidMinor, currency),
      outstanding: money(open && isPayableDocument(row.kind) ? Math.max(row.grandTotalMinor - row.amountPaidMinor, 0) : 0, currency),
      payments: await paymentsToWire(ctx.db, paymentRows, ctx.company.baseCurrency.trim()),
      linkedDocuments: await summariesToWire(ctx.db, related as SummaryRow[], ctx.now),
      allowedTransitions: nextStatuses(row.kind, status).filter((s) => !DERIVED.includes(s)),
      allowedConversions: conversions,
    };
  },

  async updateDocument(ctx) {
    const body = ctx.body;
    const current = await findDocument(ctx, ctx.db, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    if (await eInvoiceGenerated(ctx.db, current.id)) throw conflict('DOCUMENT_LOCKED', 'An e-invoiced document cannot be edited; cancel the IRN first');
    const storedLines = await ctx.db.select().from(schema.documentLines).where(eq(schema.documentLines.documentId, current.id));

    const row = await ctx.db.transaction(async (tx) => {
      let updated: DocRow | undefined;
      if (isFinalized(current.status) || current.status === 'cancelled') {
        const changed = frozenChanges(current, body, linesFromRows(storedLines));
        if (changed.length) throw conflict('DOCUMENT_FINALIZED', `A finalised document only takes notes, terms, reference and attachments (changed: ${changed.join(', ')})`);
        [updated] = await tx
          .update(D)
          .set({
            notes: body.notes !== undefined ? body.notes : current.notes,
            terms: body.terms !== undefined ? body.terms : current.terms,
            reference: body.reference !== undefined ? body.reference : current.reference,
            version: current.version + 1,
            updatedAt: ctx.now,
          })
          .where(and(eq(D.id, current.id), eq(D.version, current.version)))
          .returning();
        if (!updated) throw preconditionFailed();
      } else {
        if (body.kind !== current.kind) throw invalid('kind', 'A document cannot change kind; convert it instead');
        const prepared = await prepareDocument(tx, ctx.company, fieldsFromWire(body, current), linesFromWire(body.lines), { snapshotRates: true, documentId: current.id });
        if (!branchVisible(ctx.user, prepared.columns.branchId)) throw invalid('branchId', 'You cannot move documents to this branch');
        [updated] = await tx
          .update(D)
          .set({ ...prepared.columns, version: current.version + 1, updatedAt: ctx.now })
          .where(and(eq(D.id, current.id), eq(D.version, current.version)))
          .returning();
        if (!updated) throw preconditionFailed();
        await writeLines(tx, current.id, prepared);
      }
      await linkAttachments(tx, ctx.company.id, current.id, body.attachmentIds);
      const newLines = await tx.select().from(schema.documentLines).where(eq(schema.documentLines.documentId, current.id));
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: 'updated',
        entityType: 'document',
        entityId: updated.id,
        entityLabel: updated.number,
        version: updated.version,
        before: await auditSnapshot(tx, current, storedLines),
        after: await auditSnapshot(tx, updated, newLines),
      });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return toWire(ctx, row);
  },

  async removeDocument(ctx) {
    const current = await findDocument(ctx, ctx.db, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    if (isFinalized(current.status) || current.status === 'cancelled') {
      throw conflict('DOCUMENT_NOT_DRAFT', `${current.number} is ${current.status}; only drafts can be deleted, so cancel it instead`);
    }
    const [child] = await ctx.db.select({ number: D.number }).from(D).where(eq(D.sourceDocumentId, current.id)).limit(1);
    if (child) throw conflict('DOCUMENT_IN_USE', `${child.number} was created from this draft`);
    // A draft's e-invoice record is only a pending one (a check run, or an attempt that failed):
    // an IRN is issued on a finalised invoice. One with an IRN is never thrown away.
    const [einv] = await ctx.db.select({ irn: schema.eInvoices.irn }).from(schema.eInvoices).where(eq(schema.eInvoices.documentId, current.id));
    if (einv?.irn) throw conflict('DOCUMENT_IN_USE', `${current.number} has an IRN; cancel the e-invoice instead`);
    await ctx.db.transaction(async (tx) => {
      await tx.delete(schema.eInvoices).where(eq(schema.eInvoices.documentId, current.id));
      await linkAttachments(tx, ctx.company.id, current.id, []);
      await tx.delete(schema.shareLinks).where(eq(schema.shareLinks.documentId, current.id));
      await tx.delete(schema.reminderDocuments).where(eq(schema.reminderDocuments.documentId, current.id));
      await tx.update(schema.messageDeliveries).set({ documentId: null }).where(eq(schema.messageDeliveries.documentId, current.id));
      const before = await auditSnapshot(tx, current, await tx.select().from(schema.documentLines).where(eq(schema.documentLines.documentId, current.id)));
      await deleteLines(tx, current.id);
      const deleted = await tx.delete(D).where(and(eq(D.id, current.id), eq(D.version, current.version))).returning({ id: D.id });
      if (!deleted.length) throw preconditionFailed();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'deleted', entityType: 'document', entityId: current.id, entityLabel: current.number, version: current.version + 1, deleted: true, before });
    });
    return undefined;
  },

  async finalizeDocument(ctx) {
    const current = await findDocument(ctx, ctx.db, ctx.params.id);
    const row = await finalizeDraft(ctx, current.id, FINAL_STATUS[current.kind], { overrideCreditLimit: ctx.body?.overrideCreditLimit });
    setEtag(ctx.reply, row.version);
    return { document: await toWire(ctx, row) };
  },

  async setDocumentStatus(ctx) {
    const target = ctx.body.status;
    if (DERIVED.includes(target)) {
      throw invalid('status', `${target} is derived from payments and the due date; record a payment instead`, 'STATUS_DERIVED');
    }
    const current = await findDocument(ctx, ctx.db, ctx.params.id);
    const from = effectiveStatus(current, today(ctx.now));
    // Before the transition: a fully credited invoice reads as paid, which would hide the reason.
    if (target === 'cancelled') await assertNoLiveReturns(ctx.db, current);
    if (!canTransition(current.kind, from, target)) throw conflict('INVALID_TRANSITION', `A ${current.kind} cannot go from ${from} to ${target}`);

    const row = !isFinalized(current.status) && isFinalized(target) && target !== 'cancelled' ? await finalizeDraft(ctx, current.id, target, { overrideCreditLimit: ctx.body.overrideCreditLimit }) : await changeStatus(ctx, current.id, target, ctx.body.reason);
    setEtag(ctx.reply, row.version);
    return toWire(ctx, row);
  },

  async convertDocument(ctx) {
    const src = await findDocument(ctx, ctx.db, ctx.params.id);
    const target = ctx.body.targetKind;
    assertKindAllowed(ctx.company, target);
    const status = effectiveStatus(src, today(ctx.now));
    if (!CONVERSIONS[src.kind].includes(target)) throw conflict('INVALID_CONVERSION', `A ${src.kind} cannot be converted to a ${target}`);
    // Nothing from a draft or a cancelled document, and an order or quote is carried forward once.
    const made = await ctx.db.select({ kind: D.kind, status: D.status, sourceDocumentId: D.sourceDocumentId, number: D.number }).from(D).where(and(eq(D.companyId, ctx.company.id), eq(D.sourceDocumentId, src.id)));
    const block = conversionBlock({ id: src.id, status }, target, made as { kind: DocumentKind; status: DocStatus; sourceDocumentId: string | null; number: string | null }[]);
    if (block === 'cancelled') throw conflict('INVALID_CONVERSION', `${src.number} is ${status}`);
    if (block === 'draft') {
      throw conflict('INVALID_CONVERSION', NOTE_SOURCE[target] ? 'A return or note is raised against a finalised document' : 'A draft is finalised before anything is made from it');
    }
    if (block === 'converted') {
      const onward = made.find((d) => !NOTE_SOURCE[d.kind] && d.status !== 'cancelled' && d.status !== 'rejected');
      throw conflict('ALREADY_CONVERTED', `${src.number} has already been carried forward${onward?.number ? ` to ${onward.number}` : ''}; cancel that first to convert it again`);
    }
    const stored = linesFromRows(await ctx.db.select().from(schema.documentLines).where(eq(schema.documentLines.documentId, src.id)));
    let lines = stored;
    if (ctx.body.lineIds?.length) {
      const unknown = ctx.body.lineIds.filter((id) => !stored.some((l) => l.id === id));
      if (unknown.length) throw unprocessable(unknown.map((id) => ({ field: 'lineIds', message: `${id} is not a line of ${src.number}`, severity: 'blocking' as const })));
      lines = stored.filter((l) => ctx.body.lineIds!.includes(l.id!));
    }
    // A new document takes the supplier's TDS section, not the one its source was finalised with.
    const f: DocFields = { ...fieldsFromRow(src), kind: target, date: today(ctx.now), dueDate: null, validUntil: null, sourceDocumentId: src.id, tdsSection: undefined };
    // The new draft keeps the source's tax rates: a return must reverse exactly what was charged.
    const row = await insertDocument(ctx, f, lines.map((l) => ({ ...l, id: undefined })), requestedStatus(target, 'draft') as DocStatus, {
      snapshotRates: false,
      action: `converted from ${src.number}`,
    });
    setEtag(ctx.reply, row.version);
    return toWire(ctx, row);
  },

  async duplicateDocument(ctx) {
    const src = await findDocument(ctx, ctx.db, ctx.params.id);
    const stored = linesFromRows(await ctx.db.select().from(schema.documentLines).where(eq(schema.documentLines.documentId, src.id)));
    const f: DocFields = { ...fieldsFromRow(src), date: today(ctx.now), dueDate: null, validUntil: null, sourceDocumentId: null, tdsSection: src.tdsSection ?? undefined };
    const row = await insertDocument(ctx, f, stored.map((l) => ({ ...l, id: undefined, taxRate: undefined })), requestedStatus(src.kind, 'draft') as DocStatus, {
      action: `duplicated from ${src.number}`,
    });
    setEtag(ctx.reply, row.version);
    return toWire(ctx, row);
  },

  async getDocumentPdf(ctx) {
    const row = await findDocument(ctx, ctx.db, ctx.params.id);
    const pdf = await renderDocumentPdf(ctx.db, ctx.deps, ctx.company, row, { now: ctx.now, locale: ctx.query.locale, copy: ctx.query.copy });
    return new RawBody(pdf, 'application/pdf', pdfFilename(row.number));
  },

  async createShareLink(ctx) {
    const row = await findDocument(ctx, ctx.db, ctx.params.id);
    const link = await ctx.db.transaction((tx) => createShareLinkFor(tx, ctx.deps, ctx.user, row, ctx.now));
    const pdf = await storePdfLinkFor(ctx.db, ctx.deps, ctx.company, row, ctx.now);
    return { url: link.url, expiresAt: link.expiresAt.toISOString(), pdfUrl: pdf.url, pdfExpiresAt: pdf.expiresAt.toISOString() };
  },

  async sendDocument(ctx) {
    const body = ctx.body;
    let row = await findDocument(ctx, ctx.db, ctx.params.id);
    const [party] = await ctx.db.select().from(P).where(eq(P.id, row.partyId));
    const recipients = body.to?.length ? body.to : [body.channel === 'email' ? party.email : party.phone].filter((x): x is string => !!x);
    if (!recipients.length) throw invalid('to', `${party.name} has no ${body.channel === 'email' ? 'email address' : 'phone number'}; send one in "to"`);

    // Sending a draft quote issues it (it takes its number); an invoice keeps its status.
    if (canTransition(row.kind, effectiveStatus(row, today(ctx.now)), 'sent')) {
      row = isFinalized(row.status) ? await changeStatus(ctx, row.id, 'sent') : await finalizeDraft(ctx, row.id, 'sent');
    }
    // A payment link only makes sense for an invoice that still has money owing.
    const payable = row.kind === 'invoice' && !['draft', 'cancelled', 'paid'].includes(effectiveStatus(row, today(ctx.now)));

    const { messageId, queued, text, html, inline, pdfUrl } = await ctx.db.transaction(async (tx) => {
      const share = await createShareLinkFor(tx, ctx.deps, ctx.user, row, ctx.now);
      const pay = body.includePaymentLink && payable ? await paymentLinkFor(tx, ctx.deps, ctx.company, ctx.user, row, ctx.now) : null;
      let pdfUrl: string | undefined;
      if (body.attachPdf ?? true) {
        pdfUrl = (await storePdfLinkFor(tx, ctx.deps, ctx.company, row, ctx.now)).url;
      }
      const total = formatMoney(money(row.grandTotalMinor, row.currency.trim()));
      const message = body.message ?? `Dear ${party.name}, please find ${row.number} for ${total} from ${ctx.company.name}.`;
      const text = [message, `View: ${share.url}`, pay ? `Pay: ${pay.url}` : ''].filter(Boolean).join('\n');
      // The same email with the business's own logo and name on top and a summary of the document;
      // the text above stays for clients without HTML.
      const currency = row.currency.trim();
      const due = row.grandTotalMinor - row.amountPaidMinor;
      const partPaid = (row.kind === 'invoice' || row.kind === 'purchaseBill') && row.amountPaidMinor > 0 && due > 0;
      const c = ctx.company;
      // The logo rides inside the email (a link would need public storage, and mail apps block remote
      // images); none on file, or one too big to carry, and only the name shows.
      const logo = body.channel === 'email' ? await companyLogoFile(tx, ctx.deps, c, LOGO_EMAIL_MAX_BYTES) : undefined;
      const inline = logo ? [{ cid: BUSINESS_LOGO_CID, name: `logo.${logo.mime === 'image/png' ? 'png' : 'jpg'}`, contentType: logo.mime, base64: logo.base64 }] : undefined;
      const html =
        body.channel === 'email'
          ? renderDocumentEmailHtml({
              businessName: c.name,
              // Lives as long as the share link, so the email still shows it when the customer comes back to it.
              logoCid: logo ? BUSINESS_LOGO_CID : undefined,
              businessDetails: [
                [c.addressLine1, c.addressLine2, c.addressCity, [c.addressState, c.addressPostalCode].filter(Boolean).join(' ')].filter(Boolean).join(', '),
                [c.phone, c.email].filter(Boolean).join(' · '),
                c.taxIdentifier ? `${c.taxIdentifierLabel ?? 'Tax ID'}: ${c.taxIdentifier}` : '',
              ].filter(Boolean),
              title: EMAIL_TITLES[row.kind],
              number: row.number,
              amount: { label: partPaid ? 'Amount due' : 'Total', value: formatMoney(money(partPaid ? due : row.grandTotalMinor, currency)) },
              facts: [
                { label: 'Date', value: formatDate(row.date) },
                ...(row.dueDate ? [{ label: 'Due date', value: formatDate(row.dueDate) }] : []),
                ...(row.validUntil ? [{ label: 'Valid until', value: formatDate(row.validUntil) }] : []),
                ...(partPaid ? [{ label: 'Total', value: formatMoney(money(row.grandTotalMinor, currency)) }, { label: 'Paid', value: formatMoney(money(row.amountPaidMinor, currency)) }] : []),
              ],
              message,
              // Paying is what an invoice with a payment link asks for, so that button leads.
              links: [
                ...(pay ? [{ label: 'Pay now', url: pay.url }] : []),
                { label: `View ${EMAIL_TITLES[row.kind].toLowerCase()}`, url: share.url },
                ...(pdfUrl ? [{ label: 'Download PDF', url: pdfUrl }] : []),
              ],
            })
          : undefined;

      // What a retry under a new key would repeat: this document, just sent to this person.
      const MD = schema.messageDeliveries;
      const recent = await tx
        .select({ id: MD.id, recipient: MD.recipient })
        .from(MD)
        .where(and(eq(MD.documentId, row.id), eq(MD.channel, body.channel), inArray(MD.status, ['sent', 'delivered', 'read']), gte(MD.createdAt, new Date(ctx.now.getTime() - RESEND_WINDOW_MS))));
      let first: string | undefined;
      const queued: { id: string; to: string }[] = [];
      for (const to of [...recipients, ...(body.channel === 'email' ? (body.cc ?? []) : [])]) {
        const already = recent.find((r) => r.recipient === to.slice(0, 254));
        if (already) {
          first ??= already.id;
          continue;
        }
        const id = newId('msg');
        first ??= id;
        queued.push({ id, to });
        await tx.insert(MD).values({
          id,
          companyId: row.companyId,
          channel: body.channel,
          purpose: 'documentSend',
          recipient: to.slice(0, 254),
          partyId: row.partyId,
          documentId: row.id,
          message: text,
          includePaymentLink: !!pay,
          provider: body.channel,
          status: 'queued',
          sentBy: ctx.user.id,
          createdAt: ctx.now,
        });
      }
      return { messageId: first!, queued, text, html, inline, pdfUrl };
    });

    // After the commit: the links they carry exist by now, and a message can't be unsent by a rollback.
    const failures: string[] = [];
    for (const { id, to } of queued) {
      try {
        const sent =
            body.channel === 'email'
              ? await ctx.deps.providers.email.send({ to, subject: `${row.number} from ${ctx.company.name}`, text: pdfUrl ? `${text}\nPDF: ${pdfUrl}` : text, html, inline })
              : body.channel === 'whatsapp'
                ? await ctx.deps.providers.whatsapp.send({ to, text, documentUrl: pdfUrl, filename: pdfFilename(row.number) })
                : await ctx.deps.providers.sms.send(to, text);
        await ctx.db.update(schema.messageDeliveries).set({ status: 'sent', providerMessageId: sent.providerMessageId }).where(eq(schema.messageDeliveries.id, id));
      } catch (err) {
        await ctx.db.update(schema.messageDeliveries).set({ status: 'failed', error: (err as Error).message }).where(eq(schema.messageDeliveries.id, id));
        failures.push((err as Error).message);
      }
    }
    // Nobody got it: say so, rather than "sent" for a message the provider refused
    // (Resend's test sender, for one, only delivers to its own account's address).
    if (queued.length && failures.length === queued.length) {
      throw upstream('SEND_FAILED', `The ${body.channel} could not be sent: ${failures[0]}`);
    }
    if (queued.length) {
      await notify(ctx.db, ctx.deps, {
        companyId: row.companyId,
        kind: 'invoiceSent',
        title: `${row.number} sent`,
        body: `${row.number} was sent to ${party.name} by ${body.channel}.`,
        entityType: 'document',
        entityId: row.id,
      });
    }
    return { messageId, status: 'queued' as const };
  },

  async createPaymentLink(ctx) {
    const row = await findDocument(ctx, ctx.db, ctx.params.id);
    const amount = ctx.body?.amount;
    if (amount && amount.currency !== row.currency.trim()) throw invalid('amount.currency', `Must be in the document's currency (${row.currency.trim()})`);
    const link = await ctx.db.transaction((tx) => paymentLinkFor(tx, ctx.deps, ctx.company, ctx.user, row, ctx.now, amount?.minor));
    return { url: link.url, upiUri: link.upiUri ?? undefined, expiresAt: link.expiresAt?.toISOString() };
  },
});
