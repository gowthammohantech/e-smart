import Anthropic from '@anthropic-ai/sdk';
import { formatMoney } from '@esmart/core/lib/format';
import { LIXI_DEFAULT_MODELS, isOpenRouter, lixiModels, type Config } from '../config';

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
/** What a reply cost, summed over every model call it took. `costUsd` is null when the server doesn't say. */
export type AssistantUsage = { model: string; inputTokens: number; outputTokens: number; costUsd: number | null };
export type AssistantReply = { text: string; stats: AssistantStat[]; actions: AssistantAction[]; usage?: AssistantUsage };

/** Adds one call's usage to the running total. */
class UsageTotal {
  private total: AssistantUsage | null = null;

  add(model: string, inputTokens: number, outputTokens: number, costUsd: number | null) {
    const t = this.total;
    this.total = t
      ? { model, inputTokens: t.inputTokens + inputTokens, outputTokens: t.outputTokens + outputTokens, costUsd: t.costUsd === null || costUsd === null ? (t.costUsd ?? costUsd) : t.costUsd + costUsd }
      : { model, inputTokens, outputTokens, costUsd };
  }

  /** The reply with its usage attached, when any call reported some. */
  on(reply: AssistantReply): AssistantReply {
    return this.total ? { ...reply, usage: this.total } : reply;
  }
}

export type AssistantRequest = {
  history: ChatTurn[];
  /** Per-request facts: company, plan, today, language. Kept out of the cached prompt. */
  context: string;
  tools: ToolSpec[];
  execute: (name: string, input: unknown) => Promise<ToolOutcome>;
  /** App routes an action may open. */
  routes: readonly string[];
  /** Told when a model failed and the next one takes over, so the caller can log it. */
  onFallback?: (failed: string, next: string, err: AssistantUnavailable) => void;
};

export interface AssistantProvider {
  readonly name: string;
  reply(req: AssistantRequest): Promise<AssistantReply>;
}

/** The model couldn't be reached or refused the call: timeouts, 429, 5xx, bad key. The app shows "Lixi is unavailable". */
export class AssistantUnavailable extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AssistantUnavailable';
  }
}

const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

