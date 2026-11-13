import { describe, expect, it } from 'vitest';
import { setupApi } from './helpers';
import { invoiceBody, issueInvoice, moneySetup } from './money-fixtures';

const t = setupApi();

describe('invoices issue in date order', () => {
  it('refuses one dated before an invoice already issued; the same day and later are taken', async () => {
    const m = await moneySetup(t);
    const later = await issueInvoice(t, m, { date: '2026-09-25' });

    const early = await t.post(`${m.c}/documents`, invoiceBody(m, { date: '2026-09-20', status: 'issued' }), { token: m.token });
    expect(early.status).toBe(422);
    expect(early.body.code).toBe('DATE_BEFORE_PREVIOUS');
    expect(early.body.issues[0]).toMatchObject({ field: 'date' });
    expect(early.body.issues[0].message).toContain(later.number);

    // A draft dated earlier can be saved; issuing it is what is refused.
    const draft = await t.post(`${m.c}/documents`, invoiceBody(m, { date: '2026-09-20' }), { token: m.token });
    expect(draft.status).toBe(201);
    expect((await t.post(`${m.c}/documents/${draft.body.id}/finalize`, {}, { token: m.token })).status).toBe(422);

    expect((await issueInvoice(t, m, { date: '2026-09-25' })).number > later.number).toBe(true);
    expect((await issueInvoice(t, m, { date: '2026-09-28' })).number > later.number).toBe(true);
  });

  it('still takes a late entry into an earlier financial year, which keeps its own numbers', async () => {
    const m = await moneySetup(t);
    await issueInvoice(t, m, { date: '2026-09-25' });
    const lastYear = await t.post(`${m.c}/documents`, invoiceBody(m, { date: '2026-03-20', status: 'issued' }), { token: m.token });
    expect(lastYear.status, lastYear.raw).toBe(201);
    expect(lastYear.body.number).toContain('25-26');
  });
});
