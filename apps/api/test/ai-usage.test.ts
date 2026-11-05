import { describe, expect, it } from 'vitest';
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
});
