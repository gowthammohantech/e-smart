import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config';

/**
 * The model behind Lixi. The provider only talks to the model; which tools
 * exist and what they do is the caller's (`src/lixi`), passed in as
 * `ToolSpec`s and one `execute` callback.
 */

export type ChatTurn = { role: 'user' | 'assistant'; text: string };

export type ToolSpec = { name: string; description: string; inputSchema: Record<string, unknown> };

/** What running a tool gave back. `pending` means a write is waiting for the user. */
export type ToolOutcome = { ok: true; value: unknown } | { ok: false; error: { status: number; code?: string; detail?: string } };

export type AssistantAction = { type: 'route' | 'ask' | 'document'; label: string; value: string; documentKind: string };
export type AssistantStat = { label: string; value: string };
export type AssistantReply = { text: string; stats: AssistantStat[]; actions: AssistantAction[] };

export type AssistantRequest = {
  history: ChatTurn[];
  /** Per-request facts: company, plan, today, language. Kept out of the cached prompt. */
  context: string;
  tools: ToolSpec[];
  execute: (name: string, input: unknown) => Promise<ToolOutcome>;
  /** App routes an action may open. */
  routes: readonly string[];
};

export interface AssistantProvider {
  readonly name: string;
  reply(req: AssistantRequest): Promise<AssistantReply>;
}

const SYSTEM = `You are Lixi, the assistant inside Elixir Books, an invoicing and accounting app for small businesses.

How you work:
- Every figure you state comes from a tool result in this conversation. Never estimate, invent or recall numbers. If the tools cannot answer, say so plainly.
- Money in tool results is {minor, currency} in integer minor units: 123450 INR is ₹1,234.50. Write amounts the way the company's currency is written.
- Look things up before answering; use search to turn a name into an id. Prefer one well-chosen call over many.
- A 403 PLAN_UPGRADE_REQUIRED means that module is not in the company's plan: say so briefly and offer the plan page. A 403 ROLE_FORBIDDEN means the user's role cannot do that.
- Write tools (drafting documents, recording payments or expenses, adding parties, sending documents or reminders) never write. They prepare one pending action that the user confirms in the app. After one succeeds, say in a sentence what is ready for them to confirm. Prepare at most one action per reply.
- Reply in the user's language (English or Tamil), in two or three short sentences. No markdown.

Your reply is JSON:
- text: what you say.
- stats: up to four key figures as {label, value}, value already formatted. Empty when none.
- actions: up to three follow-ups. type "route" opens an app screen (value is one of the allowed routes); "document" opens a document (value is its id, documentKind its kind); "ask" suggests a next question (value is the question). documentKind is "" unless type is "document".`;

const REPLY_SCHEMA = (routes: readonly string[]) => ({
  type: 'object',
  additionalProperties: false,
  required: ['text', 'stats', 'actions'],
  properties: {
    text: { type: 'string' },
    stats: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['label', 'value'], properties: { label: { type: 'string' }, value: { type: 'string' } } },
    },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'label', 'value', 'documentKind'],
        properties: {
          type: { type: 'string', enum: ['route', 'ask', 'document'] },
          label: { type: 'string' },
          value: { type: 'string', description: `For route, one of: ${routes.join(', ')}` },
          documentKind: { type: 'string' },
        },
      },
    },
  },
});

const FALLBACK: AssistantReply = { text: "I couldn't work that out just now. Please try asking another way.", stats: [], actions: [] };

function parseReply(text: string): AssistantReply {
  try {
    const r = JSON.parse(text) as Partial<AssistantReply>;
    if (typeof r.text !== 'string') return FALLBACK;
    return { text: r.text, stats: Array.isArray(r.stats) ? r.stats : [], actions: Array.isArray(r.actions) ? r.actions : [] };
  } catch {
    return text.trim() ? { text: text.trim(), stats: [], actions: [] } : FALLBACK;
  }
}

