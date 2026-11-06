import { and, eq, gt, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Schema } from '@esmart/api-contract';
import { PAYABLE_KINDS, RECEIVABLE_KINDS } from '@esmart/core/domain/documentStates';
import { fifoAllocate } from '@esmart/core/domain/receivables';
import { schema } from '@esmart/db';
import { defineHandlers, type Ctx } from '../../context';
import { notFound, unprocessable, type Issue } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { money } from '../../lib/wire';
import { assertPeriodOpen, syncPaymentState } from '../documents/lifecycle';
import { writePayment } from './engine';
import { requestInput } from './requests';
import { paymentsToWire } from './wire';

const PAY = schema.payments;
const D = schema.documents;
const L = schema.documentLines;
const CA = schema.creditApplications;
const CLOSED = ['draft', 'requested', 'cancelled', 'rejected'] as const;

type AnyCtx = Pick<Ctx<'listAdjustable'>, 'company' | 'user' | 'db' | 'now' | 'deps'>;
type Side = 'customer' | 'supplier';
type Allocation = Schema<'AdjustmentAllocation'>;
type Credit = Schema<'Adjustable'>['credits'][number];
type Open = Schema<'Adjustable'>['open'][number];

/** The party, and which side of it is read: a supplier as one, a party that is both as asked. */
async function partySide(ctx: AnyCtx, db: DbOrTx, partyId: string, asked?: Side): Promise<{ party: typeof schema.parties.$inferSelect; side: Side }> {
  const [party] = await db.select().from(schema.parties).where(and(eq(schema.parties.companyId, ctx.company.id), eq(schema.parties.id, partyId)));
  if (!party) throw notFound('Party');
  const side: Side = party.kind === 'supplier' ? 'supplier' : party.kind === 'both' ? (asked ?? 'customer') : 'customer';
  return { party, side };
}

/**
 * What the party holds and owes on one side, oldest first. Credit: the unallocated part of its
 * receipts (or payments made), refunds aside, and direct notes less what is applied of them. Owed:
 * invoices and debit notes (or bills and supplier debit notes) not settled. Base currency only.
 */
