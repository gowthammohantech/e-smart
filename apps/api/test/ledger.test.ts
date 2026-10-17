import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { invoiceBody, issueInvoice, moneySetup, pdfText } from './money-fixtures';

const t = setupApi();

describe('ledger', () => {
  it('ages receivables into buckets, by party and by document', async () => {
    const m = await moneySetup(t);
    t.setNow('2026-09-29T10:00:00Z');
    // Due 2026-10-29: current. Due 2026-09-14: 15 days late. Due 2026-07-01: 90 days late.
    const current = await issueInvoice(t, m);
    const late = await issueInvoice(t, m, { date: '2026-08-15', dueDate: '2026-09-14' });
    const old = await issueInvoice(t, m, { partyId: m.bengaluru.id, date: '2026-06-01', dueDate: '2026-07-01' });
    await t.post(`${m.c}/payments`, { direction: 'received', partyId: m.mumbai.id, date: '2026-09-29', amount: { minor: 36000, currency: 'INR' }, currency: 'INR', method: 'cash', accountId: m.cash.id, allocations: [{ documentId: late.id, amount: { minor: 36000, currency: 'INR' } }] }, { token: m.token });
    const paid = await issueInvoice(t, m);
    await t.post(`${m.c}/payments`, { direction: 'received', partyId: m.mumbai.id, date: '2026-09-29', amount: { minor: 236000, currency: 'INR' }, currency: 'INR', method: 'cash', accountId: m.cash.id, allocations: [{ documentId: paid.id, amount: { minor: 236000, currency: 'INR' } }] }, { token: m.token });
    await t.post(`${m.c}/documents`, invoiceBody(m), { token: m.token }); // a draft: not a receivable

    const res = await t.get(`${m.c}/receivables`, { token: m.token });
    expect(res.status).toBe(200);
    expect(res.body.asOf).toBe('2026-09-29');
    expect(res.body.total).toEqual({ minor: 236000 + 200000 + 236000, currency: 'INR' });
    const bucket = (key: string) => res.body.buckets.find((b: { key: string }) => b.key === key);
    expect(bucket('current')).toEqual({ key: 'current', amount: { minor: 236000, currency: 'INR' }, count: 1 });
    expect(bucket('d1_30')).toMatchObject({ amount: { minor: 200000 }, count: 1 });
    expect(bucket('d61_90')).toMatchObject({ amount: { minor: 236000 }, count: 1 });
    expect(res.body.byParty).toEqual([
      { partyId: m.mumbai.id, partyName: 'Sunrise Retail', outstanding: { minor: 436000, currency: 'INR' }, oldestDaysOverdue: 15 },
      { partyId: m.bengaluru.id, partyName: 'Anand Enterprises', outstanding: { minor: 236000, currency: 'INR' }, oldestDaysOverdue: 90 },
    ]);
    expect(res.body.documents.map((d: { document: { id: string }; daysOverdue: number }) => [d.document.id, d.daysOverdue])).toEqual([
      [old.id, 90],
      [late.id, 15],
      [current.id, -30],
    ]);
    expect(res.body.documents[1]).toMatchObject({ allocated: { minor: 36000 }, outstanding: { minor: 200000 }, bucket: 'd1_30', document: { status: 'overdue' } });

    const onlyOne = await t.get(`${m.c}/receivables`, { token: m.token, query: { partyId: m.bengaluru.id } });
    expect(onlyOne.body.total.minor).toBe(236000);
    const asOf = await t.get(`${m.c}/receivables`, { token: m.token, query: { asOf: '2026-12-01' } });
    expect(asOf.body.buckets.find((b: { key: string }) => b.key === 'd90plus').count).toBe(1);
  });

  it('reports payables on the full plan only', async () => {
    const basic = await moneySetup(t, 'basic');
    expect((await t.get(`${basic.c}/payables`, { token: basic.token })).status).toBe(403);

    const m = await moneySetup(t);
    await t.post(`${m.c}/documents`, invoiceBody(m, { kind: 'purchaseBill', partyId: m.supplier!.id, status: 'issued' }), { token: m.token });
    const res = await t.get(`${m.c}/payables`, { token: m.token });
    expect(res.body.total).toEqual({ minor: 236000, currency: 'INR' });
    expect(res.body.byParty[0].partyName).toBe('Konkan Steel');
  });

  it('sends a payment reminder covering every open invoice, with payment links', async () => {
    const m = await moneySetup(t);
    const a = await issueInvoice(t, m);
    const b = await issueInvoice(t, m);
    const res = await t.post(`${m.c}/receivables/reminders`, { partyId: m.mumbai.id, channel: 'whatsapp' }, { token: m.token });
    expect(res.status).toBe(202);
    const msg = t.providers.outbox.last('whatsapp', '+919800000001');
    expect(msg?.text).toContain('INR 4720.00 is outstanding on 2 invoices');
    expect(msg?.text).toContain('INV/26-27/0001: INR 2360.00');
    const [delivery] = await t.deps.db.select().from(schema.messageDeliveries).where(eq(schema.messageDeliveries.purpose, 'paymentReminder'));
    expect(delivery).toMatchObject({ channel: 'whatsapp', status: 'sent', partyId: m.mumbai.id, includePaymentLink: true });
    const covered = await t.deps.db.select().from(schema.reminderDocuments).where(eq(schema.reminderDocuments.deliveryId, delivery.id));
    expect(covered.map((r) => r.documentId).sort()).toEqual([a.id, b.id].sort());
    expect(await t.deps.db.select().from(schema.paymentLinks)).toHaveLength(2);

    const noPhone = await t.post(`${m.c}/receivables/reminders`, { partyId: m.bengaluru.id, channel: 'email' }, { token: m.token });
    expect(noPhone.status).toBe(422);
    const nothing = await t.post(`${m.c}/receivables/reminders`, { partyId: m.bengaluru.id, channel: 'sms' }, { token: m.token });
    expect(nothing.body.code).toBe('NOTHING_OUTSTANDING');
  });

  it('builds a party statement with a running balance, as JSON or PDF', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.parties).set({ openingBalanceMinor: 50000 }).where(eq(schema.parties.id, m.mumbai.id));
    t.setNow('2026-09-29T10:00:00Z');
    const early = await issueInvoice(t, m, { date: '2026-08-01' });
    const inv = await issueInvoice(t, m, { date: '2026-09-10' });
    const pay = await t.post(`${m.c}/payments`, { direction: 'received', partyId: m.mumbai.id, date: '2026-09-20', amount: { minor: 100000, currency: 'INR' }, currency: 'INR', method: 'cash', accountId: m.cash.id, allocations: [{ documentId: inv.id, amount: { minor: 100000, currency: 'INR' } }] }, { token: m.token });

    const all = await t.get(`${m.c}/parties/${m.mumbai.id}/statement`, { token: m.token });
    expect(all.status).toBe(200);
    expect(all.body.openingBalance).toEqual({ minor: 50000, currency: 'INR' });
    expect(all.body.entries.map((e: { entityType: string; entityId: string; debit: { minor: number }; credit: { minor: number }; balance: { minor: number } }) => [e.entityType, e.entityId, e.debit.minor, e.credit.minor, e.balance.minor])).toEqual([
      ['opening', m.mumbai.id, 50000, 0, 50000],
      ['document', early.id, 236000, 0, 286000],
      ['document', inv.id, 236000, 0, 522000],
      ['payment', pay.body.id, 0, 100000, 422000],
    ]);
    expect(all.body.closingBalance.minor).toBe(422000);

    const september = await t.get(`${m.c}/parties/${m.mumbai.id}/statement`, { token: m.token, query: { from: '2026-09-01', to: '2026-09-15' } });
    expect(september.body.openingBalance.minor).toBe(286000);
    expect(september.body.entries.map((e: { number: string }) => e.number)).toEqual(['Opening balance', inv.number]);
    expect(september.body.closingBalance.minor).toBe(522000);

    const pdf = await t.get(`${m.c}/parties/${m.mumbai.id}/statement`, { token: m.token, headers: { accept: 'application/pdf' } });
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdfText(pdf.raw)).toContain('STATEMENT OF ACCOUNT');
  });
});
