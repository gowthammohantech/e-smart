import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '@esmart/db';
import { notify } from '../src/lib/notify';
import { notifyOverdueInvoices } from '../src/modules/documents/overdue';
import { ownerWithCompany, setupApi } from './helpers';
import { issueInvoice, moneySetup } from './money-fixtures';

const t = setupApi();
const pushes = () => t.providers.outbox.messages.filter((m) => m.channel === 'push');

describe('push notifications', () => {
  it('skips the kinds a person muted, and keeps them in the app', async () => {
    const { token, company } = await ownerWithCompany(t);
    await t.post('/me/push-tokens', { token: 'ExponentPushToken[owner]', provider: 'expo' }, { token });
    const saved = await t.put('/me/notification-preferences', { pushMuted: ['lowStock', 'lowStock'] }, { token });
    expect(saved.body).toEqual({ pushMuted: ['lowStock'] });
    expect((await t.get('/me/notification-preferences', { token })).body).toEqual({ pushMuted: ['lowStock'] });

    await notify(t.deps.db, t.deps, { companyId: company.id!, kind: 'lowStock', title: 'Low', body: 'x' });
    await notify(t.deps.db, t.deps, { companyId: company.id!, kind: 'paymentReceived', title: 'Paid', body: 'y' });
    await t.runJobs();
    expect(pushes().map((m) => m.subject)).toEqual(['Paid']);
    expect(await t.deps.db.select().from(schema.notifications).where(eq(schema.notifications.companyId, company.id!))).toHaveLength(2);
  });

  it('forgets devices the push service says are gone, at once or from the receipt', async () => {
    const { token, company } = await ownerWithCompany(t);
    await t.post('/me/push-tokens', { token: 'ExponentPushToken[gone]', provider: 'expo' }, { token });
    await t.post('/me/push-tokens', { token: 'ExponentPushToken[later]', provider: 'expo' }, { token });
    const send = vi.spyOn(t.deps.providers.push, 'send').mockResolvedValue({ tickets: [{ token: 'ExponentPushToken[later]', ticketId: 'tkt_1' }], deadTokens: ['ExponentPushToken[gone]'] });
    const receipts = vi.spyOn(t.deps.providers.push, 'deadTickets').mockResolvedValue(['tkt_1']);
    await notify(t.deps.db, t.deps, { companyId: company.id!, kind: 'system', title: 'Hi', body: 'x' });
    await t.runJobs();
    expect((await t.deps.db.select().from(schema.pushTokens)).map((r) => r.token)).toEqual(['ExponentPushToken[later]']);
    // The receipt check runs 15 minutes later.
    t.setNow(new Date(Date.now() + 16 * 60_000));
    await t.runJobs();
    expect(await t.deps.db.select().from(schema.pushTokens)).toHaveLength(0);
    send.mockRestore();
    receipts.mockRestore();
  });

  it('tells the team once when an invoice falls overdue, and not about old ones', async () => {
    const m = await moneySetup(t);
    // Issued in date order: an invoice can't be dated before one already issued.
    const old = await issueInvoice(t, m, { date: '2026-06-01', dueDate: '2026-06-15' });
    const recent = await issueInvoice(t, m, { date: '2026-09-29', dueDate: '2026-10-05' });
    // Two days after the recent one fell due.
    t.setNow('2026-10-07T04:30:00Z');
    expect(await notifyOverdueInvoices(t.deps)).toBe(1);
    expect(await notifyOverdueInvoices(t.deps)).toBe(0);
    const notes = await t.deps.db.select().from(schema.notifications).where(eq(schema.notifications.kind, 'invoiceOverdue'));
    expect(notes.map((n) => n.entityId)).toEqual([recent.id]);
    expect(notes[0].title).toContain('is overdue');
    expect(notes.some((n) => n.entityId === old.id)).toBe(false);
  });
});
