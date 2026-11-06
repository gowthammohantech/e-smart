import { describe, expect, it } from 'vitest';
import { LIXI_DEFAULT_MODELS } from '../src/config';
import { AnthropicAssistant, AssistantUnavailable, OpenAICompatibleAssistant, parseReply, type ToolOutcome } from '../src/providers/assistant';

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

    expect(reply).toEqual({ ...final, usage: { model: 'claude-opus-5-5', inputTokens: 20, outputTokens: 20, costUsd: null } });
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

const completion = (message: Record<string, unknown>, finish_reason: string) => ({
  id: `chatcmpl_${Math.random()}`,
  object: 'chat.completion',
  model: 'gpt-5-mini',
  choices: [{ index: 0, finish_reason, message: { role: 'assistant', content: null, ...message } }],
});

/** A fake Chat Completions server: canned replies (or statuses), every request recorded with its URL. */
function fakeOpenAI(replies: (unknown | number)[]) {
  const requests: { url: string; body: any; headers: Headers }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)), headers: new Headers(init.headers as HeadersInit) });
    const next = replies[requests.length - 1];
    if (typeof next === 'number') return new Response('{"error":{"message":"nope"}}', { status: next });
    return new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

const oaiConfig = {
  OPENAI_BASE_URL: 'https://api.groq.com/openai/v1/',
  OPENAI_API_KEY: 'sk-test',
  OPENAI_RESPONSE_FORMAT: 'json_schema' as const,
  OPENAI_REASONING_EFFORT: undefined,
  LIXI_MODEL: 'llama-3.3-70b-versatile',
  LIXI_MAX_TOOL_ROUNDS: 4,
  APP_URL: 'https://smart.elixir-books.com',
};

