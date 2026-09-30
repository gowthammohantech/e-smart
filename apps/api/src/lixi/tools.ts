import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { fromMajor, precisionOf, toMajor, type Money } from '@esmart/core/lib/money';
import type { AuthUser, CompanyRow } from '../context';
import { injectAs } from '../lib/internal';

/**
 * What Lixi can do, as one catalog. The MCP server and the in-app chat both
 * read it. Every tool runs through the contract route it names, as the
 * signed-in caller, so company access, roles and plan gating are the same
 * checks the app gets: Lixi can never do more than its user could by hand.
 *
 * Read tools run straight away. Write tools never write when called: they
 * resolve the request, price it where that helps, and return a proposal the
 * user confirms (see `confirm.ts`).
 */

export type ToolCtx = {
  server: FastifyInstance;
  /** The caller's `Authorization` header, replayed on every inner request. */
  authorization: string;
  user: AuthUser;
  company: CompanyRow;
  now: Date;
};

export type InnerRequest = { method: 'GET' | 'POST'; url: string; payload?: unknown };

/** A route answered with an error. Its problem body goes back to the model. */
export class ToolError extends Error {
  constructor(
    readonly status: number,
    readonly problem: { code?: string; detail?: string; [k: string]: unknown },
  ) {
    super(problem.detail ?? problem.code ?? `HTTP ${status}`);
  }
}

export type Proposal = {
  /** One line the user reads before confirming. */
  summary: string;
  /** Figures to show next to it: totals, the party, the channel. */
  preview: Record<string, unknown>;
  /** Exactly what runs on confirmation. */
  request: InnerRequest;
};

/** What a confirmed write made, for the reply and a link to open it. */
export type WriteResult = { entity: string; id?: string; kind?: string; number?: string };

type Base<S extends z.ZodObject> = {
  name: string;
  title: string;
  description: string;
  input: S;
};

export type ReadTool<S extends z.ZodObject = z.ZodObject> = Base<S> & {
  kind: 'read';
  request: (input: z.infer<S>, ctx: ToolCtx) => InnerRequest;
};

export type WriteTool<S extends z.ZodObject = z.ZodObject> = Base<S> & {
  kind: 'write';
  propose: (input: z.infer<S>, ctx: ToolCtx) => Promise<Proposal>;
  result: (body: unknown, request: InnerRequest) => WriteResult;
};

export type LixiTool = ReadTool | WriteTool;

// ------------------------------------------------------------------ helpers

const c = (ctx: ToolCtx) => `/v1/companies/${encodeURIComponent(ctx.company.id)}`;

function qs(query: Record<string, unknown>): string {
  const pairs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)]);
  return pairs.length ? `?${new URLSearchParams(pairs).toString()}` : '';
}

/** Runs one inner request as the caller; throws `ToolError` on a non-2xx. */
export async function call(ctx: ToolCtx, req: InnerRequest, headers?: Record<string, string>): Promise<unknown> {
  const res = await injectAs(ctx.server, ctx.authorization, { ...req, headers });
  if (res.status >= 400) throw new ToolError(res.status, (res.body ?? {}) as ToolError['problem']);
  return res.body;
}

const LIST_CAP = 25;

/**
 * Keeps results small enough for the model: long lists are cut (and say
 * so), and empty values are dropped. Nothing is reworded or recomputed.
 */
export function trim(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) {
    const items = value.slice(0, LIST_CAP).map((v) => trim(v, depth + 1));
    return value.length > LIST_CAP ? [...items, { more: value.length - LIST_CAP }] : items;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
      // Audit and sync bookkeeping mean nothing to a reader.
      if (['companyId', 'createdBy', 'updatedAt', 'version', 'attachmentIds', 'imageUri'].includes(k)) continue;
      out[k] = trim(v, depth + 1);
    }
    return out;
  }
  return value;
}

const today = (ctx: ToolCtx) => ctx.now.toISOString().slice(0, 10);
const money = (ctx: ToolCtx, major: number) => fromMajor(major, ctx.company.baseCurrency.trim());
const fmt = (m: Money) => {
  const p = precisionOf(m.currency);
  return `${m.currency} ${toMajor(m).toLocaleString('en-IN', { minimumFractionDigits: p, maximumFractionDigits: p })}`;
};

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const id = z.string().min(1);
const limit = z.number().int().min(1).max(50).optional().describe('How many rows; default 20');

