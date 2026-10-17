import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { materializeRecurringExpenses } from '../src/modules/expenses/handlers';
import { ownerWithCompany, setupApi } from './helpers';
import { moneySetup, type Money } from './money-fixtures';
import { joinTeam } from './team-helpers';

const t = setupApi();

async function categories(m: Money) {
  return t.deps.db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, m.companyId));
}

const expense = (m: Money, categoryId: string, over: Record<string, unknown> = {}) => ({
  categoryId,
  date: '2026-09-10',
  amount: { minor: 11800, currency: 'INR' },
  currency: 'INR',
  accountId: m.cash.id,
  method: 'cash',
  ...over,
});

async function bankAccount(m: Money) {
  const res = await t.post(`${m.c}/payment-accounts`, { name: 'HDFC current', type: 'bank', currency: 'INR', openingBalance: { minor: 1000000, currency: 'INR' } }, { token: m.token });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('expenses', () => {
  it('numbers an expense, computes its input tax from the tax category, and charges the account', async () => {
    const m = await moneySetup(t);
    const [cat] = await categories(m);

    const inclusive = await t.post(`${m.c}/expenses`, expense(m, cat.id, { taxCategoryId: m.gst(18), taxInclusive: true, taxAmount: { minor: 999, currency: 'INR' }, supplierId: m.supplier!.id, reference: 'BILL-77', billable: true }), { token: m.token });
    expect(inclusive.status).toBe(201);
    expect(inclusive.headers.etag).toBe('"v1"');
    expect(inclusive.body).toMatchObject({
      number: 'EXP/26-27/0001',
      amount: { minor: 11800, currency: 'INR' },
      taxAmount: { minor: 1800, currency: 'INR' },
      taxInclusive: true,
      supplierId: m.supplier!.id,
      recurrence: 'none',
      version: 1,
    });
    expect(inclusive.body.nextRecurrenceDate).toBeUndefined();

    // Tax added on top: the amount paid is net + 18% of net, so the net is 5000.
    const exclusive = await t.post(`${m.c}/expenses`, expense(m, cat.id, { amount: { minor: 5900, currency: 'INR' }, taxCategoryId: m.gst(18), taxInclusive: false }), { token: m.token });
    expect(exclusive.body).toMatchObject({ number: 'EXP/26-27/0002', taxAmount: { minor: 900 }, taxInclusive: false });

    const untaxed = await t.post(`${m.c}/expenses`, expense(m, cat.id, { amount: { minor: 2500, currency: 'INR' } }), { token: m.token });
    expect(untaxed.body.taxAmount).toEqual({ minor: 0, currency: 'INR' });

    const got = await t.get(`${m.c}/expenses/${inclusive.body.id}`, { token: m.token });
    expect(got.body).toEqual(inclusive.body);

    // Cash paid out: 11800 + 5900 + 2500.
    const accounts = await t.get(`${m.c}/payment-accounts`, { token: m.token });
    const cash = accounts.body.data.find((a: { id: string }) => a.id === m.cash.id);
    expect(cash.currentBalance).toEqual({ minor: -20200, currency: 'INR' });

    const audit = await t.deps.db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.companyId, m.companyId), eq(schema.auditEvents.entityType, 'expense')));
    expect(audit.map((a) => a.action)).toEqual(['created', 'created', 'created']);
  });

  it('refuses an account that does not fit the method, and unknown or wrong-kind references', async () => {
    const m = await moneySetup(t);
    const [cat] = await categories(m);
    const bank = await bankAccount(m);

    const cashByBank = await t.post(`${m.c}/expenses`, expense(m, cat.id, { method: 'bank' }), { token: m.token });
    expect(cashByBank.status).toBe(422);
    expect(cashByBank.body.issues[0].field).toBe('accountId');
    expect((await t.post(`${m.c}/expenses`, expense(m, cat.id, { method: 'upi', accountId: bank }), { token: m.token })).status).toBe(201);

    const badCategory = await t.post(`${m.c}/expenses`, expense(m, 'exc_nope'), { token: m.token });
    expect(badCategory.status).toBe(422);
    expect(badCategory.body.issues.map((i: { field: string }) => i.field)).toEqual(['categoryId']);

    const customer = await t.post(`${m.c}/expenses`, expense(m, cat.id, { supplierId: m.mumbai.id }), { token: m.token });
    expect(customer.status).toBe(422);
    expect(customer.body.issues[0]).toMatchObject({ field: 'supplierId' });

    const zero = await t.post(`${m.c}/expenses`, expense(m, cat.id, { amount: { minor: 0, currency: 'INR' } }), { token: m.token });
    expect(zero.status).toBe(422);
  });

  it('needs the expenses module and an accountant or better', async () => {
    const basic = await moneySetup(t, 'basic');
    const [cat] = await categories(basic);
    const res = await t.post(`${basic.c}/expenses`, expense(basic, cat.id), { token: basic.token });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'PLAN_UPGRADE_REQUIRED', requiredPlan: 'pro' });
    expect((await t.get(`${basic.c}/expenses`, { token: basic.token })).status).toBe(403);

    const m = await moneySetup(t);
    const [cat2] = await categories(m);
    const sales = await joinTeam(t, m.token, { role: 'sales', companyIds: [m.companyId] });
    const denied = await t.post(`${m.c}/expenses`, expense(m, cat2.id), { token: sales.token });
    expect(denied.status).toBe(403);
    const accountant = await joinTeam(t, m.token, { role: 'accountant', companyIds: [m.companyId] });
    const made = await t.post(`${m.c}/expenses`, expense(m, cat2.id), { token: accountant.token });
    expect(made.status).toBe(201);
    expect(made.body.createdBy).toBe(accountant.user.id);
    expect((await t.del(`${m.c}/expenses/${made.body.id}`, { token: accountant.token })).status).toBe(403);
  });

  it('saves with optimistic concurrency, recomputing tax; lists with filters; removes', async () => {
    const m = await moneySetup(t);
    const [cat, other] = await categories(m);
    const a = (await t.post(`${m.c}/expenses`, expense(m, cat.id, { taxCategoryId: m.gst(18), billable: true, notes: 'Diesel for van' }), { token: m.token })).body;
    const b = (await t.post(`${m.c}/expenses`, expense(m, other.id, { date: '2026-09-20', amount: { minor: 3000, currency: 'INR' } }), { token: m.token })).body;

    const saved = await t.put(`${m.c}/expenses/${a.id}`, { ...a, amount: { minor: 23600, currency: 'INR' } }, { token: m.token, headers: { 'if-match': '"v1"' } });
    expect(saved.status).toBe(200);
    expect(saved.headers.etag).toBe('"v2"');
    expect(saved.body).toMatchObject({ number: a.number, version: 2, amount: { minor: 23600 }, taxAmount: { minor: 3600 } });
    const stale = await t.put(`${m.c}/expenses/${a.id}`, a, { token: m.token, headers: { 'if-match': '"v1"' } });
    expect(stale.status).toBe(412);

    const all = await t.get(`${m.c}/expenses`, { token: m.token });
    expect(all.body.data.map((e: { id: string }) => e.id)).toEqual([b.id, a.id]);
    const byCat = await t.get(`${m.c}/expenses`, { token: m.token, query: { categoryId: other.id } });
    expect(byCat.body.data.map((e: { id: string }) => e.id)).toEqual([b.id]);
    expect((await t.get(`${m.c}/expenses`, { token: m.token, query: { billable: true } })).body.data.map((e: { id: string }) => e.id)).toEqual([a.id]);
    expect((await t.get(`${m.c}/expenses`, { token: m.token, query: { q: 'diesel' } })).body.data.map((e: { id: string }) => e.id)).toEqual([a.id]);
    expect((await t.get(`${m.c}/expenses`, { token: m.token, query: { from: '2026-09-15' } })).body.data.map((e: { id: string }) => e.id)).toEqual([b.id]);
    const paged = await t.get(`${m.c}/expenses`, { token: m.token, query: { limit: 1 } });
    expect(paged.body.data).toHaveLength(1);
    const next = await t.get(`${m.c}/expenses`, { token: m.token, query: { limit: 1, cursor: paged.body.nextCursor } });
    expect(next.body.data[0].id).toBe(a.id);

    // Another company cannot see or touch it.
    const stranger = await ownerWithCompany(t, { plan: 'pro' });
    expect((await t.get(`${stranger.c}/expenses/${a.id}`, { token: stranger.token })).status).toBe(404);
    expect((await t.get(`/companies/${m.companyId}/expenses/${a.id}`, { token: stranger.token })).status).toBe(403);

    expect((await t.del(`${m.c}/expenses/${a.id}`, { token: m.token })).status).toBe(204);
    expect((await t.get(`${m.c}/expenses/${a.id}`, { token: m.token })).status).toBe(404);
  });

  it('links attachments through the attachments table', async () => {
    const m = await moneySetup(t);
    const [cat] = await categories(m);
    const att = (id: string) => ({ id, companyId: m.companyId, name: 'receipt.jpg', mimeType: 'image/jpeg', sizeBytes: 10, storageKey: `k/${id}`, status: 'ready' as const, uploadedBy: m.user.id });
    await t.deps.db.insert(schema.attachments).values([att('att_one'), att('att_two')]);

    const created = await t.post(`${m.c}/expenses`, expense(m, cat.id, { attachmentIds: ['att_one'] }), { token: m.token });
    expect(created.body.attachmentIds).toEqual(['att_one']);
    const saved = await t.put(`${m.c}/expenses/${created.body.id}`, { ...created.body, attachmentIds: ['att_two'] }, { token: m.token });
    expect(saved.body.attachmentIds).toEqual(['att_two']);
    const rows = await t.deps.db.select().from(schema.attachments).where(eq(schema.attachments.companyId, m.companyId)).orderBy(schema.attachments.id);
    expect(rows.map((r) => [r.id, r.entityType, r.entityId])).toEqual([
      ['att_one', null, null],
      ['att_two', 'expense', created.body.id],
    ]);
    const missing = await t.post(`${m.c}/expenses`, expense(m, cat.id, { attachmentIds: ['att_ghost'] }), { token: m.token });
    expect(missing.status).toBe(422);
  });

  it('materialises a recurring expense exactly once per period, keeping month ends', async () => {
    const m = await moneySetup(t);
    const [cat] = await categories(m);
    const tpl = await t.post(`${m.c}/expenses`, expense(m, cat.id, { date: '2026-07-31', recurrence: 'monthly', taxCategoryId: m.gst(18), notes: 'Rent' }), { token: m.token });
    expect(tpl.body).toMatchObject({ recurrence: 'monthly', nextRecurrenceDate: '2026-08-31' });
    const weekly = await t.post(`${m.c}/expenses`, expense(m, cat.id, { date: '2026-09-20', recurrence: 'weekly' }), { token: m.token });
    expect(weekly.body.nextRecurrenceDate).toBe('2026-09-27');

    const first = await materializeRecurringExpenses(t.deps, '2026-09-29');
    expect(first.created).toHaveLength(2); // Aug 31 rent, Sep 27 weekly
    expect((await materializeRecurringExpenses(t.deps, '2026-09-29')).created).toHaveLength(0);

    const E = schema.expenses;
    let occurrences = await t.deps.db.select().from(E).where(eq(E.recurringParentId, tpl.body.id)).orderBy(E.date);
    expect(occurrences.map((o) => [o.date, o.recurrence, o.amountMinor, o.taxAmountMinor, o.notes])).toEqual([['2026-08-31', 'none', 11800, 1800, 'Rent']]);
    expect((await t.get(`${m.c}/expenses/${tpl.body.id}`, { token: m.token })).body).toMatchObject({ nextRecurrenceDate: '2026-09-30', version: 2 });

    // Missed runs catch up, one occurrence per period.
    const later = await materializeRecurringExpenses(t.deps, new Date('2026-11-30T12:00:00Z'));
    occurrences = await t.deps.db.select().from(E).where(eq(E.recurringParentId, tpl.body.id)).orderBy(E.date);
    expect(occurrences.map((o) => o.date)).toEqual(['2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30']);
    expect(later.created.length).toBe(3 + 9); // rent Sep–Nov, weekly Oct 4 … Nov 29
    const numbers = (await t.deps.db.select({ n: E.number }).from(E).where(eq(E.companyId, m.companyId))).map((r) => r.n);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect((await t.get(`${m.c}/expenses/${tpl.body.id}`, { token: m.token })).body.nextRecurrenceDate).toBe('2026-12-31');

    const recurring = await t.get(`${m.c}/expenses`, { token: m.token, query: { recurring: true } });
    expect(recurring.body.data.map((e: { id: string }) => e.id).sort()).toEqual([tpl.body.id, weekly.body.id].sort());

    // Changing the frequency restarts the schedule from the template's date; stopping it clears it.
    const quarterly = await t.put(`${m.c}/expenses/${tpl.body.id}`, { ...tpl.body, recurrence: 'quarterly' }, { token: m.token });
    expect(quarterly.body.nextRecurrenceDate).toBe('2026-10-31');
    const stopped = await t.put(`${m.c}/expenses/${tpl.body.id}`, { ...quarterly.body, recurrence: 'none' }, { token: m.token });
    expect(stopped.body.nextRecurrenceDate).toBeUndefined();

    // Deleting the template leaves its occurrences as ordinary expenses.
    expect((await t.del(`${m.c}/expenses/${tpl.body.id}`, { token: m.token })).status).toBe(204);
    const orphans = await t.deps.db.select().from(E).where(and(eq(E.companyId, m.companyId), eq(E.notes, 'Rent')));
    expect(orphans).toHaveLength(4);
    expect(orphans.every((o) => o.recurringParentId === null)).toBe(true);
  });
});
