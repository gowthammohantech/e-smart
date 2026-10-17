import Anthropic from '@anthropic-ai/sdk';
import type { Schema } from '@esmart/api-contract';
import { canOpen, hasModule, MODULES, planInfo } from '@esmart/core/domain/plan';
import { defineHandlers, type Ctx } from '../../context';
import { badRequest, tooManyRequests, upstream } from '../../http/errors';
import { confirm, propose, type PendingAction } from '../../lixi/confirm';
import { jsonSchemaOf, runRead, TOOLS, ToolError, toolByName, type ToolCtx } from '../../lixi/tools';
import type { AssistantReply, ToolOutcome, ToolSpec } from '../../providers/assistant';

type LixiReply = Schema<'LixiReply'>;
type DocumentKind = Schema<'DocumentKind'>;

/** Screens Lixi may point at; anything else it suggests is dropped. */
export const LIXI_ROUTES = [
  '/(app)/sales/invoices',
  '/(app)/sales/invoices/new',
  '/(app)/sales/quotes',
  '/(app)/sales/quotes/new',
  '/(app)/purchases/bills/new',
  '/(app)/purchases/orders/new',
  '/(app)/payments/new',
  '/(app)/expenses/new',
  '/(app)/contacts/customers/new',
  '/(app)/contacts/suppliers/new',
  '/(app)/catalog/items/new',
  '/(app)/receivables',
  '/(app)/payables',
  '/(app)/inventory/low-stock',
  '/(app)/compliance',
  '/(app)/reports/sales-summary',
  '/(app)/reports/expense-summary',
  '/(app)/settings/plan',
] as const;

const DOC_KINDS = new Set<string>(['quote', 'salesOrder', 'delivery', 'invoice', 'salesReturn', 'purchaseOrder', 'goodsReceipt', 'purchaseBill', 'purchaseReturn']);
const LANGUAGES: Record<string, string> = { en: 'English', ta: 'Tamil' };

const SPECS: ToolSpec[] = TOOLS.map((t) => ({
  name: t.name,
  description: t.kind === 'write' ? `${t.description} Prepares a pending action for the user to confirm; writes nothing.` : t.description,
  inputSchema: jsonSchemaOf(t),
}));

function toolCtx(ctx: Ctx<'lixiChat' | 'lixiConfirmAction'>): ToolCtx {
  return { server: ctx.req.server, authorization: ctx.req.headers.authorization!, user: ctx.user, company: ctx.company, now: ctx.now };
}

// ------------------------------------------------------------ rate limit

const WINDOW_MS = 60_000;
const asked = new Map<string, number[]>();

/** Per user, on top of the global limiter: one question can mean several model calls. */
function limit(userId: string, now: number, max: number) {
  const recent = (asked.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) throw tooManyRequests('Lixi needs a moment; try again shortly');
  recent.push(now);
  asked.set(userId, recent);
}

// ------------------------------------------------------------ reply shaping

/** Keeps only actions the app can follow and the plan can open. */
export function toWire(reply: AssistantReply, plan: Parameters<typeof canOpen>[0]): LixiReply {
  const routes = new Set<string>(LIXI_ROUTES);
  const actions: LixiReply['actions'] = [];
  for (const a of reply.actions) {
    if (!a.label || !a.value) continue;
    if (a.type === 'route' && routes.has(a.value) && canOpen(plan, a.value)) actions.push({ type: 'route', label: a.label, route: a.value });
    else if (a.type === 'document' && DOC_KINDS.has(a.documentKind)) actions.push({ type: 'document', label: a.label, id: a.value, kind: a.documentKind as DocumentKind });
    else if (a.type === 'ask') actions.push({ type: 'ask', label: a.label, question: a.value });
  }
  return { text: reply.text, stats: reply.stats.slice(0, 4), actions: actions.slice(0, 3) };
}

function contextFor(ctx: Ctx<'lixiChat'>, locale: string): string {
  const { company, user } = ctx;
  const modules = MODULES.filter((m) => hasModule(company.plan, m));
  return [
    `Today is ${ctx.now.toISOString().slice(0, 10)}.`,
    `Company: ${company.name}. Currency: ${company.baseCurrency.trim()}. Country: ${company.country}.`,
    `Plan: ${planInfo(company.plan).name}; ${modules.length ? `includes ${modules.join(', ')}` : 'sales only (no purchases, inventory, expenses or payables)'}.`,
    `User: ${user.name}, role ${user.role}.`,
    `Reply in ${LANGUAGES[locale] ?? 'English'}.`,
  ].join('\n');
}

export const lixiHandlers = defineHandlers({
  async lixiChat(ctx) {
    const history = ctx.body.messages;
    if (history.at(-1)?.role !== 'user') throw badRequest('LAST_MESSAGE_NOT_USER', 'The conversation must end with a question');
    // The simulator is for development; in production without a model the
    // app answers from its local brain instead.
    if (ctx.deps.config.NODE_ENV === 'production' && ctx.deps.providers.assistant.name === 'simulator') {
      throw upstream('LIXI_UNAVAILABLE', 'Lixi is not configured on this server');
    }
    limit(ctx.user.id, ctx.now.getTime(), ctx.deps.config.LIXI_RATE_LIMIT_PER_MINUTE);

    const tctx = toolCtx(ctx);
    const secret = ctx.deps.config.JWT_SECRET;
    let pending: PendingAction | null = null;

    const execute = async (name: string, input: unknown): Promise<ToolOutcome> => {
      const tool = toolByName(name);
      if (!tool) return { ok: false, error: { status: 404, code: 'UNKNOWN_TOOL', detail: `No tool named ${name}` } };
      try {
        if (tool.kind === 'read') return { ok: true, value: await runRead(tool, input, tctx) };
        if (pending) return { ok: false, error: { status: 409, code: 'ONE_ACTION_AT_A_TIME', detail: 'An action is already waiting for the user' } };
        pending = await propose(tool, input, tctx, secret);
        // The token stays with the app; the model only learns what it prepared.
        return { ok: true, value: { status: 'awaiting_user_confirmation', summary: pending.summary, preview: pending.preview } };
      } catch (err) {
        if (err instanceof ToolError) return { ok: false, error: { status: err.status, code: err.problem.code, detail: err.problem.detail } };
        throw err;
      }
    };

    const locale = ctx.body.locale ?? ctx.user.locale ?? 'en';
    let reply: AssistantReply;
    try {
      reply = await ctx.deps.providers.assistant.reply({ history, context: contextFor(ctx, locale.slice(0, 2)), tools: SPECS, execute, routes: LIXI_ROUTES });
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        ctx.req.log.warn({ err }, 'lixi model call failed');
        throw upstream('LIXI_UNAVAILABLE', 'Lixi is unavailable right now');
      }
      throw err;
    }
    const done = pending as PendingAction | null;
    return { reply: toWire(reply, ctx.company.plan), ...(done ? { pendingAction: done } : {}) };
  },

  async lixiConfirmAction(ctx) {
    const done = await confirm(ctx.body.token, toolCtx(ctx), ctx.deps.config.JWT_SECRET);
    const { result } = done;
    const actions: LixiReply['actions'] =
      result.entity === 'document' && result.id && result.kind && DOC_KINDS.has(result.kind)
        ? [{ type: 'document', label: result.number && !result.number.endsWith('-DRAFT') ? result.number : 'Open draft', id: result.id, kind: result.kind as DocumentKind }]
        : [];
    return {
      reply: { text: `Done: ${done.summary}.`, stats: [], actions },
      result: result as Schema<'LixiConfirmResponse'>['result'],
    };
  },
});
