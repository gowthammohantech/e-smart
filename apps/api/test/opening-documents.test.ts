import { describe, expect, it } from 'vitest';
import { setupApi } from './helpers';
import { moneySetup } from './money-fixtures';

const t = setupApi();
const inr = (minor: number) => ({ minor, currency: 'INR' });

describe('opening invoices and bills (RULES 6.12)', () => {
  it('imports what was owed, invoice by invoice: paid, aged and on the books only as Opening balances', async () => {
    const m = await moneySetup(t);
    t.setNow('2026-09-29T10:00:00Z');
    const rows = [
      { kind: 'openingInvoice', party: 'Sunrise Retail', number: 'OLD/101', date: '2026-03-10', dueDate: '2026-04-09', amount: inr(500_000) },
      { kind: 'openingInvoice', party: '29AABCG4321K1ZM', number: 'OLD/102', date: '2026-03-20', dueDate: '2026-10-20', amount: inr(120_000) },
      { kind: 'openingBill', party: 'Konkan Steel', number: 'KS-77', date: '2026-03-25', amount: inr(80_000) },
      { kind: 'openingInvoice', party: 'sunrise retail', number: 'old/101', date: '2026-03-10', amount: inr(1) }, // same number again
      { kind: 'openingInvoice', party: 'Nobody Ltd', number: 'X-1', date: '2026-03-01', amount: inr(1_000) },
      { kind: 'openingBill', party: 'Sunrise Retail', number: 'X-2', date: '2026-03-01', amount: inr(1_000) }, // not a supplier
      { kind: 'openingInvoice', party: 'Sunrise Retail', number: 'X-3', date: '2026-10-01', amount: inr(1_000) }, // future
    ];

    const dry = await t.post(`${m.c}/documents/openings/import`, { rows, dryRun: true }, { token: m.token });
    expect(dry.status).toBe(200);
    expect(dry.body).toMatchObject({ created: 3, skipped: 1, invalid: 3 });
    expect(dry.body.results.map((r: { status: string }) => r.status)).toEqual(['created', 'created', 'created', 'duplicate', 'invalid', 'invalid', 'invalid']);
    expect(dry.body.results[1].partyName).toBe('Anand Enterprises');
    expect(dry.body.results[5].issues[0].message).toContain('not a supplier');
    expect((await t.get(`${m.c}/receivables`, { token: m.token })).body.total.minor).toBe(0);

    const done = await t.post(`${m.c}/documents/openings/import`, { rows: rows.slice(0, 3) }, { token: m.token });
    expect(done.body.created).toBe(3);
    const [old101, old102] = done.body.results.map((r: { id: string }) => r.id);

    // Aged like invoices: OLD/101 fell due months ago, OLD/102 is not yet due.
    const aging = (await t.get(`${m.c}/receivables`, { token: m.token })).body;
    expect(aging.total).toEqual(inr(620_000));
    expect(aging.documents.find((d: { document: { id: string } }) => d.document.id === old101).document).toMatchObject({ kind: 'openingInvoice', number: 'OLD/101', status: 'overdue' });
    expect((await t.get(`${m.c}/payables`, { token: m.token })).body.total).toEqual(inr(80_000));

    // Paid off like any invoice.
    const pay = await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.bengaluru.id, date: '2026-09-29', amount: inr(120_000), currency: 'INR', method: 'cash', accountId: m.cash.id, allocations: [{ documentId: old102, amount: inr(120_000) }] },
      { token: m.token },
    );
    expect(pay.status).toBe(201);
    expect((await t.get(`${m.c}/documents/${old102}`, { token: m.token })).body.status).toBe('paid');

    // On the books: the parties and Opening balances, no sales, purchases or GST.
    const tb = (await t.get(`${m.c}/reports/trial-balance`, { token: m.token, query: { from: '2025-04-01', to: '2027-03-31' } })).body;
    const row = (account: string) => tb.rows.find((r: { account: string }) => r.account === account)?.closing.minor ?? 0;
    expect(tb.totalDebit).toEqual(tb.totalCredit);
    expect(row(`party:${m.mumbai.id}`)).toBe(500_000);
    expect(row(`party:${m.supplier!.id}`)).toBe(-80_000);
    expect(row('sys:openingDifference')).toBe(-(500_000 + 120_000 - 80_000));
    expect(row('sys:sales')).toBe(0);
    expect(row('sys:purchases')).toBe(0);
    expect(row('sys:outputCgst') + row('sys:outputSgst') + row('sys:outputIgst')).toBe(0);

    // Not in the invoice list or GST: an opening invoice isn't a sale of this period.
    const invoices = (await t.get(`${m.c}/documents`, { token: m.token, query: { kind: 'invoice' } })).body.data;
    expect(invoices.some((d: { kind: string }) => d.kind === 'openingInvoice')).toBe(false);
    void old101;
  });

  it('refuses a party that already has an opening balance, so nothing is counted twice', async () => {
    const m = await moneySetup(t);
    const party = (await t.get(`${m.c}/parties/${m.mumbai.id}`, { token: m.token })).body;
    await t.put(`${m.c}/parties/${m.mumbai.id}`, { ...party, openingBalance: inr(10_000) }, { token: m.token });
    const res = await t.post(`${m.c}/documents/openings/import`, { rows: [{ kind: 'openingInvoice', party: 'Sunrise Retail', number: 'A-1', date: '2026-03-01', amount: inr(10_000) }] }, { token: m.token });
    expect(res.body.invalid).toBe(1);
    expect(res.body.results[0].issues[0].message).toContain('already has an opening balance');
  });

  it('keeps an opening invoice out of finalising and conversions', async () => {
    const m = await moneySetup(t);
    t.setNow('2026-09-29T10:00:00Z');
    const done = await t.post(`${m.c}/documents/openings/import`, { rows: [{ kind: 'openingInvoice', party: 'Sunrise Retail', number: 'B-1', date: '2026-03-01', amount: inr(5_000) }] }, { token: m.token });
    const id = done.body.results[0].id;
    expect((await t.post(`${m.c}/documents/${id}/convert`, { kind: 'creditNote' }, { token: m.token })).status).toBeGreaterThanOrEqual(400);
    expect((await t.del(`${m.c}/documents/${id}`, { token: m.token })).status).toBe(409);
  });
});

