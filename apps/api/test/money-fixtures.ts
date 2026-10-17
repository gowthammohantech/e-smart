import { and, eq, sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { schema } from '@esmart/db';
import { signRazorpayWebhook } from '../src/providers/payments';
import { BENGALURU, MUMBAI, ownerWithCompany, type TestContext } from './helpers';

/**
 * Fixtures for the money engine's tests (documents, payments, ledger,
 * billing, webhooks): a Mumbai company with customers in Mumbai and
 * Bengaluru, a supplier, and a stock-tracked item.
 */
export async function moneySetup(t: TestContext, plan: 'free' | 'basic' | 'pro' = 'pro') {
  const o = await ownerWithCompany(t, { plan });
  const db = t.deps.db;
  const companyId = o.company.id!;
  const taxes = await db.select().from(schema.taxCategories).where(eq(schema.taxCategories.companyId, companyId));
  const gst = (rate: number) => taxes.find((x) => Number(x.rate) === rate)!.id;

  const party = async (body: Record<string, unknown>) => {
    const res = await t.post(
      `${o.c}/parties`,
      { kind: 'customer', currency: 'INR', openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 30, ...body },
      { token: o.token },
    );
    if (res.status !== 201) throw new Error(`party: ${res.status} ${res.raw}`);
    return res.body as { id: string; name: string };
  };
  const mumbai = await party({ name: 'Sunrise Retail', billingAddress: MUMBAI, phone: '+919800000001', email: 'accounts@sunrise.example' });
  const bengaluru = await party({ name: 'Anand Enterprises', taxId: '29AABCG4321K1ZM', billingAddress: BENGALURU, phone: '+919800000002' });
  const supplier = plan === 'pro' ? await party({ kind: 'supplier', name: 'Konkan Steel', billingAddress: MUMBAI }) : null;

  const [branch] = await db.select().from(schema.branches).where(eq(schema.branches.companyId, companyId));
  const [cash] = await db.select().from(schema.paymentAccounts).where(eq(schema.paymentAccounts.companyId, companyId));
  const item = async (over: Partial<typeof schema.items.$inferInsert> = {}) => {
    const id = `itm_${Math.random().toString(36).slice(2, 12)}`;
    await db.insert(schema.items).values({
      id,
      companyId,
      sku: id,
      name: 'Steel rod',
      type: 'goods',
      unit: 'NOS',
      currency: 'INR',
      salePriceMinor: 100000,
      purchasePriceMinor: 60000,
      taxCategoryId: gst(18),
      trackInventory: true,
      ...over,
    });
    return id;
  };

  /** For tests about something other than stock levels: sales may then take an item below zero. */
  const allowNegativeStock = () => db.update(schema.companies).set({ allowNegativeStock: true }).where(eq(schema.companies.id, companyId));

  return { ...o, companyId, gst, mumbai, bengaluru, supplier, branch, cash, item, allowNegativeStock };
}

export type Money = Awaited<ReturnType<typeof moneySetup>>;

export const line = (taxCategoryId: string, over: Record<string, unknown> = {}) => ({
  name: 'Steel rod',
  quantity: 2,
  unit: 'NOS',
  unitPrice: { minor: 100000, currency: 'INR' },
  taxCategoryId,
  ...over,
});

export const invoiceBody = (m: Money, over: Record<string, unknown> = {}) => ({
  kind: 'invoice',
  partyId: m.mumbai.id,
  date: '2026-09-29',
  currency: 'INR',
  lines: [line(m.gst(18))],
  ...over,
});

/** A finalised invoice, created in one step. */
export async function issueInvoice(t: TestContext, m: Money, over: Record<string, unknown> = {}) {
  const res = await t.post(`${m.c}/documents`, invoiceBody(m, { status: 'issued', ...over }), { token: m.token });
  if (res.status !== 201) throw new Error(`invoice: ${res.status} ${res.raw}`);
  return res.body as { id: string; number: string; version: number; totals: { grandTotal: { minor: number } } };
}

/** Stock on hand for an item: the ledger's SUM(quantity). */
export async function onHand(t: TestContext, itemId: string): Promise<number> {
  const [r] = await t.deps.db
    .select({ q: sql<string>`coalesce(sum(${schema.stockMovements.quantity}), 0)` })
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.itemId, itemId));
  return Number(r.q);
}

/**
 * The invariants the rest of the server relies on: a document's
 * amount_paid_minor is the sum of its allocations, and a payment's
 * unallocated_minor is its amount less its allocations.
 */
export async function expectMoneyInvariants(t: TestContext, companyId: string) {
  const db = t.deps.db;
  const docs = await db.execute<{ id: string; paid: string; sum: string }>(sql`
    select d.id, d.amount_paid_minor as paid, coalesce((select sum(a.amount_minor) from payment_allocations a where a.document_id = d.id), 0) as sum
    from documents d where d.company_id = ${companyId}`);
  for (const d of docs.rows) expect(Number(d.paid), `amount_paid_minor of ${d.id}`).toBe(Number(d.sum));
  const pays = await db.execute<{ id: string; amount: string; unallocated: string; sum: string }>(sql`
    select p.id, p.amount_minor as amount, p.unallocated_minor as unallocated, coalesce((select sum(a.amount_minor) from payment_allocations a where a.payment_id = p.id), 0) as sum
    from payments p where p.company_id = ${companyId}`);
  for (const p of pays.rows) expect(Number(p.unallocated), `unallocated_minor of ${p.id}`).toBe(Number(p.amount) - Number(p.sum));
}

export async function documentRow(t: TestContext, id: string) {
  const [row] = await t.deps.db.select().from(schema.documents).where(and(eq(schema.documents.id, id)));
  return row;
}

/** The text of a stub-rendered PDF, with its 90-character line breaks joined back up. */
export const pdfText = (raw: string) => raw.replace(/\) ' \(/g, '');

/**
 * Posts an event exactly as Razorpay would: raw JSON, signed with the webhook
 * secret.
 */
export function razorpay(tc: TestContext, event: object, opts: { eventId?: string; signature?: string } = {}) {
  const raw = JSON.stringify(event);
  return tc.call('POST', '/webhooks/razorpay', {
    body: raw,
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': opts.signature ?? signRazorpayWebhook(raw, tc.deps.config.RAZORPAY_WEBHOOK_SECRET),
      ...(opts.eventId ? { 'x-razorpay-event-id': opts.eventId } : {}),
    },
  });
}
