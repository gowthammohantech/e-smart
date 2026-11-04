import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { reverseUnpaidItc } from '../src/modules/documents/itcReversal';
import { setupApi } from './helpers';
import { documentRow, line, moneySetup, type Money } from './money-fixtures';

const t = setupApi();
beforeEach(() => t.setNow('2026-09-29T10:00:00Z'));

const inr = (minor: number) => ({ minor, currency: 'INR' });

/** A bill from the fixture's supplier with one line of `minor` at 18%. */
const bill = (m: Money, minor: number, over: Record<string, unknown> = {}) => ({
  kind: 'purchaseBill',
  partyId: m.supplier!.id,
  date: '2026-09-29',
  currency: 'INR',
  supplierDocNumber: `KS-${minor}-${Math.random().toString(36).slice(2, 6)}`,
  lines: [line(m.gst(18), { name: 'Fabrication work', quantity: 1, unitPrice: inr(minor) })],
  status: 'issued',
  ...over,
});

/** A company with a TAN, and a contractor (a company PAN) under 194C. */
async function deductor(over: { section?: string; pan?: string | null } = {}) {
  const m = await moneySetup(t);
  await t.deps.db.update(schema.companies).set({ tan: 'MUMA12345B' }).where(eq(schema.companies.id, m.companyId));
  await t.deps.db
    .update(schema.parties)
    .set({ tdsSection: over.section ?? '194C', pan: over.pan === undefined ? 'AABCK1234F' : over.pan })
    .where(eq(schema.parties.id, m.supplier!.id));
  return m;
}

describe('TDS on supplier bills', () => {
  it('deducts nothing for a business without a TAN', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.parties).set({ tdsSection: '194C', pan: 'AABCK1234F' }).where(eq(schema.parties.id, m.supplier!.id));
    const res = await t.post(`${m.c}/documents`, bill(m, 4_000_000), { token: m.token });
    expect(res.status).toBe(201);
    expect(res.body.tds).toBeUndefined();
  });

  it('keeps back 2% on a contractor’s bill over ₹30,000, and the bill settles at the rest', async () => {
    const m = await deductor();
    const res = await t.post(`${m.c}/documents`, bill(m, 4_000_000), { token: m.token });
    expect(res.status).toBe(201);
    expect(res.body.tds).toEqual({ section: '194C', rate: 2, amount: inr(80_000) });
    // 40,000 + 18% = 47,200, of which 800 goes to the government.
    expect(await documentRow(t, res.body.id)).toMatchObject({ grandTotalMinor: 4_720_000, amountPaidMinor: 80_000 });

    await t.deps.db.update(schema.paymentAccounts).set({ openingBalanceMinor: 10_000_000 }).where(eq(schema.paymentAccounts.id, m.cash.id));
    const pay = (minor: number) =>
      t.post(
        `${m.c}/payments`,
        { direction: 'paid', partyId: m.supplier!.id, date: '2026-09-29', amount: inr(minor), currency: 'INR', method: 'cash', accountId: m.cash.id, allocations: [{ documentId: res.body.id, amount: inr(minor) }] },
        { token: m.token },
      );
    // Paying the whole 47,200 would pay the supplier the TDS too.
    expect((await pay(4_720_000)).body.code).toBe('ALLOCATION_EXCEEDS_OUTSTANDING');
    expect((await pay(4_640_000)).status).toBe(201);
    expect(await documentRow(t, res.body.id)).toMatchObject({ status: 'paid' });
  });

  it('catches up on the year when a bill takes the total past ₹1 lakh', async () => {
    const m = await deductor();
    for (let i = 0; i < 3; i++) {
      const small = await t.post(`${m.c}/documents`, bill(m, 2_500_000), { token: m.token });
      expect(small.body.tds).toBeUndefined();
    }
    const fourth = await t.post(`${m.c}/documents`, bill(m, 3_000_000), { token: m.token });
    // 2% of the year's 1,05,000.
    expect(fourth.body.tds.amount).toEqual(inr(210_000));
  });

  it('can be switched off on one bill', async () => {
    const m = await deductor();
    const res = await t.post(`${m.c}/documents`, bill(m, 4_000_000, { tdsSection: 'none' }), { token: m.token });
    expect(res.body.tds).toBeUndefined();
  });

  it('deducts 20% from a supplier with no PAN', async () => {
    const m = await deductor({ pan: null });
    const res = await t.post(`${m.c}/documents`, bill(m, 4_000_000), { token: m.token });
    expect(res.body.tds).toMatchObject({ rate: 20, amount: inr(800_000) });
  });

  it('gives TDS back on a supplier credit note, at the bill’s rate', async () => {
    const m = await deductor();
    const b = await t.post(`${m.c}/documents`, bill(m, 4_000_000), { token: m.token });
    const cn = await t.post(
      `${m.c}/documents`,
      { kind: 'supplierCreditNote', partyId: m.supplier!.id, sourceDocumentId: b.body.id, date: '2026-09-29', currency: 'INR', lines: [line(m.gst(18), { quantity: 1, unitPrice: inr(1_000_000) })], status: 'issued' },
      { token: m.token },
    );
    expect(cn.status).toBe(201);
    expect(cn.body.tds).toEqual({ section: '194C', rate: 2, amount: inr(20_000) });
    // The bill is settled by its own TDS (800) and by the note less the TDS it gives back (11,800 − 200).
    expect(await documentRow(t, b.body.id)).toMatchObject({ amountPaidMinor: 80_000 + 1_180_000 - 20_000 });
  });

  it('lists TDS by section, deductee and quarter', async () => {
    const m = await deductor();
    await t.post(`${m.c}/documents`, bill(m, 4_000_000), { token: m.token });
    const report = await t.get(`${m.c}/reports/tds-register`, { token: m.token, query: { from: '2026-04-01', to: '2027-03-31' } });
    expect(report.status).toBe(200);
    expect(report.body.rows).toEqual([expect.objectContaining({ section: '194C', sectionLabel: '194C', quarter: 'FY 2026-27 Q2', pan: 'AABCK1234F', base: inr(4_000_000), tds: inr(80_000) })]);
    expect(report.body.total).toEqual(inr(80_000));
  });
});

