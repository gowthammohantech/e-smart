import { and, eq, getTableColumns, inArray, notInArray } from 'drizzle-orm';
import { buildOutstanding, summarizeAging } from '@esmart/core/domain/receivables';
import type { BusinessDocument, Payment } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { defineHandlers, type Ctx } from '../../context';
import { invalid } from '../../http/errors';
import { newId } from '../../lib/ids';
import { money } from '../../lib/wire';
import { effectiveStatus, today } from '../documents/lifecycle';
import { paymentLinkFor } from '../documents/outbound';
import { summariesToWire, type SummaryRow } from '../documents/wire';

const D = schema.documents;
const P = schema.parties;
type AgingCtx = Pick<Ctx<'getReceivables'>, 'company' | 'user' | 'db' | 'now'>;
type Aging = Schema<'AgingReport'>;

/**
 * Open invoices (or purchase bills) with aging, from `@esmart/core`
 * receivables: `buildOutstanding` per document and `summarizeAging` for the
 * buckets, in base currency. What each document has been paid is its
 * `amount_paid_minor`, which the Payments module keeps equal to the sum of
 * its allocations; it is handed to the engine as one allocation per document.
 */
async function agingReport(ctx: AgingCtx, kind: 'invoice' | 'purchaseBill', q: { asOf?: string; partyId?: string; branchId?: string }): Promise<Aging> {
  const asOf = q.asOf ?? today(ctx.now);
  const baseCurrency = ctx.company.baseCurrency.trim();
  const filters = [eq(D.companyId, ctx.company.id), eq(D.kind, kind), notInArray(D.status, ['draft', 'cancelled', 'rejected'])];
  if (q.partyId) filters.push(eq(D.partyId, q.partyId));
  if (q.branchId) filters.push(eq(D.branchId, q.branchId));
  if (ctx.user.branchIds.length) filters.push(inArray(D.branchId, ctx.user.branchIds));
  const rows = (await ctx.db
    .select({ ...getTableColumns(D), partyName: P.name })
    .from(D)
    .innerJoin(P, eq(P.id, D.partyId))
    .where(and(...filters))
    .orderBy(D.dueDate, D.date, D.id)) as SummaryRow[];

  const docs = rows.map(
    (r) =>
      ({
        id: r.id,
        kind: r.kind,
        number: r.number,
        status: effectiveStatus(r, asOf),
        partyId: r.partyId,
        date: r.date,
        dueDate: r.dueDate ?? undefined,
        currency: r.currency.trim(),
        exchangeRate: Number(r.exchangeRate),
        totals: { grandTotal: money(r.grandTotalMinor, r.currency.trim()) },
      }) as BusinessDocument,
  );
  const settled = { allocations: rows.map((r) => ({ documentId: r.id, documentNumber: r.number, amount: money(r.amountPaidMinor, r.currency.trim()) })) } as Payment;
  const open = buildOutstanding(docs, [settled], asOf);
  const summary = summarizeAging(open, baseCurrency);

  const toBase = (o: (typeof open)[number]) => Math.round(o.outstanding.minor * (o.document.exchangeRate || 1));
  const parties = new Map<string, { partyId: string; partyName: string; outstanding: number; oldestDaysOverdue: number }>();
  const nameOf = new Map(rows.map((r) => [r.id, r.partyName]));
  for (const o of open) {
    const p = parties.get(o.document.partyId) ?? { partyId: o.document.partyId, partyName: nameOf.get(o.document.id) ?? '', outstanding: 0, oldestDaysOverdue: 0 };
    p.outstanding += toBase(o);
    p.oldestDaysOverdue = Math.max(p.oldestDaysOverdue, o.daysOverdue);
    parties.set(p.partyId, p);
  }

  const summaries = new Map((await summariesToWire(ctx.db, rows.filter((r) => open.some((o) => o.document.id === r.id)), ctx.now)).map((s) => [s.id, s]));
  return {
    asOf,
    total: summary.total,
    buckets: summary.buckets.map((b) => ({ key: b.key, amount: b.amount, count: b.count })),
    byParty: [...parties.values()]
      .sort((a, b) => b.outstanding - a.outstanding || a.partyName.localeCompare(b.partyName))
      .map((p) => ({ ...p, outstanding: money(p.outstanding, baseCurrency) })),
    documents: [...open]
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .map((o) => ({ document: summaries.get(o.document.id)!, allocated: o.allocated, outstanding: o.outstanding, daysOverdue: o.daysOverdue, bucket: o.bucket })),
  };
}

