import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { invoiceBody, issueInvoice, moneySetup } from './money-fixtures';

const t = setupApi();

const SHIP_TO = { name: 'Site office', gstin: '29aabcs1234k1z5', address: { line1: '9 Dock Road', city: 'Mangaluru', state: 'Karnataka', stateCode: '29', postalCode: '575001', country: 'IN' } };

describe('what an invoice carries beyond its lines', () => {
  it('names its charges, ships to a consignee and goes with a transporter; each can be cleared', async () => {
    const m = await moneySetup(t);
    await t.deps.db.insert(schema.transporters).values({ id: 'trn_test_1', companyId: m.companyId, name: 'Konkan Roadways', transporterId: '27AAACK1234L1Z5' });

    const res = await t.post(`${m.c}/documents`, invoiceBody(m, { charges: { minor: 5000, currency: 'INR' }, chargesKind: 'freight', shipTo: SHIP_TO, transporterId: 'trn_test_1' }), { token: m.token });
    expect(res.status, res.raw).toBe(201);
    expect(res.body).toMatchObject({ chargesKind: 'freight', transporterId: 'trn_test_1', shipTo: { name: 'Site office', gstin: '29AABCS1234K1Z5', address: { city: 'Mangaluru' } } });

    // No charges, no name for them; null clears the consignee and the transporter.
    const cleared = await t.patch(`${m.c}/documents/${res.body.id}`, invoiceBody(m, { charges: { minor: 0, currency: 'INR' }, chargesKind: 'freight', shipTo: null, transporterId: null }), { token: m.token });
    expect(cleared.status, cleared.raw).toBe(200);
    expect(cleared.body.chargesKind).toBeUndefined();
    expect(cleared.body.shipTo).toBeUndefined();
    expect(cleared.body.transporterId).toBeUndefined();

    const unknown = await t.post(`${m.c}/documents`, invoiceBody(m, { transporterId: 'trn_nope' }), { token: m.token });
    expect(unknown.status).toBe(422);
    expect(unknown.body.issues[0]).toMatchObject({ field: 'transporterId' });
  });

  it('reports on several customers at once', async () => {
    const m = await moneySetup(t);
    await issueInvoice(t, m, { date: '2026-09-20' });
    await issueInvoice(t, m, { partyId: m.bengaluru.id, date: '2026-09-21' });
    const range = { from: '2026-09-01', to: '2026-09-30' };
    const count = async (partyId?: string) =>
      (await t.get(`${m.c}/report-data/sales-summary`, { token: m.token, query: { ...range, ...(partyId && { partyId }) } })).body.count as number;
    expect(await count()).toBe(2);
    expect(await count(m.mumbai.id)).toBe(1);
    expect(await count(`${m.mumbai.id},${m.bengaluru.id}`)).toBe(2);
  });
});
