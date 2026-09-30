import { describe, expect, it } from 'vitest';
import { AnthropicAssistant, type ToolOutcome } from '../src/providers/assistant';

const message = (content: unknown[], stop_reason: string) => ({
  id: `msg_${Math.random()}`,
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content,
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
});

/** A fake Messages API: answers each call with the next canned message and records the request. */
function fakeApi(replies: unknown[]) {
  const requests: any[] = [];
  const fetch = (async (_url: string, init: RequestInit) => {
    requests.push({ body: JSON.parse(String(init.body)), headers: new Headers(init.headers as HeadersInit) });
    return new Response(JSON.stringify(replies[requests.length - 1]), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

const config = { ANTHROPIC_API_KEY: 'sk-test', LIXI_MODEL: 'claude-opus-5-5', LIXI_EFFORT: 'low' as const, LIXI_MAX_TOOL_ROUNDS: 4 };
const tools = [{ name: 'get_receivables', description: 'Who owes', inputSchema: { type: 'object', properties: {} } }];

describe('AnthropicAssistant', () => {
  it('runs tools the model asks for and returns its structured reply', async () => {
    const final = { text: 'Sunrise Retail owes ₹1,180.', stats: [{ label: 'Outstanding', value: '₹1,180' }], actions: [] };
    const api = fakeApi([
      message([{ type: 'tool_use', id: 'tu_1', name: 'get_receivables', input: {} }], 'tool_use'),
      message([{ type: 'text', text: JSON.stringify(final) }], 'end_turn'),
    ]);
    const calls: string[] = [];
    const execute = async (name: string): Promise<ToolOutcome> => {
      calls.push(name);
      return { ok: true, value: { total: { minor: 118000, currency: 'INR' } } };
    };

    const reply = await new AnthropicAssistant(config, api.fetch).reply({
      history: [{ role: 'user', text: 'who owes me?' }],
      context: 'Today is 2026-09-29.',
      tools,
      execute,
      routes: ['/(app)/receivables'],
    });

    expect(reply).toEqual(final);
    expect(calls).toEqual(['get_receivables']);
    const [first, second] = api.requests;
    expect(first.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(first.body).toMatchObject({
      model: 'claude-opus-5-5',
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: { type: 'json_schema' } },
      tool_choice: { type: 'auto' },
    });
    expect(first.body.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(first.body.system[1].text).toBe('Today is 2026-09-29.');
    // The tool result goes back after the assistant's tool call.
    expect(second.body.messages.at(-1)).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: JSON.stringify({ total: { minor: 118000, currency: 'INR' } }) }],
    });
  });

  it('marks failed tools as errors and handles a refusal', async () => {
    const api = fakeApi([
      message([{ type: 'tool_use', id: 'tu_1', name: 'get_receivables', input: {} }], 'tool_use'),
      message([], 'refusal'),
    ]);
    const reply = await new AnthropicAssistant(config, api.fetch).reply({
      history: [{ role: 'user', text: 'hi' }],
      context: '',
      tools,
      execute: async () => ({ ok: false, error: { status: 403, code: 'PLAN_UPGRADE_REQUIRED' } }),
      routes: [],
    });
    expect(reply.text).toBe("I can't help with that one.");
    expect(api.requests[1].body.messages.at(-1).content[0]).toMatchObject({ is_error: true });
  });
});