const fmt = (minor: number, currency: string) => `${currency} ${(minor / 100).toFixed(2)}`;

/** Ledger: getReceivables, getPayables, sendPaymentReminder. */
export const ledgerHandlers = defineHandlers({
  async getReceivables(ctx) {
    return agingReport(ctx, 'invoice', ctx.query);
  },

  async getPayables(ctx) {
    return agingReport(ctx, 'purchaseBill', ctx.query);
  },

  async sendPaymentReminder(ctx) {
    const body = ctx.body;
    const asOf = today(ctx.now);
    const [party] = await ctx.db.select().from(P).where(and(eq(P.companyId, ctx.company.id), eq(P.id, body.partyId)));
    if (!party) throw invalid('partyId', 'No such party in this company');
    const recipient = body.channel === 'email' ? party.email : party.phone;
    if (!recipient) throw invalid('partyId', `${party.name} has no ${body.channel === 'email' ? 'email address' : 'phone number'}`);

    const filters = [eq(D.companyId, ctx.company.id), eq(D.partyId, party.id), eq(D.kind, 'invoice'), notInArray(D.status, ['draft', 'cancelled'])];
    if (body.documentIds?.length) filters.push(inArray(D.id, body.documentIds));
    const docs = (await ctx.db.select().from(D).where(and(...filters)).orderBy(D.dueDate, D.date)).filter((d) => d.grandTotalMinor > d.amountPaidMinor);
    const missing = (body.documentIds ?? []).filter((id) => !docs.some((d) => d.id === id));
    if (missing.length) throw invalid('documentIds', `Not open invoices of ${party.name}: ${missing.join(', ')}`);
    if (!docs.length) throw invalid('partyId', `${party.name} has nothing outstanding`, 'NOTHING_OUTSTANDING');

    await ctx.db.transaction(async (tx) => {
      const lines: string[] = [];
      let total = 0;
      for (const d of docs) {
        const owed = d.grandTotalMinor - d.amountPaidMinor;
        total += owed;
        const pay = (body.includePaymentLink ?? true) ? await paymentLinkFor(tx, ctx.deps, ctx.company, ctx.user, d, ctx.now) : null;
        const due = d.dueDate ? `, due ${d.dueDate}${effectiveStatus(d, asOf) === 'overdue' ? ' (overdue)' : ''}` : '';
        lines.push(`${d.number}: ${fmt(owed, d.currency.trim())}${due}${pay ? ` Pay: ${pay.url}` : ''}`);
      }
      const currency = docs[0].currency.trim();
      const text = [
        body.message ?? `Dear ${party.name}, a reminder from ${ctx.company.name}: ${fmt(total, currency)} is outstanding on ${docs.length} invoice${docs.length === 1 ? '' : 's'}.`,
        ...lines,
      ].join('\n');

      let status: 'sent' | 'failed' = 'sent';
      let providerMessageId: string | null = null;
      let error: string | null = null;
      try {
        const sent =
          body.channel === 'email'
            ? await ctx.deps.providers.email.send({ to: recipient, subject: `Payment reminder from ${ctx.company.name}`, text })
            : body.channel === 'whatsapp'
              ? await ctx.deps.providers.whatsapp.send({ to: recipient, text })
              : await ctx.deps.providers.sms.send(recipient, text);
        providerMessageId = sent.providerMessageId;
      } catch (err) {
        status = 'failed';
        error = (err as Error).message;
      }
      const deliveryId = newId('msg');
      await tx.insert(schema.messageDeliveries).values({
        id: deliveryId,
        companyId: ctx.company.id,
        channel: body.channel,
        purpose: 'paymentReminder',
        recipient: recipient.slice(0, 254),
        partyId: party.id,
        documentId: docs.length === 1 ? docs[0].id : null,
        message: text,
        includePaymentLink: body.includePaymentLink ?? true,
        provider: body.channel,
        providerMessageId,
        status,
        error,
        sentBy: ctx.user.id,
        createdAt: ctx.now,
      });
      await tx.insert(schema.reminderDocuments).values(docs.map((d) => ({ deliveryId, documentId: d.id })));
    });
    return undefined;
  },
});