describe('opening documents with the rest of the books', () => {
  it('stand on party statements, so the integrity check agrees, and skip required document fields', async () => {
    const m = await moneySetup(t);
    t.setNow('2026-09-29T10:00:00Z');
    await t.post(`${m.c}/custom-fields`, { entity: 'document', label: 'Vehicle no.', kind: 'text', required: true }, { token: m.token });
    const res = await t.post(
      `${m.c}/documents/openings/import`,
      { rows: [{ kind: 'openingInvoice', party: 'Sunrise Retail', number: 'OLD/1', date: '2026-03-10', amount: inr(500_000) }, { kind: 'openingBill', party: 'Konkan Steel', number: 'KS-1', date: '2026-03-12', amount: inr(80_000) }] },
      { token: m.token },
    );
    expect(res.body.created).toBe(2);
    const customer = await t.get(`${m.c}/parties/${m.mumbai.id}/statement`, { token: m.token });
    expect(customer.body.entries.map((e: { number: string }) => e.number)).toContain('OLD/1');
    expect(customer.body.closingBalance.minor).toBe(500_000);
    const supplier = await t.get(`${m.c}/parties/${m.supplier!.id}/statement`, { token: m.token });
    expect(supplier.body.closingBalance.minor).toBe(80_000);
    const integrity = await t.get(`${m.c}/books/integrity`, { token: m.token, query: { to: '2026-09-30' } });
    expect(integrity.body.checks.filter((c: { ok: boolean }) => !c.ok)).toEqual([]);
  });
});
