import { describe, expect, it } from 'vitest';
import { setupApi } from './helpers';
import { invoiceBody, issueInvoice, moneySetup } from './money-fixtures';
import { joinTeam } from './team-helpers';

const t = setupApi();
const ids = (list: { id: string }[]) => list.map((x) => x.id);

describe('search', () => {
  it('finds parties, items, documents and payments, capped per group', async () => {
    const m = await moneySetup(t);
    const rod = await m.item({ name: 'Steel rod 12mm', sku: 'ROD-12', barcode: '8901234567890', hsnCode: null });
    await m.item({ name: 'Copper wire', sku: 'CW-1' });
    const inv = await issueInvoice(t, m);
    const pay = await t.post(`${m.c}/payments`, { direction: 'received', partyId: m.mumbai.id, date: '2026-09-29', amount: { minor: 5000, currency: 'INR' }, currency: 'INR', method: 'cash', accountId: m.cash.id, reference: 'UTR-5521' }, { token: m.token });

    const sunrise = await t.get(`${m.c}/search`, { token: m.token, query: { q: 'sunrise' } });
    expect(sunrise.status).toBe(200);
    expect(ids(sunrise.body.parties)).toEqual([m.mumbai.id]);
    // Documents and payments match on their party's name.
    expect(ids(sunrise.body.documents)).toEqual([inv.id]);
    expect(sunrise.body.documents[0]).toMatchObject({ number: inv.number, partyName: 'Sunrise Retail' });
    expect(ids(sunrise.body.payments)).toEqual([pay.body.id]);
    expect(sunrise.body.items).toEqual([]);

    expect(ids((await t.get(`${m.c}/search`, { token: m.token, query: { q: 'rod-1' } })).body.items)).toEqual([rod]);
    expect(ids((await t.get(`${m.c}/search`, { token: m.token, query: { q: '89012345' } })).body.items)).toEqual([rod]);
    expect(ids((await t.get(`${m.c}/search`, { token: m.token, query: { q: inv.number } })).body.documents)).toEqual([inv.id]);
    expect(ids((await t.get(`${m.c}/search`, { token: m.token, query: { q: 'utr-55' } })).body.payments)).toEqual([pay.body.id]);
    expect(ids((await t.get(`${m.c}/search`, { token: m.token, query: { q: '29AABCG' } })).body.parties)).toEqual([m.bengaluru.id]);
    // LIKE wildcards are literal.
    const wild = await t.get(`${m.c}/search`, { token: m.token, query: { q: '%%' } });
    expect([...wild.body.parties, ...wild.body.items, ...wild.body.documents, ...wild.body.payments]).toEqual([]);

    for (let i = 0; i < 3; i++) await issueInvoice(t, m);
    const capped = await t.get(`${m.c}/search`, { token: m.token, query: { q: 'INV/', limit: 2 } });
    expect(capped.body.documents).toHaveLength(2);
    expect((await t.get(`${m.c}/search`, { token: m.token, query: { q: 'INV/' } })).body.documents).toHaveLength(4);

    // Too short a query breaks the contract.
    expect((await t.get(`${m.c}/search`, { token: m.token, query: { q: 'a' } })).status).toBe(422);

    // Another company's search sees none of it.
    const other = await moneySetup(t);
    const theirs = await t.get(`${other.c}/search`, { token: other.token, query: { q: 'INV/' } });
    expect(theirs.body.documents).toEqual([]);
  });

  it('hides the buying side from sales plans and other branches from restricted users', async () => {
    const pro = await moneySetup(t);
    const bill = await t.post(`${pro.c}/documents`, invoiceBody(pro, { kind: 'purchaseBill', partyId: pro.supplier!.id, supplierDocNumber: 'KS-77', status: 'issued' }), { token: pro.token });
    const found = await t.get(`${pro.c}/search`, { token: pro.token, query: { q: 'konkan' } });
    expect(ids(found.body.parties)).toEqual([pro.supplier!.id]);
    expect(ids(found.body.documents)).toEqual([bill.body.id]);
    expect(ids((await t.get(`${pro.c}/search`, { token: pro.token, query: { q: 'KS-77' } })).body.documents)).toEqual([bill.body.id]);

    const basic = await moneySetup(t, 'basic');
    await issueInvoice(t, basic);
    const sales = await t.get(`${basic.c}/search`, { token: basic.token, query: { q: 'sunrise' } });
    expect(sales.body.documents).toHaveLength(1);

    const other = await t.post(`${pro.c}/branches`, { name: 'Pune', code: 'PNQ', address: { line1: '1 FC Road', city: 'Pune', state: 'Maharashtra', stateCode: '27', postalCode: '411004', country: 'IN' } }, { token: pro.token });
    const member = await joinTeam(t, pro.token, { role: 'accountant', companyIds: [pro.companyId], branchIds: [other.body.id] });
    const restricted = await t.get(`${pro.c}/search`, { token: member.token, query: { q: 'konkan' } });
    expect(ids(restricted.body.parties)).toEqual([pro.supplier!.id]);
    expect(restricted.body.documents).toEqual([]);
  });
});