// ------------------------------------------------------------------ reads

const DOC_KINDS = ['quote', 'salesOrder', 'delivery', 'invoice', 'salesReturn', 'purchaseOrder', 'goodsReceipt', 'purchaseBill', 'purchaseReturn'] as const;
const DOC_STATUSES = ['draft', 'sent', 'accepted', 'issued', 'partiallyPaid', 'paid', 'overdue', 'cancelled'] as const;
const REPORTS = ['sales-summary', 'purchase-summary', 'expense-summary', 'receivables', 'payables', 'stock', 'tax-summary', 'payments', 'profit'] as const;

function read<S extends z.ZodObject>(tool: Omit<ReadTool<S>, 'kind'>): ReadTool {
  return { kind: 'read', ...tool } as unknown as ReadTool;
}

function write<S extends z.ZodObject>(tool: Omit<WriteTool<S>, 'kind'>): WriteTool {
  return { kind: 'write', ...tool } as unknown as WriteTool;
}

const READS: ReadTool[] = [
  read({
    name: 'get_dashboard',
    title: 'Business summary',
    description: 'Sales, purchases, expenses, receivable, overdue, payable, cash balance, low-stock count and recent documents for a period. Start here for "how is business" questions.',
    input: z.object({ range: z.enum(['today', 'week', 'month', 'quarter', 'year']).optional().describe('Default month') }),
    request: (i, ctx) => ({ method: 'GET', url: `${c(ctx)}/dashboard${qs(i)}` }),
  }),
  read({
    name: 'search',
    title: 'Search',
    description: 'Find customers, suppliers, items and documents by name, number, GSTIN or phone. Use it to turn a name the user says into an id.',
    input: z.object({ q: z.string().min(2), limit: z.number().int().min(1).max(20).optional() }),
    request: (i, ctx) => ({ method: 'GET', url: `${c(ctx)}/search${qs(i)}` }),
  }),
  read({
    name: 'list_documents',
    title: 'List documents',
    description: 'Invoices, quotes, orders, bills and returns, newest first. Filter by kind, status, party, dates, or only outstanding/overdue ones.',
    input: z.object({
      kind: z.array(z.enum(DOC_KINDS)).optional(),
      status: z.array(z.enum(DOC_STATUSES)).optional(),
      partyId: id.optional(),
      from: date.optional(),
      to: date.optional(),
      outstanding: z.boolean().optional(),
      overdue: z.boolean().optional(),
      q: z.string().optional().describe('Matches number, party or reference'),
      sort: z.enum(['date', '-date', 'total', '-total']).optional(),
      limit,
    }),
    request: (i, ctx) => ({ method: 'GET', url: `${c(ctx)}/documents${qs({ limit: 20, ...i })}` }),
  }),
  read({
    name: 'get_document',
    title: 'Open a document',
    description: 'One document in full: lines, totals, tax split, balance due and status.',
    input: z.object({ id }),
    request: (i, ctx) => ({ method: 'GET', url: `${c(ctx)}/documents/${encodeURIComponent(i.id)}` }),
  }),
  read({
    name: 'list_parties',
    title: 'List customers and suppliers',
    description: 'Customers or suppliers with their outstanding balance.',
    input: z.object({ kind: z.enum(['customer', 'supplier']).optional(), q: z.string().optional(), limit }),
    request: (i, ctx) => ({ method: 'GET', url: `${c(ctx)}/parties${qs({ limit: 20, status: 'active', ...i })}` }),
  }),
  read({
    name: 'get_party_statement',
    title: 'Party statement',
    description: "A customer's or supplier's running ledger of documents and payments, with opening and closing balance.",
    input: z.object({ id, from: date.optional(), to: date.optional() }),
    request: (i, ctx) => ({ method: 'GET', url: `${c(ctx)}/parties/${encodeURIComponent(i.id)}/statement${qs({ from: i.from, to: i.to })}` }),
  }),
  read({
    name: 'list_items',
    title: 'List items',
    description: 'Goods and services with sale and purchase price, unit, tax category and stock on hand. Needed before drafting a document.',
    input: z.object({ q: z.string().optional(), lowStock: z.boolean().optional(), limit }),
    request: (i, ctx) => ({ method: 'GET', url: `${c(ctx)}/items${qs({ limit: 20, status: 'active', ...i })}` }),
  }),
  read({
    name: 'list_tax_categories',
    title: 'Tax categories',
    description: 'The tax rates set up for this company (e.g. GST 5/12/18/28%), with ids for document lines.',
    input: z.object({}),
    request: (_i, ctx) => ({ method: 'GET', url: `${c(ctx)}/tax-categories` }),
  }),
  read({
    name: 'list_payment_accounts',
    title: 'Payment accounts',
    description: 'Cash and bank accounts, with ids for recording payments and expenses.',
    input: z.object({}),
    request: (_i, ctx) => ({ method: 'GET', url: `${c(ctx)}/payment-accounts` }),
  }),
  read({
    name: 'list_expense_categories',
    title: 'Expense categories',
    description: 'Expense categories, with ids for recording expenses. Needs a plan with expenses.',
    input: z.object({}),
    request: (_i, ctx) => ({ method: 'GET', url: `${c(ctx)}/expense-categories` }),
  }),
  read({
    name: 'get_receivables',
    title: 'Receivables',
    description: 'Who owes the business, with aging buckets (current, 1-30, 31-60, 61-90, 90+ days).',
    input: z.object({ partyId: id.optional(), asOf: date.optional() }),
    request: (i, ctx) => ({ method: 'GET', url: `${c(ctx)}/receivables${qs(i)}` }),
  }),
  read({
    name: 'get_payables',
    title: 'Payables',
    description: 'What the business owes suppliers, with aging buckets. Needs a plan with payables.',
    input: z.object({ partyId: id.optional(), asOf: date.optional() }),
    request: (i, ctx) => ({ method: 'GET', url: `${c(ctx)}/payables${qs(i)}` }),
  }),
  read({
    name: 'get_stock_levels',
    title: 'Stock levels',
    description: 'Stock on hand per item; lowStock=true for items at or under their reorder level. Needs a plan with inventory.',
    input: z.object({ lowStock: z.boolean().optional(), itemId: id.optional() }),
    request: (i, ctx) => ({ method: 'GET', url: `${c(ctx)}/stock/levels${qs(i)}` }),
  }),
  read({
    name: 'list_payments',
    title: 'List payments',
    description: 'Payments received from customers or paid to suppliers.',
    input: z.object({ direction: z.enum(['received', 'paid']).optional(), partyId: id.optional(), from: date.optional(), to: date.optional(), limit }),
    request: (i, ctx) => ({ method: 'GET', url: `${c(ctx)}/payments${qs({ limit: 20, ...i })}` }),
  }),
  read({
    name: 'list_expenses',
    title: 'List expenses',
    description: 'Business expenses by date. Needs a plan with expenses.',
    input: z.object({ from: date.optional(), to: date.optional(), q: z.string().optional(), limit }),
    request: (i, ctx) => ({ method: 'GET', url: `${c(ctx)}/expenses${qs({ limit: 20, ...i })}` }),
  }),
  read({
    name: 'get_report',
    title: 'Run a report',
    description: 'One of the standard reports for a date range. Purchase, expense, payables, stock and profit reports need the full plan.',
    input: z.object({ reportKey: z.enum(REPORTS), from: date, to: date, partyId: id.optional() }),
    request: ({ reportKey, ...q }, ctx) => ({ method: 'GET', url: `${c(ctx)}/reports/${reportKey}${qs(q)}` }),
  }),
  read({
    name: 'get_gstr1',
    title: 'GSTR-1',
    description: 'The GSTR-1 return for a month: B2B, B2C, credit notes, HSN summary and totals.',
    input: z.object({ period: z.string().regex(/^(0[1-9]|1[0-2])\d{4}$/, 'MMYYYY') }),
    request: (i, ctx) => ({ method: 'GET', url: `${c(ctx)}/gst/gstr1${qs(i)}` }),
  }),
  read({
    name: 'list_eway_bills',
    title: 'E-way bills',
    description: 'E-way bills, optionally only active, expired, or expiring within some hours.',
    input: z.object({ status: z.enum(['active', 'expired', 'cancelled']).optional(), expiringWithinHours: z.number().int().min(1).optional(), limit }),
    request: (i, ctx) => ({ method: 'GET', url: `${c(ctx)}/eway-bills${qs({ limit: 20, ...i })}` }),
  }),
];

