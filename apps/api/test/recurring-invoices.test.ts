import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { issueRecurringInvoices } from '../src/modules/documents/recurring';
import { setupApi } from './helpers';
import { invoiceBody, issueInvoice, moneySetup } from './money-fixtures';

const t = setupApi();
beforeEach(() => t.setNow('2026-08-31T10:00:00Z'));

/** The daily job as it runs on `day`, with the clock on that day. */
const runOn = (day: string) => {
  t.setNow(`${day}T00:15:00+05:30`);
  return issueRecurringInvoices(t.deps, day);
};
/** moneySetup moves the clock; put it back where the test starts. */
const setup = async (day = '2026-08-31') => {
  const m = await moneySetup(t);
  t.setNow(`${day}T10:00:00Z`);
  return m;
};

describe('recurring invoices', () => {
  it('issues a copy on each date of the series, keeps month ends, and never twice', async () => {
    const m = await setup();
    // Due 15 days after its date; on the 31st, so the series has to hold month ends.
    const inv = await issueInvoice(t, m, { date: '2026-08-31', dueDate: '2026-09-15' });
    const set = await t.put(`${m.c}/documents/${inv.id}/recurrence`, { recurrence: 'monthly', endDate: '2026-12-31' }, { token: m.token, headers: { 'if-match': `"v${inv.version}"` } });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ recurrence: 'monthly', nextRecurrenceDate: '2026-09-30', recurrenceEndDate: '2026-12-31' });

    // Missed for two months: it catches up on both, each with its own number and due date.
    const run = await runOn('2026-10-31');
    expect(run.created).toHaveLength(2);
    expect(run.failed).toEqual([]);
    const issued = await Promise.all(run.created.map(async (id) => (await t.get(`${m.c}/documents/${id}`, { token: m.token })).body));
    expect(issued.map((d) => [d.date, d.dueDate, d.recurringParentId]).sort()).toEqual([
      ['2026-09-30', '2026-10-15', inv.id],
      ['2026-10-31', '2026-11-15', inv.id],
    ]);
    expect(new Set(issued.map((d) => d.number)).size).toBe(2);
    expect(issued.every((d) => d.totals.grandTotal.minor === inv.totals.grandTotal.minor && d.status !== 'draft')).toBe(true);

    // A rerun the same day issues nothing more.
    expect((await runOn('2026-10-31')).created).toEqual([]);
    const template = await t.get(`${m.c}/documents/${inv.id}`, { token: m.token });
    expect(template.body.nextRecurrenceDate).toBe('2026-11-30');

    // The series ends on its end date: November's copy, then nothing.
    expect((await runOn('2027-02-28')).created).toHaveLength(2);
    const ended = await t.get(`${m.c}/documents/${inv.id}`, { token: m.token });
    expect(ended.body.nextRecurrenceDate).toBeUndefined();

    // Only the series lists it.
    const recurring = await t.get(`${m.c}/documents`, { token: m.token, query: { kind: 'invoice', recurring: true } });
    expect(recurring.body.data.map((d: { id: string }) => d.id)).toEqual([inv.id]);
  });

  it('starts from the next date after today, not back-dated, and stops when set to none', async () => {
    const m = await setup();
    const inv = await issueInvoice(t, m, { date: '2026-06-10' });
    const set = await t.put(`${m.c}/documents/${inv.id}/recurrence`, { recurrence: 'monthly' }, { token: m.token, headers: { 'if-match': `"v${inv.version}"` } });
    expect(set.body.nextRecurrenceDate).toBe('2026-09-10');
    const off = await t.put(`${m.c}/documents/${inv.id}/recurrence`, { recurrence: 'none' }, { token: m.token, headers: { 'if-match': `"v${set.body.version}"` } });
    expect(off.body.recurrence).toBe('none');
    expect(off.body.nextRecurrenceDate).toBeUndefined();
    expect((await runOn('2026-12-31')).created).toEqual([]);
  });

  it('only repeats an issued invoice that is not itself a copy', async () => {
    const m = await setup();
    const draft = await t.post(`${m.c}/documents`, invoiceBody(m, { date: '2026-08-31' }), { token: m.token });
    expect(draft.status).toBe(201);
    const refused = await t.put(`${m.c}/documents/${draft.body.id}/recurrence`, { recurrence: 'monthly' }, { token: m.token, headers: { 'if-match': `"v${draft.body.version}"` } });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('NOT_RECURRABLE');

    const inv = await issueInvoice(t, m, { date: '2026-07-31' });
    await t.put(`${m.c}/documents/${inv.id}/recurrence`, { recurrence: 'monthly' }, { token: m.token, headers: { 'if-match': `"v${inv.version}"` } });
    const [copyId] = (await runOn('2026-08-31')).created;
    const copy = await t.get(`${m.c}/documents/${copyId}`, { token: m.token });
    const again = await t.put(`${m.c}/documents/${copyId}/recurrence`, { recurrence: 'monthly' }, { token: m.token, headers: { 'if-match': `"v${copy.body.version}"` } });
    expect(again.body.code).toBe('NOT_RECURRABLE');
  });

  it('holds a series whose copy cannot be issued, says so, and emails the copies it can', async () => {
    const m = await setup();
    const inv = await issueInvoice(t, m, { date: '2026-07-31' });
    await t.put(`${m.c}/documents/${inv.id}/recurrence`, { recurrence: 'monthly', autoSend: true }, { token: m.token, headers: { 'if-match': `"v${inv.version}"` } });

    const sent = await runOn('2026-08-31');
    expect(sent.created).toHaveLength(1);
    expect(t.providers.outbox.last('email', 'accounts@sunrise.example')).toBeDefined();

    // September closed: the copy for the 30th can't be issued, so the series waits there.
    await t.deps.db.update(schema.companies).set({ lockedThroughDate: '2026-09-30' }).where(eq(schema.companies.id, m.companyId));
    const held = await runOn('2026-09-30');
    expect(held.created).toEqual([]);
    expect(held.failed).toEqual([inv.id]);
    const template = await t.get(`${m.c}/documents/${inv.id}`, { token: m.token });
    expect(template.body.nextRecurrenceDate).toBe('2026-09-30');
    const notes = await t.deps.db.select().from(schema.notifications).where(eq(schema.notifications.companyId, m.companyId));
    expect(notes.some((n) => n.title.includes(`Recurring invoice ${inv.number} not issued`))).toBe(true);
  });
});
