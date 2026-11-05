import { and, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '@esmart/db';
import { recordAiCost } from '../src/lib/aiUsage';
import { setupApi } from './helpers';
import { moneySetup } from './money-fixtures';

const t = setupApi();
const ask = (m: { c: string; token: string }) => t.post(`${m.c}/lixi/messages`, { messages: [{ role: 'user', text: 'who owes me money?' }] }, { token: m.token });

describe('AI allowance', () => {
  it("counts Lixi messages against the owner's monthly budget and stops at it", async () => {
    const m = await moneySetup(t);
    t.setNow('2026-11-30T12:00:00Z');
    const fresh = await t.get(`${m.c}/ai-usage`, { token: m.token });
    expect(fresh.body).toMatchObject({ month: '2026-11', limit: 1500, planLimit: 1500, budget: null, total: 0, used: { lixi: 0, ocr: 0 } });

    // The owner sets a budget of two; asking for more than the plan gives the plan's.
    const company = (await t.get(m.c, { token: m.token })).body;
    expect((await t.put(m.c, { ...company, aiMonthlyLimit: 2 }, { token: m.token })).status).toBe(200);
    expect((await ask(m)).status).toBe(200);
    expect((await ask(m)).status).toBe(200);
    const over = await ask(m);
    expect(over.status).toBe(429);
    expect(over.body.code).toBe('AI_LIMIT_REACHED');
    expect((await t.get(`${m.c}/ai-usage`, { token: m.token })).body).toMatchObject({ limit: 2, budget: 2, total: 2, used: { lixi: 2 } });

    // A new month (India time) starts again.
    t.setNow('2026-11-30T19:00:00Z');
    expect((await ask(m)).status).toBe(200);
    expect((await t.get(`${m.c}/ai-usage`, { token: m.token })).body).toMatchObject({ month: '2026-12', total: 1 });

    const raised = (await t.get(m.c, { token: m.token })).body;
    await t.put(m.c, { ...raised, aiMonthlyLimit: 1_000_000 }, { token: m.token });
    expect((await t.get(`${m.c}/ai-usage`, { token: m.token })).body.limit).toBe(1500);
  });

  it("records what each Lixi answer cost, apart from the allowance's count", async () => {
    const m = await moneySetup(t);
    t.setNow('2026-11-10T12:00:00Z');
    const reply = vi.spyOn(t.deps.providers.assistant, 'reply').mockResolvedValue({
      text: 'You are owed ₹1,180.',
      stats: [],
      actions: [],
      usage: { model: 'openai/gpt-5-mini', inputTokens: 2700, outputTokens: 100, costUsd: 0.001 },
    });
    try {
      expect((await ask(m)).status).toBe(200);
      expect((await ask(m)).status).toBe(200);
    } finally {
      reply.mockRestore();
    }
    const U = schema.aiUsage;
    const [row] = await t.deps.db.select().from(U).where(and(eq(U.companyId, m.companyId), eq(U.feature, 'lixi')));
    expect(row).toMatchObject({ month: '2026-11', count: 2, inputTokens: 5400, outputTokens: 200, costMicroUsd: 2000 });
    // The owner's screen still shows actions, not our cost.
    expect((await t.get(`${m.c}/ai-usage`, { token: m.token })).body).toMatchObject({ total: 2 });
  });

  it('records cost for a month with no actions yet, and treats an unreported cost as nothing', async () => {
    const m = await moneySetup(t);
    const now = new Date('2026-10-05T06:00:00Z');
    await recordAiCost(t.deps.db, m.companyId, now, 'lixi', { inputTokens: 10, outputTokens: 2, costUsd: null });
    await recordAiCost(t.deps.db, m.companyId, now, 'lixi', { inputTokens: 5, outputTokens: 1, costUsd: 0.0000015 });
    const U = schema.aiUsage;
    const [row] = await t.deps.db.select().from(U).where(and(eq(U.companyId, m.companyId), eq(U.month, '2026-10')));
    expect(row).toMatchObject({ count: 0, inputTokens: 15, outputTokens: 3, costMicroUsd: 2 });
  });
});
