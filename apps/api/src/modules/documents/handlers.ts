import { and, asc, desc, eq, exists, getTableColumns, gte, ilike, inArray, lte, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { SALES_KINDS, canTransition, isFinalized, nextStatuses } from '@esmart/core/domain/documentStates';
import { hasModule } from '@esmart/core/domain/plan';
import type { DocStatus, DocumentKind } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { RawBody, defineHandlers, type AuthUser, type Ctx } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { conflict, invalid, notFound, preconditionFailed, unprocessable } from '../../http/errors';
import { keyset } from '../../http/pagination';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { notify } from '../../lib/notify';
import { money } from '../../lib/wire';
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
import { CONVERSIONS, DERIVED, FINAL_STATUS, effectiveStatus, effectiveStatusSql, finalizeInTx, reverseStock, today } from './lifecycle';
import { createShareLinkFor, paymentLinkFor, pdfFilename, renderDocumentPdf } from './outbound';
import { documentsToWire, summariesToWire, type DocumentWire, type SummaryRow } from './wire';

const D = schema.documents;
const P = schema.parties;
/** What the helpers need from any document operation's context. */
type AnyCtx = Pick<Ctx<'getDocument'>, 'company' | 'user' | 'db' | 'now' | 'deps' | 'req' | 'reply'>;

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
async function insertDocument(ctx: AnyCtx, f: DocFields, lines: LineInput[], status: DocStatus, extra: { attachmentIds?: string[]; snapshotRates?: boolean; action?: string; overrideCreditLimit?: boolean } = {}) {
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
    const prepared = await prepareDocument(tx, ctx.company, fieldsFromRow(row), linesFromRows(lines), { snapshotRates: true });
    const [recomputed] = await tx.update(D).set({ ...prepared.columns, updatedAt: ctx.now }).where(eq(D.id, row.id)).returning();
    await writeLines(tx, row.id, prepared);
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
 * with money allocated, or a live e-invoice, cannot be cancelled.
 */
async function changeStatus(ctx: AnyCtx, id: string, target: DocStatus, reason?: string): Promise<DocRow> {
  return ctx.db.transaction(async (tx) => {
    const locked = await findDocument(ctx, tx, id, { lock: true });
    checkIfMatch(ctx.req, locked.version);
    const from = effectiveStatus(locked, today(ctx.now));
    if (!canTransition(locked.kind, from, target)) throw conflict('INVALID_TRANSITION', `A ${locked.kind} cannot go from ${from} to ${target}`);
    if (target === 'cancelled') {
      if (locked.amountPaidMinor > 0) throw conflict('DOCUMENT_HAS_PAYMENTS', 'Remove the payments allocated to this document before cancelling it');
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
export const documentsHandlers = defineHandlers({
  async listDocuments(ctx) {
    const q = ctx.query;
    const asOf = today(ctx.now);
    const split = <T extends string>(v: T[] | undefined) => (v ?? []).flatMap((x) => String(x).split(',')).filter(Boolean) as T[];
    const kinds = split(q.kind);
    const statuses = split(q.status);
    const full = hasModule(ctx.company.plan, 'purchases');
    for (const k of kinds) assertKindAllowed(ctx.company, k);

    const filters: (SQL | undefined)[] = [eq(D.companyId, ctx.company.id)];
    if (kinds.length) filters.push(inArray(D.kind, kinds));
    else if (!full) filters.push(inArray(D.kind, SALES_KINDS));
    if (ctx.user.branchIds.length) filters.push(inArray(D.branchId, ctx.user.branchIds));
    if (statuses.length) filters.push(inArray(effectiveStatusSql(asOf), statuses));
    if (q.partyId) filters.push(eq(D.partyId, q.partyId));
    if (q.branchId) filters.push(eq(D.branchId, q.branchId));
    if (q.from) filters.push(gte(D.date, q.from));
    if (q.to) filters.push(lte(D.date, q.to));
    if (q.sourceDocumentId) filters.push(eq(D.sourceDocumentId, q.sourceDocumentId));
    if (q.outstanding !== undefined) {
      const open = and(inArray(D.kind, ['invoice', 'purchaseBill']), notInArray(D.status, ['draft', 'cancelled']), sql`${D.grandTotalMinor} > ${D.amountPaidMinor}`);
      filters.push(q.outstanding ? open : sql`not (${open})`);
    }
    if (q.overdue !== undefined) filters.push(q.overdue ? sql`${effectiveStatusSql(asOf)} = 'overdue'` : sql`${effectiveStatusSql(asOf)} <> 'overdue'`);
    if (q.eInvoiceStatus) {
      const E = schema.eInvoices;
      filters.push(exists(ctx.db.select({ one: sql`1` }).from(E).where(and(eq(E.documentId, D.id), eq(E.status, q.eInvoiceStatus)))));
    }
    if (q.q) {
      const like = `%${q.q.trim()}%`;
      filters.push(or(ilike(D.number, like), ilike(D.reference, like), ilike(P.name, like)));
    }

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

  async createDocument(ctx) {
    const body = ctx.body;
    assertKindAllowed(ctx.company, body.kind);
    const status = checkRequestedStatus(body.kind, body.status);
    const row = await insertDocument(ctx, fieldsFromWire(body), linesFromWire(body.lines), status, { attachmentIds: body.attachmentIds, overrideCreditLimit: body.overrideCreditLimit });
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
      if (['cancelled', 'rejected'].includes(status)) return false;
      return target === 'salesReturn' || target === 'purchaseReturn' ? open : true;
    });
    setEtag(ctx.reply, row.version);
    return {
      ...doc,
      party: partyToWire(party),
      allocated: money(row.amountPaidMinor, currency),
      outstanding: money(open && (row.kind === 'invoice' || row.kind === 'purchaseBill') ? Math.max(row.grandTotalMinor - row.amountPaidMinor, 0) : 0, currency),
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
        const prepared = await prepareDocument(tx, ctx.company, fieldsFromWire(body, current), linesFromWire(body.lines), { snapshotRates: true });
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
    await ctx.db.transaction(async (tx) => {
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
    if (['cancelled', 'rejected'].includes(status)) throw conflict('INVALID_CONVERSION', `${src.number} is ${status}`);
    if ((target === 'salesReturn' || target === 'purchaseReturn') && !isFinalized(src.status)) {
      throw conflict('INVALID_CONVERSION', 'A return is raised against a finalised document');
    }
    const stored = linesFromRows(await ctx.db.select().from(schema.documentLines).where(eq(schema.documentLines.documentId, src.id)));
    let lines = stored;
    if (ctx.body.lineIds?.length) {
      const unknown = ctx.body.lineIds.filter((id) => !stored.some((l) => l.id === id));
      if (unknown.length) throw unprocessable(unknown.map((id) => ({ field: 'lineIds', message: `${id} is not a line of ${src.number}`, severity: 'blocking' as const })));
      lines = stored.filter((l) => ctx.body.lineIds!.includes(l.id!));
    }
    const f: DocFields = { ...fieldsFromRow(src), kind: target, date: today(ctx.now), dueDate: null, validUntil: null, sourceDocumentId: src.id };
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
    const f: DocFields = { ...fieldsFromRow(src), date: today(ctx.now), dueDate: null, validUntil: null, sourceDocumentId: null };
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
    return { url: link.url, expiresAt: link.expiresAt.toISOString() };
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

    const { messageId } = await ctx.db.transaction(async (tx) => {
      const share = await createShareLinkFor(tx, ctx.deps, ctx.user, row, ctx.now);
      const pay = body.includePaymentLink && payable ? await paymentLinkFor(tx, ctx.deps, ctx.company, ctx.user, row, ctx.now) : null;
      let pdfUrl: string | undefined;
      if (body.attachPdf ?? true) {
        const key = `companies/${row.companyId}/documents/${row.id}/${pdfFilename(row.number)}`;
        await ctx.deps.providers.storage.put(key, await renderDocumentPdf(tx, ctx.deps, ctx.company, row, { now: ctx.now }), 'application/pdf');
        pdfUrl = (await ctx.deps.providers.storage.downloadUrl(key, { ttlSeconds: 7 * 86_400, filename: pdfFilename(row.number) })).url;
      }
      const total = `${row.currency.trim()} ${(row.grandTotalMinor / 100).toFixed(2)}`;
      const text = [
        body.message ?? `Dear ${party.name}, please find ${row.number} for ${total} from ${ctx.company.name}.`,
        `View: ${share.url}`,
        pay ? `Pay: ${pay.url}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      let first: string | undefined;
      for (const to of [...recipients, ...(body.channel === 'email' ? (body.cc ?? []) : [])]) {
        const id = newId('msg');
        first ??= id;
        let status: 'sent' | 'failed' = 'sent';
        let providerMessageId: string | null = null;
        let error: string | null = null;
        try {
          const sent =
            body.channel === 'email'
              ? await ctx.deps.providers.email.send({ to, subject: `${row.number} from ${ctx.company.name}`, text: pdfUrl ? `${text}\nPDF: ${pdfUrl}` : text })
              : body.channel === 'whatsapp'
                ? await ctx.deps.providers.whatsapp.send({ to, text, documentUrl: pdfUrl, filename: pdfFilename(row.number) })
                : await ctx.deps.providers.sms.send(to, text);
          providerMessageId = sent.providerMessageId;
        } catch (err) {
          status = 'failed';
          error = (err as Error).message;
        }
        await tx.insert(schema.messageDeliveries).values({
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
          providerMessageId,
          status,
          error,
          sentBy: ctx.user.id,
          createdAt: ctx.now,
        });
      }
      await notify(tx, ctx.deps, {
        companyId: row.companyId,
        kind: 'invoiceSent',
        title: `${row.number} sent`,
        body: `${row.number} was sent to ${party.name} by ${body.channel}.`,
        entityType: 'document',
        entityId: row.id,
      });
      return { messageId: first! };
    });
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
