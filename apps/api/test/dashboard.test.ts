import { and, eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { issueInvoice, moneySetup } from './money-fixtures';
import { INR, books } from './report-fixtures';

const t = setupApi();

describe('dashboard', () => {
  it('summarises the month from the same numbers as the reports', async () => {
    const m = await moneySetup(t);
    const k = await books(t, m);
    await m.item({ name: 'Anchor bolt', reorderLevel: '5' }); // tracked, none in stock: low
    await t.deps.db.insert(schema.eInvoices).values({ documentId: k.a.id, companyId: m.companyId, status: 'pending' });

    const res = await t.get(`${m.c}/dashboard`, { token: m.token });
    expect(res.status).toBe(200);
    const unread = await t.deps.db.select().from(schema.notifications).where(and(eq(schema.notifications.companyId, m.companyId), isNull(schema.notifications.readAt)));
    expect(res.body).toMatchObject({
      sales: INR(236000), // invoice A only; B is August's and the draft is not live
      purchases: INR(324500),
      expenses: INR(11800),
      receivable: INR(254000),
      overdueReceivable: INR(118000), // B, due 14 Sep
      payable: INR(324500),
      cashBalance: INR(100000 - 11800),
      lowStockCount: 1,
      pendingCompliance: 1,
      unreadNotifications: unread.length,
    });
    expect(unread.length).toBeGreaterThan(0);
    expect(res.body.salesTrend).toEqual([
      { key: '2026-04', value: INR(0) },
      { key: '2026-05', value: INR(0) },
      { key: '2026-06', value: INR(0) },
      { key: '2026-07', value: INR(0) },
      { key: '2026-08', value: INR(118000) },
      { key: '2026-09', value: INR(236000) },
    ]);
    expect(res.body.recentDocuments.map((d: { id: string }) => d.id)).toEqual([k.draft.id, k.a.id, k.b.id]);

    const year = await t.get(`${m.c}/dashboard`, { token: m.token, query: { range: 'year' } });
    expect(year.body.sales).toEqual(INR(354000));
    const today = await t.get(`${m.c}/dashboard`, { token: m.token, query: { range: 'today' } });
    expect(today.body.sales).toEqual(INR(0));
    const week = await t.get(`${m.c}/dashboard`, { token: m.token, query: { range: 'week' } });
    expect(week.body.expenses).toEqual(INR(0));
    const quarter = await t.get(`${m.c}/dashboard`, { token: m.token, query: { range: 'quarter' } });
    expect(quarter.body.sales).toEqual(INR(354000));
  });

  it('leaves out what the plan does not include', async () => {
    const m = await moneySetup(t, 'basic');
    t.setNow('2026-09-29T10:00:00Z');
    await issueInvoice(t, m, { date: '2026-09-10' });
    const res = await t.get(`${m.c}/dashboard`, { token: m.token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sales: INR(236000), receivable: INR(236000), overdueReceivable: INR(0), cashBalance: INR(0) });
    for (const key of ['purchases', 'expenses', 'payable', 'lowStockCount']) expect(res.body[key], key).toBeUndefined();
  });
});