describe('OpenAICompatibleAssistant', () => {
  it('runs tool calls through Chat Completions and returns the structured reply', async () => {
    const final = { text: 'Sunrise Retail owes ₹1,180.', stats: [{ label: 'Outstanding', value: '₹1,180' }], actions: [] };
    const api = fakeOpenAI([
      completion({ tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_receivables', arguments: '{"overdue":true}' } }] }, 'tool_calls'),
      completion({ content: JSON.stringify(final) }, 'stop'),
    ]);
    const inputs: unknown[] = [];
    const reply = await new OpenAICompatibleAssistant(oaiConfig, api.fetch).reply({
      history: [{ role: 'user', text: 'who owes me?' }],
      context: 'Today is 2026-09-29.',
      tools,
      execute: async (_name, input) => {
        inputs.push(input);
        return { ok: true, value: { total: { minor: 118000, currency: 'INR' } } };
      },
      routes: ['/(app)/receivables'],
    });

    expect(reply).toEqual(final);
    expect(inputs).toEqual([{ overdue: true }]);
    const [first, second] = api.requests;
    expect(first.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(first.headers.get('authorization')).toBe('Bearer sk-test');
    expect(first.headers.get('api-key')).toBeNull();
    expect(first.body).toMatchObject({
      model: 'llama-3.3-70b-versatile',
      tool_choice: 'auto',
      tools: [{ type: 'function', function: { name: 'get_receivables', parameters: { type: 'object' } } }],
      response_format: { type: 'json_schema', json_schema: { name: 'lixi_reply', strict: true } },
    });
    expect(first.body).not.toHaveProperty('reasoning_effort');
    // OpenRouter's extras stay off other servers, which reject unknown fields.
    expect(first.body).not.toHaveProperty('usage');
    expect(first.headers.get('x-title')).toBeNull();
    expect(first.body.messages[0]).toMatchObject({ role: 'system' });
    expect(first.body.messages[0].content).toContain('Today is 2026-09-29.');
    expect(second.body.messages.slice(-2)).toEqual([
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_receivables', arguments: '{"overdue":true}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: JSON.stringify({ total: { minor: 118000, currency: 'INR' } }) },
    ]);
  });

  it('stops calling tools on the last round, and sends vendor options only when set', async () => {
    const call = completion({ tool_calls: [{ id: 'c', type: 'function', function: { name: 'get_receivables', arguments: '{}' } }] }, 'tool_calls');
    const api = fakeOpenAI([call, completion({ content: 'Plain words.' }, 'stop')]);
    const reply = await new OpenAICompatibleAssistant(
      { ...oaiConfig, LIXI_MAX_TOOL_ROUNDS: 1, OPENAI_RESPONSE_FORMAT: 'none', OPENAI_REASONING_EFFORT: 'low' },
      api.fetch,
    ).reply({ history: [{ role: 'user', text: 'hi' }], context: '', tools, execute: async () => ({ ok: true, value: {} }), routes: [] });
    expect(reply.text).toBe('Plain words.');
    expect(api.requests[1].body.tool_choice).toBe('none');
    expect(api.requests[0].body.reasoning_effort).toBe('low');
    expect(api.requests[0].body).not.toHaveProperty('response_format');
  });

  it('on OpenRouter, asks for usage, attributes the app, and adds up the cost of every round', async () => {
    const call = { tool_calls: [{ id: 'c', type: 'function', function: { name: 'get_receivables', arguments: '{}' } }] };
    const api = fakeOpenAI([
      { ...completion(call, 'tool_calls'), model: 'openai/gpt-5-mini', usage: { prompt_tokens: 1200, completion_tokens: 40, cost: 0.00042 } },
      { ...completion({ content: '{"text":"₹1,180 is owed."}' }, 'stop'), model: 'openai/gpt-5-mini', usage: { prompt_tokens: 1500, completion_tokens: 60, cost: 0.00058 } },
    ]);
    const reply = await new OpenAICompatibleAssistant({ ...oaiConfig, OPENAI_BASE_URL: 'https://openrouter.ai/api/v1', LIXI_MODEL: 'openai/gpt-5-mini' }, api.fetch).reply({
      history: [{ role: 'user', text: 'who owes me?' }], context: '', tools, execute: async () => ({ ok: true, value: {} }), routes: [],
    });
    expect(reply.text).toBe('₹1,180 is owed.');
    expect(reply.usage).toEqual({ model: 'openai/gpt-5-mini', inputTokens: 2700, outputTokens: 100, costUsd: expect.closeTo(0.001, 9) });
    expect(api.requests[0].body.usage).toEqual({ include: true });
    expect(api.requests[0].headers.get('http-referer')).toBe('https://smart.elixir-books.com');
    expect(api.requests[0].headers.get('x-title')).toBe('Elixir Books');
  });

  it('reports tokens with no cost when the server leaves cost out, and no usage when it says nothing', async () => {
    const req = { history: [{ role: 'user' as const, text: 'hi' }], context: '', tools, execute: async (): Promise<ToolOutcome> => ({ ok: true, value: {} }), routes: [] };
    const counted = fakeOpenAI([{ ...completion({ content: '{"text":"Hi"}' }, 'stop'), usage: { prompt_tokens: 10, completion_tokens: 2 } }]);
    expect((await new OpenAICompatibleAssistant(oaiConfig, counted.fetch).reply(req)).usage).toEqual({ model: 'gpt-5-mini', inputTokens: 10, outputTokens: 2, costUsd: null });
    const silent = fakeOpenAI([completion({ content: '{"text":"Hi"}' }, 'stop')]);
    expect((await new OpenAICompatibleAssistant(oaiConfig, silent.fetch).reply(req)).usage).toBeUndefined();
  });

  it('sends Azure its api-key header', async () => {
    const api = fakeOpenAI([completion({ content: '{"text":"Hi"}' }, 'stop')]);
    await new OpenAICompatibleAssistant({ ...oaiConfig, OPENAI_BASE_URL: 'https://acme.openai.azure.com/openai/v1' }, api.fetch).reply({
      history: [{ role: 'user', text: 'hi' }], context: '', tools, execute: async () => ({ ok: true, value: {} }), routes: [],
    });
    expect(api.requests[0].headers.get('api-key')).toBe('sk-test');
  });

  it('retries a 429, then reports a server that keeps failing as unavailable', async () => {
    const ok = fakeOpenAI([429, completion({ content: '{"text":"Back."}' }, 'stop')]);
    const req = { history: [{ role: 'user' as const, text: 'hi' }], context: '', tools, execute: async (): Promise<ToolOutcome> => ({ ok: true, value: {} }), routes: [] };
    expect((await new OpenAICompatibleAssistant(oaiConfig, ok.fetch).reply(req)).text).toBe('Back.');

    const down = fakeOpenAI([401]);
    await expect(new OpenAICompatibleAssistant(oaiConfig, down.fetch).reply(req)).rejects.toBeInstanceOf(AssistantUnavailable);
  });

  it('on OpenRouter with no models set, uses the built-in free primary', async () => {
    const api = fakeOpenAI([completion({ content: '{"text":"Hi"}' }, 'stop')]);
    const req = { history: [{ role: 'user' as const, text: 'hi' }], context: '', tools, execute: async (): Promise<ToolOutcome> => ({ ok: true, value: {} }), routes: [] };
    await new OpenAICompatibleAssistant({ ...oaiConfig, OPENAI_BASE_URL: 'https://openrouter.ai/api/v1', LIXI_MODEL: undefined }, api.fetch).reply(req);
    expect(api.requests[0].body.model).toBe(LIXI_DEFAULT_MODELS.primary);
  });

  it('falls back to the secondary when the primary fails, and stays on it for the rest of the reply', async () => {
    const call = { tool_calls: [{ id: 'c', type: 'function', function: { name: 'get_receivables', arguments: '{}' } }] };
    // The primary is refused outright (403); the secondary answers both rounds.
    const api = fakeOpenAI([403, completion(call, 'tool_calls'), completion({ content: '{"text":"₹1,180 is owed."}' }, 'stop')]);
    const fallbacks: string[][] = [];
    const reply = await new OpenAICompatibleAssistant(
      { ...oaiConfig, OPENAI_BASE_URL: 'https://openrouter.ai/api/v1', LIXI_MODEL: 'paid/primary', LIXI_SECONDARY_MODEL: 'paid/secondary' },
      api.fetch,
    ).reply({
      history: [{ role: 'user', text: 'who owes me?' }], context: '', tools, execute: async () => ({ ok: true, value: {} }), routes: [],
      onFallback: (failed, next) => fallbacks.push([failed, next]),
    });
    expect(reply.text).toBe('₹1,180 is owed.');
    expect(api.requests.map((r) => r.body.model)).toEqual(['paid/primary', 'paid/secondary', 'paid/secondary']);
    expect(fallbacks).toEqual([['paid/primary', 'paid/secondary']]);
  });

  it('off OpenRouter, uses only the models it is given', async () => {
    const down = fakeOpenAI([401]);
    const req = { history: [{ role: 'user' as const, text: 'hi' }], context: '', tools, execute: async (): Promise<ToolOutcome> => ({ ok: true, value: {} }), routes: [] };
    await expect(new OpenAICompatibleAssistant(oaiConfig, down.fetch).reply(req)).rejects.toBeInstanceOf(AssistantUnavailable);
    expect(down.requests.map((r) => r.body.model)).toEqual(['llama-3.3-70b-versatile']);
  });

  it('tells the model when its arguments are not JSON, and handles a refusal', async () => {
    const api = fakeOpenAI([
      completion({ tool_calls: [{ id: 'c', type: 'function', function: { name: 'get_receivables', arguments: '{oops' } }] }, 'tool_calls'),
      completion({ refusal: 'No.' }, 'stop'),
    ]);
    let ran = false;
    const reply = await new OpenAICompatibleAssistant(oaiConfig, api.fetch).reply({
      history: [{ role: 'user', text: 'hi' }], context: '', tools,
      execute: async () => { ran = true; return { ok: true, value: {} }; },
      routes: [],
    });
    expect(ran).toBe(false);
    expect(api.requests[1].body.messages.at(-1).content).toContain('BAD_ARGUMENTS');
    expect(reply.text).toBe("I can't help with that one.");
  });
});

describe('reading the model\'s answer', () => {
  it('takes JSON out of a code fence, or after a sentence', () => {
    expect(parseReply('```json\n{"text":"You are owed ₹1,180."}\n```').text).toBe('You are owed ₹1,180.');
    expect(parseReply('Here you go: {"text":"Two invoices are overdue."}').text).toBe('Two invoices are overdue.');
  });

  it('shows plain prose as it is, and never shows broken JSON', () => {
    expect(parseReply('Sales are up this month.').text).toBe('Sales are up this month.');
    expect(parseReply('{"text": "cut off').text).not.toContain('{');
  });
});