describe('reverse charge from an unregistered supplier', () => {
  it('raises a self-invoice for the tax the business pays (Rule 46(f))', async () => {
    const m = await moneySetup(t);
    const res = await t.post(`${m.c}/documents`, bill(m, 500_000, { reverseCharge: true }), { token: m.token });
    expect(res.status).toBe(201);
    expect(res.body.selfInvoiceNumber).toBe('SI/26-27/0001');
    expect(res.body.totals.reverseChargeTax).toEqual(inr(90_000));
  });

  it('raises none on an ordinary bill', async () => {
    const m = await moneySetup(t);
    const res = await t.post(`${m.c}/documents`, bill(m, 500_000), { token: m.token });
    expect(res.body.selfInvoiceNumber).toBeUndefined();
  });
});

describe('input tax credit after 180 days unpaid', () => {
  it('reverses it once, tells the business, and reclaims it once the bill is paid', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.companies).set({ taxRegistered: true }).where(eq(schema.companies.id, m.companyId));
    t.setNow('2026-03-01T10:00:00Z');
    const b = await t.post(`${m.c}/documents`, bill(m, 500_000, { date: '2026-03-01' }), { token: m.token });
    expect(b.status).toBe(201);

    t.setNow('2026-08-27T10:00:00Z');
    expect(await reverseUnpaidItc(t.deps)).toEqual({ reversed: 0, reclaimed: 0 });
    t.setNow('2026-08-29T10:00:00Z');
    expect(await reverseUnpaidItc(t.deps)).toEqual({ reversed: 1, reclaimed: 0 });
    expect(await reverseUnpaidItc(t.deps)).toEqual({ reversed: 0, reclaimed: 0 });
    expect(await documentRow(t, b.body.id)).toMatchObject({ itcReversedOn: '2026-08-29' });
    const notes = await t.deps.db.select().from(schema.notifications).where(eq(schema.notifications.entityId, b.body.id));
    expect(notes.map((n) => n.kind)).toEqual(['compliance']);

    await t.deps.db.update(schema.documents).set({ amountPaidMinor: 590_000 }).where(eq(schema.documents.id, b.body.id));
    expect(await reverseUnpaidItc(t.deps)).toEqual({ reversed: 0, reclaimed: 1 });
  });
});