// ------------------------------------------------------------------ writes

const SALES_KINDS = new Set(['quote', 'salesOrder', 'invoice']);
const DRAFT_KINDS = ['quote', 'salesOrder', 'invoice', 'purchaseOrder', 'purchaseBill'] as const;
const METHODS = ['cash', 'bank', 'upi', 'card', 'cheque', 'wallet', 'other'] as const;

type Item = { id: string; name: string; unit: string; hsnCode?: string; taxCategoryId: string; salePrice: { minor: number }; purchasePrice: { minor: number } };
type Named = { id: string; name: string };

const LABEL: Record<string, string> = {
  quote: 'quote',
  salesOrder: 'sales order',
  invoice: 'invoice',
  purchaseOrder: 'purchase order',
  purchaseBill: 'purchase bill',
};

const WRITES: WriteTool[] = [
  write({
    name: 'create_draft_document',
    title: 'Draft an invoice, quote, order or bill',
    description:
      'Prepares a DRAFT document for the user to confirm; it is never issued or sent. Give each line an itemId (price, unit and tax come from the item) or a name, unitPrice and taxCategoryId. Amounts are in major units of the company currency.',
    input: z.object({
      kind: z.enum(DRAFT_KINDS),
      partyId: id,
      date: date.optional().describe('Default today'),
      dueDate: date.optional(),
      lines: z
        .array(
          z.object({
            itemId: id.optional(),
            name: z.string().optional(),
            quantity: z.number().positive(),
            unitPrice: z.number().nonnegative().optional().describe('Overrides the item price'),
            unit: z.string().optional(),
            taxCategoryId: id.optional(),
            discountPercent: z.number().min(0).max(100).optional(),
          }),
        )
        .min(1)
        .max(50),
      notes: z.string().max(500).optional(),
    }),
    propose: async (i, ctx) => {
      const currency = ctx.company.baseCurrency.trim();
      const sale = SALES_KINDS.has(i.kind);
      const lines = await Promise.all(
        i.lines.map(async (l, n) => {
          const item = l.itemId ? ((await call(ctx, { method: 'GET', url: `${c(ctx)}/items/${encodeURIComponent(l.itemId)}` })) as Item) : null;
          const name = l.name ?? item?.name;
          const taxCategoryId = l.taxCategoryId ?? item?.taxCategoryId;
          const price = l.unitPrice !== undefined ? money(ctx, l.unitPrice) : item ? { minor: (sale ? item.salePrice : item.purchasePrice).minor, currency } : null;
          if (!name || !taxCategoryId || !price) {
            throw new ToolError(422, { code: 'LINE_INCOMPLETE', detail: `Line ${n + 1} needs an itemId, or a name, unitPrice and taxCategoryId` });
          }
          return {
            ...(item ? { itemId: item.id, hsnCode: item.hsnCode } : {}),
            name,
            quantity: l.quantity,
            unit: l.unit ?? item?.unit ?? 'NOS',
            unitPrice: price,
            taxCategoryId,
            ...(l.discountPercent ? { discountMode: 'percent', discountValue: l.discountPercent } : {}),
          };
        }),
      );
      const payload = {
        kind: i.kind,
        partyId: i.partyId,
        date: i.date ?? today(ctx),
        ...(i.dueDate ? { dueDate: i.dueDate } : {}),
        currency,
        lines,
        ...(i.notes ? { notes: i.notes } : {}),
        status: 'draft',
      };
      const [calc, party] = await Promise.all([
        call(ctx, { method: 'POST', url: `${c(ctx)}/documents/calculate`, payload }) as Promise<{ grandTotal: Money; totalTax: Money }>,
        call(ctx, { method: 'GET', url: `${c(ctx)}/parties/${encodeURIComponent(i.partyId)}` }) as Promise<Named>,
      ]);
      return {
        summary: `Draft ${LABEL[i.kind]} for ${party.name}: ${lines.length} line${lines.length === 1 ? '' : 's'}, ${fmt(calc.grandTotal)}`,
        preview: {
          party: party.name,
          date: payload.date,
          lines: lines.map((l) => ({ name: l.name, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice })),
          totalTax: calc.totalTax,
          grandTotal: calc.grandTotal,
        },
        request: { method: 'POST', url: `${c(ctx)}/documents`, payload },
      };
    },
    result: (body) => {
      const d = body as { id: string; kind: string; number?: string };
      return { entity: 'document', id: d.id, kind: d.kind, number: d.number };
    },
  }),
  write({
    name: 'record_payment',
    title: 'Record a payment',
    description:
      'Prepares a payment received from a customer (or paid to a supplier) for the user to confirm. Optionally allocate it to documents. Amounts are in major units. accountId comes from list_payment_accounts.',
    input: z.object({
      direction: z.enum(['received', 'paid']),
      partyId: id,
      amount: z.number().positive(),
      method: z.enum(METHODS),
      accountId: id,
      date: date.optional().describe('Default today'),
      reference: z.string().max(100).optional(),
      allocations: z.array(z.object({ documentId: id, amount: z.number().positive() })).max(20).optional(),
    }),
    propose: async (i, ctx) => {
      const amount = money(ctx, i.amount);
      const payload = {
        direction: i.direction,
        partyId: i.partyId,
        date: i.date ?? today(ctx),
        amount,
        currency: amount.currency,
        method: i.method,
        accountId: i.accountId,
        ...(i.reference ? { reference: i.reference } : {}),
        ...(i.allocations?.length ? { allocations: i.allocations.map((a) => ({ documentId: a.documentId, amount: money(ctx, a.amount) })) } : {}),
      };
      const party = (await call(ctx, { method: 'GET', url: `${c(ctx)}/parties/${encodeURIComponent(i.partyId)}` })) as Named;
      return {
        summary: `${i.direction === 'received' ? 'Record payment from' : 'Record payment to'} ${party.name}: ${fmt(amount)} by ${i.method}`,
        preview: { party: party.name, date: payload.date, amount, method: i.method, allocations: payload.allocations ?? [] },
        request: { method: 'POST', url: `${c(ctx)}/payments`, payload },
      };
    },
    result: (body) => ({ entity: 'payment', id: (body as { id: string }).id }),
  }),
  write({
    name: 'create_party',
    title: 'Add a customer or supplier',
    description: 'Prepares a new customer or supplier for the user to confirm. City, state and postal code are needed for GST place of supply.',
    input: z.object({
      kind: z.enum(['customer', 'supplier']),
      name: z.string().min(1).max(200),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      gstin: z.string().optional(),
      line1: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(1),
      postalCode: z.string().min(1),
      paymentTermsDays: z.number().int().min(0).max(365).optional(),
    }),
    propose: async (i, ctx) => {
      const currency = ctx.company.baseCurrency.trim();
      const payload = {
        kind: i.kind,
        name: i.name,
        currency,
        ...(i.phone ? { phone: i.phone } : {}),
        ...(i.email ? { email: i.email } : {}),
        ...(i.gstin ? { taxId: i.gstin.toUpperCase() } : {}),
        billingAddress: { line1: i.line1, city: i.city, state: i.state, postalCode: i.postalCode, country: ctx.company.country },
        openingBalance: { minor: 0, currency },
        paymentTermsDays: i.paymentTermsDays ?? 30,
      };
      return {
        summary: `Add ${i.kind} ${i.name} (${i.city})`,
        preview: { kind: i.kind, name: i.name, phone: i.phone, email: i.email, gstin: payload.taxId, address: payload.billingAddress },
        request: { method: 'POST', url: `${c(ctx)}/parties`, payload },
      };
    },
    result: (body) => ({ entity: 'party', id: (body as { id: string }).id, kind: (body as { kind: string }).kind }),
  }),
  write({
    name: 'create_expense',
    title: 'Record an expense',
    description:
      'Prepares an expense for the user to confirm. Needs a plan with expenses. categoryId from list_expense_categories; accountId from list_payment_accounts. Amount in major units.',
    input: z.object({
      categoryId: id,
      amount: z.number().positive(),
      method: z.enum(METHODS),
      accountId: id,
      date: date.optional().describe('Default today'),
      supplierId: id.optional(),
      notes: z.string().max(500).optional(),
    }),
    propose: async (i, ctx) => {
      const amount = money(ctx, i.amount);
      const payload = {
        categoryId: i.categoryId,
        date: i.date ?? today(ctx),
        amount,
        currency: amount.currency,
        method: i.method,
        accountId: i.accountId,
        ...(i.supplierId ? { supplierId: i.supplierId } : {}),
        ...(i.notes ? { notes: i.notes } : {}),
      };
      return {
        summary: `Record expense of ${fmt(amount)} by ${i.method}`,
        preview: { date: payload.date, amount, method: i.method, notes: i.notes },
        request: { method: 'POST', url: `${c(ctx)}/expenses`, payload },
      };
    },
    result: (body) => ({ entity: 'expense', id: (body as { id: string }).id }),
  }),
  write({
    name: 'send_document',
    title: 'Send a document',
    description: 'Prepares sending an issued document to its party by email, WhatsApp or SMS, for the user to confirm.',
    input: z.object({
      id,
      channel: z.enum(['email', 'whatsapp', 'sms']),
      message: z.string().max(1000).optional(),
      includePaymentLink: z.boolean().optional(),
    }),
    propose: async ({ id: docId, ...i }, ctx) => {
      const doc = (await call(ctx, { method: 'GET', url: `${c(ctx)}/documents/${encodeURIComponent(docId)}` })) as { id: string; kind: string; number: string; partyName?: string };
      return {
        summary: `Send ${doc.number} by ${i.channel}`,
        preview: { document: doc.number, kind: doc.kind, channel: i.channel, message: i.message },
        request: { method: 'POST', url: `${c(ctx)}/documents/${encodeURIComponent(docId)}/send`, payload: { channel: i.channel, ...(i.message ? { message: i.message } : {}), ...(i.includePaymentLink !== undefined ? { includePaymentLink: i.includePaymentLink } : {}) } },
      };
    },
    result: (_body, req) => ({ entity: 'message', id: req.url.split('/').at(-2) }),
  }),
  write({
    name: 'send_payment_reminder',
    title: 'Send a payment reminder',
    description: 'Prepares a reminder to a customer about what they owe, for the user to confirm.',
    input: z.object({
      partyId: id,
      channel: z.enum(['whatsapp', 'sms', 'email']),
      documentIds: z.array(id).max(20).optional(),
      message: z.string().max(1000).optional(),
    }),
    propose: async (i, ctx) => {
      const party = (await call(ctx, { method: 'GET', url: `${c(ctx)}/parties/${encodeURIComponent(i.partyId)}` })) as Named & { outstanding?: Money };
      return {
        summary: `Remind ${party.name} by ${i.channel}${party.outstanding ? ` about ${fmt(party.outstanding)}` : ''}`,
        preview: { party: party.name, channel: i.channel, outstanding: party.outstanding, message: i.message },
        request: { method: 'POST', url: `${c(ctx)}/receivables/reminders`, payload: i },
      };
    },
    result: (_body, req) => ({ entity: 'reminder', id: (req.payload as { partyId: string }).partyId }),
  }),
];

export const TOOLS: LixiTool[] = [...READS, ...WRITES];
const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function toolByName(name: string): LixiTool | undefined {
  return BY_NAME.get(name);
}

/** Validates input against the tool's schema; a bad call is the model's to fix. */
export function parseInput(tool: LixiTool, input: unknown): Record<string, unknown> {
  const parsed = tool.input.safeParse(input ?? {});
  if (!parsed.success) {
    throw new ToolError(400, { code: 'INVALID_TOOL_INPUT', detail: z.prettifyError(parsed.error) });
  }
  return parsed.data as Record<string, unknown>;
}

/** Runs a read tool and trims what it returns. */
export async function runRead(tool: ReadTool, input: unknown, ctx: ToolCtx): Promise<unknown> {
  return trim(await call(ctx, tool.request(parseInput(tool, input), ctx)));
}

/** A tool's input as JSON Schema, for the Claude API. */
export function jsonSchemaOf(tool: LixiTool): Record<string, unknown> {
  const { $schema: _drop, ...schema } = z.toJSONSchema(tool.input, { io: 'input' }) as Record<string, unknown>;
  return schema;
}