/** Claude, with the tools as client tools in a manual loop. */
export class AnthropicAssistant implements AssistantProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(
    private readonly config: Pick<Config, 'ANTHROPIC_API_KEY' | 'LIXI_MODEL' | 'LIXI_EFFORT' | 'LIXI_MAX_TOOL_ROUNDS'>,
    /** Tests swap the transport. */
    fetch?: typeof globalThis.fetch,
  ) {
    this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2, ...(fetch ? { fetch } : {}) });
  }

  async reply(req: AssistantRequest): Promise<AssistantReply> {
    const tools: Anthropic.Beta.BetaTool[] = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
    }));
    const messages: Anthropic.Beta.BetaMessageParam[] = req.history.map((turn) => ({ role: turn.role, content: turn.text }));

    for (let round = 0; round <= this.config.LIXI_MAX_TOOL_ROUNDS; round++) {
      const last = round === this.config.LIXI_MAX_TOOL_ROUNDS;
      const response = await this.client.beta.messages.create({
        model: this.config.LIXI_MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: this.config.LIXI_EFFORT, format: { type: 'json_schema', schema: REPLY_SCHEMA(req.routes) } },
        // Stable prompt first and cached (tools render before it); per-request facts after.
        system: [
          { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: req.context },
        ],
        tools,
        // On the last round, answer with what is known rather than call more tools.
        tool_choice: last ? { type: 'none' } : { type: 'auto' },
        messages,
      });

      if (response.stop_reason === 'refusal') return { text: "I can't help with that one.", stats: [], actions: [] };
      if (response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content });
        continue;
      }
      if (response.stop_reason !== 'tool_use') {
        if (response.stop_reason === 'max_tokens') return FALLBACK;
        const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
        return parseReply(text);
      }

      const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      messages.push({ role: 'assistant', content: response.content });
      // Every result goes back in one user message.
      const results = await Promise.all(
        calls.map(async (call): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          const outcome = await req.execute(call.name, call.input);
          return {
            type: 'tool_result',
            tool_use_id: call.id,
            content: JSON.stringify(outcome.ok ? outcome.value : outcome.error),
            ...(outcome.ok ? {} : { is_error: true }),
          };
        }),
      );
      messages.push({ role: 'user', content: results });
    }
    return FALLBACK;
  }
}

/**
 * A stand-in with no network, for development and tests. It picks one tool
 * from a few keywords, runs it through the real `execute`, and reports what
 * came back without phrasing it. Enough to exercise the plumbing, gating and
 * confirmation end to end.
 */
export class SimulatorAssistant implements AssistantProvider {
  readonly name = 'simulator';

  async reply(req: AssistantRequest): Promise<AssistantReply> {
    const question = [...req.history].reverse().find((t) => t.role === 'user')?.text.toLowerCase() ?? '';

    const draft = /(?:invoice|quote) for (.+)$/.exec(question);
    if (draft) return this.draft(req, question.includes('quote') ? 'quote' : 'invoice', draft[1].trim());

    const [tool, input]: [string, Record<string, unknown>] = /stock/.test(question)
      ? ['get_stock_levels', { lowStock: true }]
      : /owe|receivable|outstanding/.test(question)
        ? ['get_receivables', {}]
        : /payable/.test(question)
          ? ['get_payables', {}]
          : ['get_dashboard', {}];

    const outcome = await req.execute(tool, input);
    if (!outcome.ok) return this.failed(outcome.error);
    return { text: `From ${tool}: ${JSON.stringify(outcome.value).slice(0, 400)}`, stats: [], actions: [] };
  }

  private async draft(req: AssistantRequest, kind: string, name: string): Promise<AssistantReply> {
    const found = await req.execute('search', { q: name });
    if (!found.ok) return this.failed(found.error);
    const party = (found.value as { parties?: { id: string; name: string }[] }).parties?.[0];
    if (!party) return { text: `I couldn't find ${name}.`, stats: [], actions: [] };
    const items = await req.execute('list_items', { limit: 1 });
    const item = items.ok ? (items.value as { data?: { id: string }[] }).data?.[0] : undefined;
    if (!item) return { text: 'Add an item first, then I can draft it.', stats: [], actions: [{ type: 'route', label: 'New item', value: '/(app)/catalog/items/new', documentKind: '' }] };
    const pending = await req.execute('create_draft_document', { kind, partyId: party.id, lines: [{ itemId: item.id, quantity: 1 }] });
    if (!pending.ok) return this.failed(pending.error);
    return { text: `I've prepared a draft ${kind} for ${party.name}. Confirm to save it.`, stats: [], actions: [] };
  }

  private failed(error: { status: number; code?: string; detail?: string }): AssistantReply {
    if (error.code === 'PLAN_UPGRADE_REQUIRED') {
      return { text: "That isn't part of your plan.", stats: [], actions: [{ type: 'route', label: 'See plans', value: '/(app)/settings/plan', documentKind: '' }] };
    }
    return { text: `That didn't work: ${error.detail ?? error.code ?? error.status}`, stats: [], actions: [] };
  }
}

export function createAssistantProvider(config: Config): AssistantProvider {
  return config.ASSISTANT_PROVIDER === 'anthropic' ? new AnthropicAssistant(config) : new SimulatorAssistant();
}
