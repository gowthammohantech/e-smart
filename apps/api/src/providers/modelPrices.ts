/**
 * What a model call is estimated to cost, for providers that don't say (Anthropic, and OpenAI
 * direct; OpenRouter reports its own cost and that is used instead). Recorded per business per
 * month (ai_usage.cost_micro_usd, migration 0050) and shown in the admin console as an estimate.
 *
 * US dollars per million tokens, list prices for the standard tier. Sources, checked 10 Nov 2026:
 * - Anthropic: https://platform.claude.com/docs/en/about-claude/pricing (cache writes are 1.25x
 *   input for the 5-minute cache; cache reads as listed per model, else 0.1x input).
 * - OpenAI: https://openai.com/api/pricing (cached input as listed).
 * Prices change: update this table when they do. A model not listed here records no cost (0), as before.
 */
type Price = { input: number; output: number; cacheRead?: number };

const PRICES: Record<string, Price> = {
  // Anthropic
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-opus-4-5': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  // OpenAI
  'gpt-5-nano': { input: 0.05, output: 0.4, cacheRead: 0.005 },
  'gpt-5-mini': { input: 0.25, output: 2, cacheRead: 0.025 },
  'gpt-5': { input: 1.25, output: 10, cacheRead: 0.125 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4, cacheRead: 0.025 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6, cacheRead: 0.1 },
  'gpt-4.1': { input: 2, output: 8, cacheRead: 0.5 },
  'gpt-4o-mini': { input: 0.15, output: 0.6, cacheRead: 0.075 },
  'gpt-4o': { input: 2.5, output: 10, cacheRead: 1.25 },
};

/** Longest first, so `gpt-5-mini` wins over `gpt-5` and `claude-opus-5-5` over `claude-opus-5`. */
const KEYS = Object.keys(PRICES).sort((a, b) => b.length - a.length);

/** The price of a model id as a server names it: `openai/gpt-5-mini`, `gpt-5-mini-2025-08-07`, `claude-opus-4-8`. */
export function priceOf(model: string): Price | null {
  const id = model.trim().toLowerCase().split('/').pop() ?? '';
  // The name itself or a dated snapshot of it (`-2025-08-07`, `-20250929`, `@20250929`), not a different model.
  const key = KEYS.find((k) => id === k || new RegExp(`^${k.replace(/\./g, '\\.')}(?:[-@]\\d{4}-?\\d{2}-?\\d{2}|-latest)$`).test(id));
  return key ? PRICES[key]! : null;
}

export type CallTokens = {
  /** Input tokens at the full rate (for Anthropic, excluding cache reads and writes). */
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
};

/** Estimated US dollars for one call, or null for a model not in the table. */
export function estimateCostUsd(model: string, t: CallTokens): number | null {
  const p = priceOf(model);
  if (!p) return null;
  const cacheRead = p.cacheRead ?? p.input * 0.1;
  const cacheWrite = p.input * 1.25;
  return (t.input * p.input + t.output * p.output + (t.cacheRead ?? 0) * cacheRead + (t.cacheWrite ?? 0) * cacheWrite) / 1_000_000;
}
