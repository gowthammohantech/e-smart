import { describe, expect, it } from 'vitest';
import { setupApi } from './helpers';
import { invoiceBody, moneySetup } from './money-fixtures';

const t = setupApi();

describe('proforma invoices', () => {
  it('numbers its own series, posts nothing, takes no payment, and becomes the invoice', async () => {
    const m = await moneySetup(t);
    const pi = await t.post(`${m.c}/documents`, invoiceBody(m, { kind: 'proforma', status: 'sent', validUntil: '2026-10-15' }), { token: m.token });
    expect(pi.status).toBe(201);
    expect(pi.body.number).toMatch(/^PI\//);
    expect(pi.body.status).toBe('sent');

    // Not on the books: no sales, no tax, nothing owed.
    const tb = await t.get(`${m.c}/reports/trial-balance`, { token: m.token, query: { from: '2026-04-01', to: '2027-03-31' } });
    expect(tb.body.rows.find((r: { account: string }) => r.account === 'sys:sales')).toBeUndefined();
    const party = await t.get(`${m.c}/parties/${m.mumbai.id}`, { token: m.token });
    expect(party.body.outstanding.minor).toBe(0);

    // Money can't be set against it; an advance against the customer can.
    const pay = await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.mumbai.id, date: '2026-09-29', amount: { minor: 1_000, currency: 'INR' }, currency: 'INR', method: 'cash', accountId: m.cash.id, allocations: [{ documentId: pi.body.id, amount: { minor: 1_000, currency: 'INR' } }] },
      { token: m.token },
    );
    expect(pay.status).toBe(422);

    // The customer agrees: it becomes the tax invoice, which is on the books.
    const inv = await t.post(`${m.c}/documents/${pi.body.id}/convert`, { targetKind: 'invoice' }, { token: m.token });
    expect(inv.status).toBe(201);
    expect(inv.body.kind).toBe('invoice');
    expect(inv.body.sourceDocumentId).toBe(pi.body.id);
    expect(inv.body.totals.grandTotal).toEqual(pi.body.totals.grandTotal);
  });

  it('is made from a quote', async () => {
    const m = await moneySetup(t);
    const qt = await t.post(`${m.c}/documents`, invoiceBody(m, { kind: 'quote', status: 'sent' }), { token: m.token });
    const pi = await t.post(`${m.c}/documents/${qt.body.id}/convert`, { targetKind: 'proforma' }, { token: m.token });
    expect(pi.status).toBe(201);
    expect(pi.body.kind).toBe('proforma');
  });
});