export async function adjustable(ctx: AnyCtx, db: DbOrTx, partyId: string, side: Side) {
  const base = ctx.company.baseCurrency.trim();
  const branches = ctx.user.branchIds;
  const direction = side === 'customer' ? 'received' : 'paid';
  const pays = await db
    .select()
    .from(PAY)
    .where(
      and(
        eq(PAY.companyId, ctx.company.id),
        eq(PAY.partyId, partyId),
        eq(PAY.direction, direction),
        gt(PAY.unallocatedMinor, 0),
        isNull(PAY.refundOfPaymentId),
        eq(PAY.currency, base),
        branches.length ? inArray(PAY.branchId, branches) : undefined,
      ),
    )
    .orderBy(PAY.date, PAY.id);
  // Spelled out: inside a subquery drizzle leaves columns unqualified, and "id" would be the application's.
  const applied = sql<number>`coalesce((select sum(ca.amount_minor) from credit_applications ca where ca.note_id = "documents"."id"), 0)::bigint`;
  const notes = await db
    .select({ id: D.id, number: D.number, date: D.date, total: D.grandTotalMinor, tds: D.tdsAmountMinor, applied })
    .from(D)
    .where(
      and(
        eq(D.companyId, ctx.company.id),
        eq(D.partyId, partyId),
        eq(D.kind, side === 'customer' ? 'creditNote' : 'supplierCreditNote'),
        isNull(D.sourceDocumentId),
        notInArray(D.status, [...CLOSED]),
        eq(D.currency, base),
        branches.length ? inArray(D.branchId, branches) : undefined,
      ),
    )
    .orderBy(D.date, D.id);
  const kinds = PAYABLE_KINDS.filter((k) => RECEIVABLE_KINDS.includes(k) === (side === 'customer'));
  const docs = await db
    .select()
    .from(D)
    .where(
      and(
        eq(D.companyId, ctx.company.id),
        eq(D.partyId, partyId),
        inArray(D.kind, kinds),
        notInArray(D.status, [...CLOSED]),
        eq(D.currency, base),
        sql`${D.grandTotalMinor} > ${D.amountPaidMinor}`,
        branches.length ? inArray(D.branchId, branches) : undefined,
      ),
    )
    .orderBy(D.date, D.id);
  // A service line: an item that is a service, or a SAC (99…) on the line.
  const service = docs.length
    ? await db
        .selectDistinct({ documentId: L.documentId })
        .from(L)
        .leftJoin(schema.items, eq(schema.items.id, L.itemId))
        .where(and(inArray(L.documentId, docs.map((d) => d.id)), or(eq(schema.items.type, 'service'), sql`${L.hsnCode} like '99%'`)))
    : [];
  const withService = new Set(service.map((s) => s.documentId));
  const credits: (Credit & { left: { minor: number; currency: string } })[] = [
    ...notes
      .map((n) => ({ n, left: n.total - n.tds - Number(n.applied) }))
      .filter((x) => x.left > 0)
      .map(({ n, left }) => ({ sourceType: 'note' as const, id: n.id, number: n.number, date: n.date, total: money(n.total - n.tds, base), left: money(left, base) })),
    ...pays.map((p) => ({ sourceType: 'payment' as const, id: p.id, number: p.number, date: p.date, total: money(p.amountMinor + p.tdsMinor, base), left: money(p.unallocatedMinor, base), advanceTax: !!p.advanceTaxCategoryId })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const open: (Open & { outstanding: { minor: number; currency: string } })[] = docs.map((d) => ({
    documentId: d.id,
    number: d.number,
    kind: d.kind as Open['kind'],
    date: d.date,
    total: money(d.grandTotalMinor, base),
    outstanding: money(d.grandTotalMinor - d.amountPaidMinor, base),
    hasServiceLines: withService.has(d.id),
  }));
  return { credits, open, docs };
}

/**
 * Applies credit to documents. A payment's share joins its allocations (rewritten through
 * writePayment, so every payment rule holds and a service advance's tax comes back on the invoice's
 * date). A note's share is a credit application: no money, no GST on advance (RULES 8.13).
 */
export async function applyAdjustments(ctx: AnyCtx, tx: DbOrTx, partyId: string, side: Side, wanted?: Allocation[]): Promise<Allocation[]> {
  const base = ctx.company.baseCurrency.trim();
  const { credits, open, docs } = await adjustable(ctx, tx, partyId, side);
  // Without a list: oldest credit to the oldest document, notes before payments on the same day.
  const ordered = [...credits].sort((a, b) => a.date.localeCompare(b.date) || (a.sourceType === b.sourceType ? 0 : a.sourceType === 'note' ? -1 : 1));
  const plan: Allocation[] =
    wanted ??
    fifoAllocate(
      ordered.map((c) => ({ id: `${c.sourceType}:${c.id}`, date: c.date, left: c.left.minor })),
      open.map((o) => ({ id: o.documentId, date: o.date, outstanding: o.outstanding.minor })),
    ).map((m) => ({ sourceType: m.creditId.startsWith('note:') ? 'note' : 'payment', sourceId: m.creditId.split(':').slice(1).join(':'), documentId: m.documentId, amount: money(m.amount, base) }));

  const issues: Issue[] = [];
  const block = (field: string, message: string) => issues.push({ field, message, severity: 'blocking' });
  const leftOf = new Map(credits.map((c) => [`${c.sourceType}:${c.id}`, c.left.minor]));
  const owedOf = new Map(open.map((o) => [o.documentId, o.outstanding.minor]));
  plan.forEach((a, i) => {
    const field = `allocations[${i}]`;
    const key = `${a.sourceType}:${a.sourceId}`;
    if (!leftOf.has(key)) return block(`${field}.sourceId`, `No unadjusted ${a.sourceType === 'note' ? 'credit note' : 'advance'} ${a.sourceId} for this party`);
    if (!owedOf.has(a.documentId)) return block(`${field}.documentId`, `${a.documentId} is not an open document of this party`);
    if (a.amount.currency !== base) return block(`${field}.amount.currency`, `Adjustments are in ${base}`);
    if (!(a.amount.minor > 0)) return block(`${field}.amount.minor`, 'Must be more than zero');
    const left = leftOf.get(key)!;
    const owed = owedOf.get(a.documentId)!;
    if (a.amount.minor > left) block(`${field}.amount.minor`, `Only ${(left / 100).toFixed(2)} of it is left to adjust`);
    if (a.amount.minor > owed) block(`${field}.amount.minor`, `Only ${(owed / 100).toFixed(2)} is owed on it`);
    leftOf.set(key, left - a.amount.minor);
    owedOf.set(a.documentId, owed - a.amount.minor);
  });
  if (issues.length) throw unprocessable(issues);
  if (!plan.length) return [];

  // Payments: each rewritten once with its new allocations.
  const byPayment = new Map<string, Allocation[]>();
  for (const a of plan.filter((x) => x.sourceType === 'payment')) byPayment.set(a.sourceId, [...(byPayment.get(a.sourceId) ?? []), a]);
  for (const [paymentId, list] of byPayment) {
    const [row] = await tx.select().from(PAY).where(eq(PAY.id, paymentId)).for('update');
    const [wire] = await paymentsToWire(tx, [row], base);
    const allocations = (wire.allocations ?? []).map((x) => ({ ...x }));
    for (const a of list) {
      const existing = allocations.find((x) => x.documentId === a.documentId);
      if (existing) existing.amount = money(existing.amount.minor + a.amount.minor, row.currency.trim());
      else allocations.push({ documentId: a.documentId, amount: money(a.amount.minor, row.currency.trim()) });
    }
    await writePayment(tx, ctx.deps, ctx.company, ctx.user, requestInput({ ...wire, allocations }), { now: ctx.now, existing: row, notifyReceived: false });
  }

  // Notes: a credit application each, dated the later of the note and the document.
  const notes = plan.filter((x) => x.sourceType === 'note');
  if (notes.length) {
    const noteRows = await tx.select().from(D).where(inArray(D.id, [...new Set(notes.map((n) => n.sourceId))]));
    const targets = [...new Set(notes.map((n) => n.documentId))].sort();
    await tx.select({ id: D.id }).from(D).where(inArray(D.id, targets)).orderBy(D.id).for('update');
    for (const a of notes) {
      const note = noteRows.find((n) => n.id === a.sourceId)!;
      const doc = docs.find((d) => d.id === a.documentId)!;
      const date = note.date > doc.date ? note.date : doc.date;
      assertPeriodOpen(ctx.company, date);
      const [existing] = await tx.select().from(CA).where(and(eq(CA.noteId, note.id), eq(CA.documentId, doc.id)));
      if (existing) await tx.update(CA).set({ amountMinor: existing.amountMinor + a.amount.minor }).where(eq(CA.id, existing.id));
      else await tx.insert(CA).values({ id: newId('cap'), companyId: ctx.company.id, noteId: note.id, documentId: doc.id, amountMinor: a.amount.minor, date, createdBy: ctx.user.id, createdAt: ctx.now });
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: 'credit applied',
        entityType: 'document',
        entityId: note.id,
        entityLabel: note.number,
        version: note.version,
        after: { documentId: doc.id, documentNumber: doc.number, amountMinor: a.amount.minor },
      });
    }
    await syncPaymentState(tx, ctx.user, ctx.company.id, targets, ctx.now);
  }
  return plan;
}

