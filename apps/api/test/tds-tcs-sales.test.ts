import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { documentRow, invoiceBody, line, moneySetup, type Money } from './money-fixtures';

const t = setupApi();

const inr = (minor: number) => ({ minor, currency: 'INR' });
const FY = { from: '2026-04-01', to: '2027-03-31' };

/** The fixture pins its own day; these run on 6 November 2026, after the reverse-charge cutover. */
async function setup() {
  const m = await moneySetup(t);
  t.setNow('2026-11-06T10:00:00Z');
  return m;
}

async function trialRow(m: Money) {
  const tb = (await t.get(`${m.c}/reports/trial-balance`, { token: m.token, query: FY })).body;
  expect(tb.totalDebit).toEqual(tb.totalCredit);
  return (a: string) => tb.rows.find((r: { account: string }) => r.account === a)?.closing.minor ?? 0;
}

describe('TDS the customer will deduct from an invoice (RULES 4.14)', () => {
  it('expects TDS on the taxable value, posts none, and the receipt takes it to TDS receivable under its section', async () => {
    const m = await setup();
    // 2 × ₹1,000 + 18% = ₹2,360; 194J(b) at 10% of the ₹2,000 before GST.
    const inv = await t.post(`${m.c}/documents`, invoiceBody(m, { date: '2026-11-05', tdsSection: '194JB', status: 'issued' }), { token: m.token });
    expect(inv.status).toBe(201);
    expect(inv.body.tdsExpected).toEqual({ section: '194JB', rate: 10, amount: inr(20_000) });
    expect(inv.body.tds).toBeUndefined();
    expect(inv.body.totals.grandTotal.minor).toBe(236_000);
    // Expected only: nothing is settled until a receipt says so.
    expect(await documentRow(t, inv.body.id)).toMatchObject({ amountPaidMinor: 0 });
    let row = await trialRow(m);
    expect(row(`party:${m.mumbai.id}`)).toBe(236_000);

    // A rate typed on the invoice wins over the section's.
    const typed = await t.post(`${m.c}/documents`, invoiceBody(m, { date: '2026-11-05', tdsSection: '194C', tdsRate: 1, status: 'issued' }), { token: m.token });
    expect(typed.body.tdsExpected).toEqual({ section: '194C', rate: 1, amount: inr(2_000) });

    // The open list carries it, for the receipt to take as deducted.
    const open = await t.get(`${m.c}/documents`, { token: m.token, query: { kind: 'invoice', outstanding: true } });
    expect(open.body.data.find((d: { id: string }) => d.id === inv.body.id).tdsExpected.amount).toEqual(inr(20_000));

    const rec = await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.mumbai.id, date: '2026-11-06', amount: inr(216_000), currency: 'INR', method: 'cash', accountId: m.cash.id, tdsSection: '194JB', allocations: [{ documentId: inv.body.id, amount: inr(216_000), tdsDeducted: inr(20_000) }] },
      { token: m.token },
    );
    expect(rec.status).toBe(201);
    expect(rec.body.tdsSection).toBe('194JB');
    expect(await documentRow(t, inv.body.id)).toMatchObject({ status: 'paid' });
    row = await trialRow(m);
    expect(row('sys:tdsReceivable:194JB')).toBe(20_000);
    expect(row('sys:tdsReceivable')).toBe(0);

    const report = (await t.get(`${m.c}/report-data/tds-receivable`, { token: m.token, query: FY })).body;
    expect(report.rows).toEqual([expect.objectContaining({ section: '194JB', fy: '2026-27', quarter: 'FY 2026-27 Q3', tdsMinor: 20_000 })]);
    expect(report.match).toEqual([expect.objectContaining({ quarter: 'FY 2026-27 Q3', expectedMinor: 22_000, recordedMinor: 20_000, differenceMinor: -2_000 })]);
    // Not in 26Q: that is TDS the business deducted.
    const q = (await t.get(`${m.c}/report-data/tds-26q`, { token: m.token, query: FY })).body;
    expect(q.deductees).toEqual([]);
  });
});

