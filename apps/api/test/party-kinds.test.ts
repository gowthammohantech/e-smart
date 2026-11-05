import { describe, expect, it } from 'vitest';
import { MUMBAI, setupApi } from './helpers';
import { line, moneySetup, type Money } from './money-fixtures';

const t = setupApi();
const inr = (minor: number) => ({ minor, currency: 'INR' });

const newParty = (m: Money, body: Record<string, unknown>) =>
  t.post(`${m.c}/parties`, { currency: 'INR', openingBalance: inr(0), paymentTermsDays: 30, billingAddress: MUMBAI, ...body }, { token: m.token });

describe('parties that are both, and general contacts', () => {
  it('lets a party that is both buy and sell under one ledger, with its opening on the side it says', async () => {
    const m = await moneySetup(t);
    // We owe them 1,000 from before.
    const both = await newParty(m, { kind: 'both', name: 'Ravi Agencies', openingBalance: inr(100_000), openingBalanceSide: 'cr' });
    expect(both.status).toBe(201);
    expect(both.body.code).toBe('B-001');
    expect(both.body.openingBalanceSide).toBe('cr');

    // Among the customers and among the suppliers.
    const customers = await t.get(`${m.c}/parties`, { token: m.token, query: { kind: 'customer' } });
    const suppliers = await t.get(`${m.c}/parties`, { token: m.token, query: { kind: 'supplier' } });
    expect(customers.body.data.map((p: { id: string }) => p.id)).toContain(both.body.id);
    expect(suppliers.body.data.map((p: { id: string }) => p.id)).toContain(both.body.id);

    // An invoice to them and a bill from them.
    const inv = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: both.body.id, date: '2026-09-29', currency: 'INR', lines: [line(m.gst(18), { quantity: 1 })], status: 'issued' }, { token: m.token });
    expect(inv.status).toBe(201);
    const bill = await t.post(
      `${m.c}/documents`,
      { kind: 'purchaseBill', partyId: both.body.id, date: '2026-09-29', currency: 'INR', supplierDocNumber: 'RA/77', lines: [line(m.gst(18), { quantity: 2 })], status: 'issued' },
      { token: m.token },
    );
    expect(bill.status).toBe(201);
    const invTotal = inv.body.totals.grandTotal.minor;
    const billTotal = bill.body.totals.grandTotal.minor;

    // What they owe on invoices, and what we owe them: the bill plus the opening.
    const party = await t.get(`${m.c}/parties/${both.body.id}`, { token: m.token });
    expect(party.body.outstanding.minor).toBe(invTotal);
    expect(party.body.payable.minor).toBe(billTotal + 100_000);

    // One account: the statement reads like a customer's, the bill and the opening on the credit side.
    const st = await t.get(`${m.c}/parties/${both.body.id}/statement`, { token: m.token });
    expect(st.body.openingBalance.minor).toBe(-100_000);
    expect(st.body.closingBalance.minor).toBe(-100_000 + invTotal - billTotal);

    // And the trial balance agrees, in Sundry Debtors.
    const tb = await t.get(`${m.c}/reports/trial-balance`, { token: m.token, query: { from: '2026-04-01', to: '2027-03-31' } });
    const row = tb.body.rows.find((r: { account: string }) => r.account === `party:${both.body.id}`);
    expect(row.closing.minor).toBe(-100_000 + invTotal - billTotal);
    expect(row.group).toBe('sundryDebtors');
    expect(tb.body.totalDebit).toEqual(tb.body.totalCredit);
  });

  it('keeps a general contact off documents, payments and the books', async () => {
    const m = await moneySetup(t);
    const owed = await newParty(m, { kind: 'general', name: 'Landlord', openingBalance: inr(5_000) });
    expect(owed.status).toBe(422);
    expect(owed.body.issues[0].field).toBe('openingBalance');

    const landlord = await newParty(m, { kind: 'general', name: 'Landlord' });
    expect(landlord.status).toBe(201);
    expect(landlord.body.code).toBe('G-001');
    const inv = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: landlord.body.id, date: '2026-09-29', currency: 'INR', lines: [line(m.gst(18))] }, { token: m.token });
    expect(inv.status).toBe(422);
    const pay = await t.post(`${m.c}/payments`, { direction: 'paid', partyId: landlord.body.id, date: '2026-09-29', amount: inr(1_000), currency: 'INR', method: 'cash', accountId: m.cash.id }, { token: m.token });
    expect(pay.status).toBe(422);

    // Listed as general contacts only.
    const general = await t.get(`${m.c}/parties`, { token: m.token, query: { kind: 'general' } });
    expect(general.body.data.map((p: { id: string }) => p.id)).toEqual([landlord.body.id]);
    const customers = await t.get(`${m.c}/parties`, { token: m.token, query: { kind: 'customer' } });
    expect(customers.body.data.map((p: { id: string }) => p.id)).not.toContain(landlord.body.id);
  });

  it('reads a supplier opening given as Dr as an advance we paid them', async () => {
    const m = await moneySetup(t);
    const s = await newParty(m, { kind: 'supplier', name: 'Prepaid Mills', openingBalance: inr(20_000), openingBalanceSide: 'dr' });
    expect(s.status).toBe(201);
    const party = await t.get(`${m.c}/parties/${s.body.id}`, { token: m.token });
    expect(party.body.outstanding.minor).toBe(0);
    expect(party.body.advance.minor).toBe(20_000);
    const st = await t.get(`${m.c}/parties/${s.body.id}/statement`, { token: m.token });
    expect(st.body.openingBalance.minor).toBe(-20_000);
  });

  it('needs the purchases module for a party that is both', async () => {
    const m = await moneySetup(t, 'basic');
    const res = await newParty(m, { kind: 'both', name: 'Ravi Agencies' });
    expect(res.body.code).toBe('PLAN_UPGRADE_REQUIRED');
  });
});