const SYSTEM = `You are Lixi, the assistant inside Elixir Books, an invoicing and accounting app for small businesses.

How you work:
- Every figure you state comes from a tool result in this conversation. Never estimate, invent or recall numbers. If the tools cannot answer, say so plainly.
- Money in tool results is {minor, currency, display}. Quote "display" exactly as written (it is already in rupees, e.g. ₹5,32,160.00); never work an amount out from "minor", which is in paise. Pass "minor" when a write tool asks for money.
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

/**
 * The model answers in JSON, sometimes inside a code fence or after a
 * sentence. Prose without JSON is shown as it is; JSON that won't parse is
 * never shown to the person.
 */
export function parseReply(text: string): AssistantReply {
  const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  const json = start >= 0 && end > start ? body.slice(start, end + 1) : body;
  try {
    const r = JSON.parse(json) as Partial<AssistantReply>;
    if (typeof r.text !== 'string') return FALLBACK;
    return { text: r.text, stats: Array.isArray(r.stats) ? r.stats : [], actions: Array.isArray(r.actions) ? r.actions : [] };
  } catch {
    return body && !body.startsWith('{') && !body.startsWith('[') ? { text: body, stats: [], actions: [] } : FALLBACK;
  }
}

/**
 * Adds `display` (e.g. "₹5,32,160.00") beside every {minor, currency} amount in a
 * tool result. Models misread paise as rupees and get answers 100x out; a ready
 * string they only have to copy is far safer than arithmetic.
 */
export function withDisplayAmounts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withDisplayAmounts);
  if (!value || typeof value !== 'object') return value;
  const o = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = withDisplayAmounts(v);
  if (typeof o.minor === 'number' && typeof o.currency === 'string' && !('display' in o)) {
    try {
      out.display = formatMoney({ minor: o.minor, currency: o.currency } as Parameters<typeof formatMoney>[0]);
    } catch {
      // An unknown currency keeps just minor and currency.
    }
  }
  return out;
}

/** A tool's answer in words, for the simulator: its top-level figures, amounts in rupees. */
function describeValue(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value ?? 'nothing');
  const label = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const parts = Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => {
    if (typeof v === 'number' || typeof v === 'string') return [`${label(k)} ${v}`];
    if (Array.isArray(v)) return [`${v.length} ${label(k)}`];
    const m = v as { minor?: unknown; currency?: unknown } | null;
    if (m && typeof m.minor === 'number' && typeof m.currency === 'string') return [`${label(k)} ${m.currency} ${(m.minor / 100).toFixed(2)}`];
    return [];
  });
  return parts.slice(0, 5).join(', ') || 'nothing to report';
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
    const usage = new UsageTotal();

    for (let round = 0; round <= this.config.LIXI_MAX_TOOL_ROUNDS; round++) {
      const last = round === this.config.LIXI_MAX_TOOL_ROUNDS;
      const response = await this.client.beta.messages.create({
        model: this.config.LIXI_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
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
      usage.add(response.model, response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0), response.usage.output_tokens, null);

      if (response.stop_reason === 'refusal') return usage.on({ text: "I can't help with that one.", stats: [], actions: [] });
      if (response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content });
        continue;
      }
      if (response.stop_reason !== 'tool_use') {
        if (response.stop_reason === 'max_tokens') return usage.on(FALLBACK);
        // The answer is the last text block; anything before it is the model thinking aloud.
        const texts = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : []));
        const last = parseReply(texts.at(-1) ?? '');
        return usage.on(last === FALLBACK ? parseReply(texts.join('')) : last);
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
            content: JSON.stringify(outcome.ok ? withDisplayAmounts(outcome.value) : outcome.error),
            ...(outcome.ok ? {} : { is_error: true }),
          };
        }),
      );
      messages.push({ role: 'user', content: results });
    }
    return usage.on(FALLBACK);
  }
}

// ------------------------------------------------------------ OpenAI-compatible

type OaiToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
type OaiMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OaiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
type OaiChoice = { finish_reason: string | null; message: { content?: string | null; refusal?: string | null; tool_calls?: OaiToolCall[] } };
/** `cost` is OpenRouter's, in US dollars; other servers leave it out. */
type OaiUsage = { prompt_tokens?: number; completion_tokens?: number; cost?: number };
type OaiCompletion = { model?: string; choices?: OaiChoice[]; usage?: OaiUsage };

const BUILT_IN_MODELS = new Set<string>(Object.values(LIXI_DEFAULT_MODELS));

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504]);

/**
 * Any server that speaks the OpenAI Chat Completions API: OpenAI, Azure
 * OpenAI (v1 endpoint), OpenRouter, Groq, Together, Fireworks, DeepSeek,
 * Mistral, Gemini's OpenAI endpoint, or a local Ollama / vLLM / LM Studio.
 * Pick the server with OPENAI_BASE_URL and the models with LIXI_MODEL and
 * LIXI_SECONDARY_MODEL (on OpenRouter both default to free models, see
 * LIXI_DEFAULT_MODELS). When the primary fails, the secondary takes over.
 *
 * Only the common subset is sent: messages, tools, tool_choice and, if the
 * server supports it, a JSON response format. Anything vendor-specific stays
 * opt-in (OPENAI_REASONING_EFFORT), because servers reject fields they don't know.
 */
export class OpenAICompatibleAssistant implements AssistantProvider {
  readonly name = 'openai';
  private readonly url: string;
  /** Primary first, then the secondary if one is set. */
  private readonly models: string[];
  /** OpenRouter takes a usage request and attribution headers that other servers would reject or ignore. */
  private readonly openRouter: boolean;
  private readonly fetch: typeof globalThis.fetch;

  constructor(
    private readonly config: Pick<
      Config,
      'OPENAI_BASE_URL' | 'OPENAI_API_KEY' | 'OPENAI_RESPONSE_FORMAT' | 'OPENAI_REASONING_EFFORT' | 'LIXI_MODEL' | 'LIXI_SECONDARY_MODEL' | 'LIXI_MAX_TOOL_ROUNDS' | 'APP_URL'
    >,
    /** Tests swap the transport. */
    fetch?: typeof globalThis.fetch,
  ) {
    // Built-in defaults exist only for OpenRouter: config refuses to load elsewhere without a model.
    this.models = lixiModels(config);
    if (!this.models.length) throw new Error('LIXI_MODEL must be set for ASSISTANT_PROVIDER=openai.');
    this.url = `${config.OPENAI_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
    this.openRouter = isOpenRouter(this.url);
    this.fetch = fetch ?? globalThis.fetch;
  }

  async reply(req: AssistantRequest): Promise<AssistantReply> {
    const tools = req.tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
    const messages: OaiMessage[] = [
      { role: 'system', content: `${SYSTEM}\n\n${req.context}` },
      ...req.history.map((turn): OaiMessage => ({ role: turn.role, content: turn.text })),
    ];
    const usage = new UsageTotal();
    // Once the primary has failed in this reply, the rest of it stays on the secondary.
    let current = 0;

    for (let round = 0; round <= this.config.LIXI_MAX_TOOL_ROUNDS; round++) {
      const last = round === this.config.LIXI_MAX_TOOL_ROUNDS;
      const body = {
        messages,
        ...(tools.length ? { tools, tool_choice: last ? 'none' : 'auto' } : {}),
        ...(this.config.OPENAI_REASONING_EFFORT ? { reasoning_effort: this.config.OPENAI_REASONING_EFFORT } : {}),
        ...(this.openRouter ? { usage: { include: true } } : {}),
      };
      let answer: Awaited<ReturnType<OpenAICompatibleAssistant['complete']>>;
      for (;;) {
        const model = this.models[current]!;
        try {
          answer = await this.complete({ model, ...body, ...this.responseFormat(req.routes, model) }, model);
          break;
        } catch (err) {
          if (!(err instanceof AssistantUnavailable) || current + 1 >= this.models.length) throw err;
          req.onFallback?.(model, this.models[current + 1]!, err);
          current++;
        }
      }
      const { choice, model, usage: used } = answer;
      if (used) usage.add(model, used.prompt_tokens ?? 0, used.completion_tokens ?? 0, typeof used.cost === 'number' ? used.cost : null);
      const { message } = choice;

      if (message.refusal) return usage.on({ text: "I can't help with that one.", stats: [], actions: [] });
      const calls = message.tool_calls ?? [];
      if (!calls.length) {
        if (choice.finish_reason === 'length') return usage.on(FALLBACK);
        return usage.on(parseReply(message.content ?? ''));
      }

      messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: calls });
      const results = await Promise.all(
        calls.map(async (call): Promise<OaiMessage> => {
          let input: unknown;
          try {
            input = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          } catch {
            return { role: 'tool', tool_call_id: call.id, content: JSON.stringify({ status: 400, code: 'BAD_ARGUMENTS', detail: 'Arguments were not valid JSON' }) };
          }
          const outcome = await req.execute(call.function.name, input);
          return { role: 'tool', tool_call_id: call.id, content: JSON.stringify(outcome.ok ? withDisplayAmounts(outcome.value) : { error: outcome.error }) };
        }),
      );
      messages.push(...results);
    }
    return usage.on(FALLBACK);
  }

  private responseFormat(routes: readonly string[], model: string) {
    // The built-in free models answer in text instead of calling tools when a format is asked for;
    // the prompt asks for JSON anyway and parseReply copes with loose JSON.
    if (BUILT_IN_MODELS.has(model)) return {};
    switch (this.config.OPENAI_RESPONSE_FORMAT) {
      case 'json_schema':
        return { response_format: { type: 'json_schema', json_schema: { name: 'lixi_reply', strict: true, schema: REPLY_SCHEMA(routes) } } };
      case 'json_object':
        return { response_format: { type: 'json_object' } };
      default:
        return {};
    }
  }

  /** One call, retried twice on a timeout, 429 or 5xx. `model` is the one that answered: OpenRouter may route elsewhere. */
  private async complete(body: Record<string, unknown>, requested: string): Promise<{ choice: OaiChoice; model: string; usage?: OaiUsage }> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.openRouter) {
      headers['http-referer'] = this.config.APP_URL;
      headers['x-title'] = 'Elixir Books';
    }
    const key = this.config.OPENAI_API_KEY;
    if (key) {
      headers.authorization = `Bearer ${key}`;
      // Azure OpenAI takes its key in `api-key`.
      if (/\.azure\.com$/i.test(new URL(this.url).hostname)) headers['api-key'] = key;
    }

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetch(this.url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
      } catch (err) {
        if (attempt < 2) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw new AssistantUnavailable(`Model server unreachable: ${(err as Error).message}`);
      }
      if (res.ok) {
        const data = (await res.json()) as OaiCompletion;
        const choice = data.choices?.[0];
        if (!choice?.message) throw new AssistantUnavailable('Model server returned no choices');
        return { choice, model: data.model ?? requested, ...(data.usage ? { usage: data.usage } : {}) };
      }
      if (RETRYABLE.has(res.status) && attempt < 2) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      const detail = (await res.text().catch(() => '')).slice(0, 500);
      throw new AssistantUnavailable(`Model server answered ${res.status}: ${detail}`, res.status);
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const looked = { get_stock_levels: 'stock levels', get_receivables: 'receivables', get_payables: 'payables', get_dashboard: 'dashboard' }[tool];
    return { text: `From your ${looked}: ${describeValue(outcome.value)}.`, stats: [], actions: [] };
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
  switch (config.ASSISTANT_PROVIDER) {
    case 'anthropic':
      return new AnthropicAssistant(config);
    case 'openai':
      return new OpenAICompatibleAssistant(config);
    default:
      return new SimulatorAssistant();
  }
}