describe('TCS given back on a credit note (G7), and the TCS reports', () => {
  it('reverses TCS at the invoice rate under its section, shows it negative, and a challan clears TCS payable', async () => {
    const m = await setup();
    const inv = await t.post(`${m.c}/documents`, invoiceBody(m, { partyId: m.bengaluru.id, date: '2026-10-10', tcsSection: 'scrap', status: 'issued' }), { token: m.token });
    expect(inv.body.totals.tcs).toEqual(inr(2_400));
    const cn = await t.post(
      `${m.c}/documents`,
      { kind: 'creditNote', partyId: m.bengaluru.id, sourceDocumentId: inv.body.id, date: '2026-10-20', currency: 'INR', noteReason: 'discount', lines: [line(m.gst(18), { name: 'Rate difference', quantity: 1, unitPrice: inr(50_000) })], status: 'issued' },
      { token: m.token },
    );
    expect(cn.status).toBe(201);
    // ₹500 + 18% = ₹590; 1% = ₹5.90, to the rupee ₹6.
    expect(cn.body.totals.tcs).toEqual(inr(600));
    expect(cn.body.tcs).toEqual({ section: 'scrap', rate: 1 });
    let row = await trialRow(m);
    expect(row('sys:tcsPayable:scrap')).toBe(-1_800);

    const register = (await t.get(`${m.c}/report-data/tcs-register`, { token: m.token, query: FY })).body.rows;
    expect(register.map((r: { kind: string; tcsMinor: number; baseMinor: number }) => [r.kind, r.baseMinor, r.tcsMinor])).toEqual([
      ['invoice', 236_000, 2_400],
      ['creditNote', -59_000, -600],
    ]);

    // The same challan deposits TCS.
    await t.deps.db.update(schema.paymentAccounts).set({ openingBalanceMinor: 1_000_000 }).where(eq(schema.paymentAccounts.id, m.cash.id));
    const challan = await t.post(
      `${m.c}/vouchers`,
      { kind: 'tdsChallan', date: '2026-11-05', lines: [{ account: 'sys:tcsPayable:scrap', debit: inr(1_800), credit: inr(0) }, { account: `pay:${m.cash.id}`, debit: inr(0), credit: inr(1_800) }] },
      { token: m.token },
    );
    expect(challan.status).toBe(201);
    row = await trialRow(m);
    expect(row('sys:tcsPayable:scrap')).toBe(0);

    const payable = (await t.get(`${m.c}/report-data/tcs-payable`, { token: m.token, query: FY })).body;
    expect(payable.months).toEqual([expect.objectContaining({ section: 'scrap', month: '2026-10', collectedMinor: 1_800, depositedMinor: 1_800, balanceMinor: 0, dueDate: '2026-11-07' })]);
    expect(payable.quarters).toEqual([expect.objectContaining({ section: 'scrap', quarter: 'FY 2026-27 Q3', collectees: 1, documents: 2, tcsMinor: 1_800 })]);
  });
});

describe('TDS kept back once on a bill (G11)', () => {
  it('refuses TDS on a payment to a bill that already kept it back under that section', async () => {
    const m = await setup();
    await t.deps.db.update(schema.companies).set({ tan: 'MUMA12345B' }).where(eq(schema.companies.id, m.companyId));
    await t.deps.db.update(schema.parties).set({ tdsSection: '194C', pan: 'AABCK1234F' }).where(eq(schema.parties.id, m.supplier!.id));
    const bill = await t.post(
      `${m.c}/documents`,
      { kind: 'purchaseBill', partyId: m.supplier!.id, date: '2026-11-05', currency: 'INR', supplierDocNumber: 'KS-1', lines: [line(m.gst(18), { name: 'Fabrication work', quantity: 1, unitPrice: inr(4_000_000) })], status: 'issued' },
      { token: m.token },
    );
    expect(bill.body.tds.amount).toEqual(inr(80_000));
    await t.deps.db.update(schema.paymentAccounts).set({ openingBalanceMinor: 10_000_000 }).where(eq(schema.paymentAccounts.id, m.cash.id));
    const pay = await t.post(
      `${m.c}/payments`,
      { direction: 'paid', partyId: m.supplier!.id, date: '2026-11-06', amount: inr(4_560_000), currency: 'INR', method: 'cash', accountId: m.cash.id, tdsSection: '194C', allocations: [{ documentId: bill.body.id, amount: inr(4_560_000), tdsDeducted: inr(80_000) }] },
      { token: m.token },
    );
    expect(pay.status).toBe(422);
    expect(JSON.stringify(pay.body)).toContain('already kept back TDS');
  });
});

describe('reverse charge owed as Output tax from RCM_OUTPUT_FROM (RULES 2.6)', () => {
  it('credits Output tax for a reverse-charge bill dated on or after 1 November 2026, Reverse charge payable before', async () => {
    const m = await setup();
    const rcm = (date: string) =>
      t.post(
        `${m.c}/documents`,
        { kind: 'purchaseBill', partyId: m.supplier!.id, date, currency: 'INR', supplierDocNumber: `GTA-${date}`, reverseCharge: true, lines: [line(m.gst(18), { name: 'Freight', quantity: 1, unitPrice: inr(100_000) })], status: 'issued' },
        { token: m.token },
      );
    expect((await rcm('2026-10-31')).status).toBe(201);
    let row = await trialRow(m);
    expect(row('sys:rcmPayableCgst')).toBe(-9_000);
    expect(row('sys:outputCgst')).toBe(0);
    expect((await rcm('2026-11-01')).status).toBe(201);
    row = await trialRow(m);
    expect(row('sys:rcmPayableCgst')).toBe(-9_000);
    expect(row('sys:outputCgst')).toBe(-9_000);
    expect(row('sys:inputCgst')).toBe(18_000);
  });
});