const strip = <T extends { left: unknown }>(x: { credits: T[]; open: unknown[] }) => ({ credits: x.credits, open: x.open });

/** The credit notes applied to a document, or (on a note) the documents it is applied to. */
export async function creditApplicationsOf(db: DbOrTx, companyId: string, documentId: string, currency: string): Promise<Schema<'CreditApplication'>[]> {
  const N = alias(D, 'note');
  const rows = await db
    .select({ id: CA.id, noteId: CA.noteId, noteNumber: N.number, documentId: CA.documentId, documentNumber: D.number, amountMinor: CA.amountMinor, date: CA.date })
    .from(CA)
    .innerJoin(N, eq(N.id, CA.noteId))
    .innerJoin(D, eq(D.id, CA.documentId))
    .where(and(eq(CA.companyId, companyId), or(eq(CA.noteId, documentId), eq(CA.documentId, documentId))))
    .orderBy(CA.date, CA.id);
  return rows.map((r) => ({ id: r.id, noteId: r.noteId, noteNumber: r.noteNumber, documentId: r.documentId, documentNumber: r.documentNumber, amount: money(r.amountMinor, currency), date: r.date }));
}

/** Payments: listAdjustable, adjustAdvances, removeCreditApplication. */
export const adjustHandlers = defineHandlers({
  async listAdjustable(ctx) {
    const { side } = await partySide(ctx, ctx.db, ctx.query.partyId, ctx.query.side);
    return strip(await adjustable(ctx, ctx.db, ctx.query.partyId, side)) as Schema<'Adjustable'>;
  },

  async adjustAdvances(ctx) {
    const { side } = await partySide(ctx, ctx.db, ctx.body.partyId, ctx.body.side);
    const applied = await ctx.db.transaction((tx) => applyAdjustments(ctx, tx, ctx.body.partyId, side, ctx.body.allocations));
    return { ...(strip(await adjustable(ctx, ctx.db, ctx.body.partyId, side)) as Schema<'Adjustable'>), applied };
  },

  async removeCreditApplication(ctx) {
    await ctx.db.transaction(async (tx) => {
      const [app] = await tx.select().from(CA).where(and(eq(CA.companyId, ctx.company.id), eq(CA.id, ctx.params.applicationId))).for('update');
      if (!app) throw notFound('Credit application');
      // The credit is gone from the books on the date it was applied: that period must be open.
      assertPeriodOpen(ctx.company, app.date);
      const docs = await tx.select().from(D).where(inArray(D.id, [app.noteId, app.documentId].sort())).orderBy(D.id).for('update');
      const branches = ctx.user.branchIds;
      if (branches.length && docs.some((d) => !branches.includes(d.branchId))) throw notFound('Credit application');
      await tx.delete(CA).where(eq(CA.id, app.id));
      const note = docs.find((d) => d.id === app.noteId);
      const doc = docs.find((d) => d.id === app.documentId);
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: 'credit unapplied',
        entityType: 'document',
        entityId: app.noteId,
        entityLabel: note?.number ?? app.noteId,
        version: note?.version ?? 1,
        before: { documentId: app.documentId, documentNumber: doc?.number, amountMinor: app.amountMinor, date: app.date },
      });
      await syncPaymentState(tx, ctx.user, ctx.company.id, [app.documentId], ctx.now);
    });
    return undefined;
  },
});
