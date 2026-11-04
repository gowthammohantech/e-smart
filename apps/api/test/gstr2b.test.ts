import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { fetchDueGstr2b } from '../src/modules/gst/gstr2b';
import { ReturnsSimulator, type Gstr2bEntry } from '../src/providers/returns';
import { documentRow, line, moneySetup, type Money } from './money-fixtures';
import { setupApi } from './helpers';

const t = setupApi();
beforeEach(() => t.setNow('2026-10-15T10:00:00Z'));

const GSTIN = '27AABCV1234F1ZO';
const SUPPLIER = '29AACFA9876P1ZH';
const sim = () => t.deps.providers.returns as ReturnsSimulator;
const inr = (minor: number) => ({ minor, currency: 'INR' });

const entry = (over: Partial<Gstr2bEntry> = {}): Gstr2bEntry => ({
  section: 'b2b',
  supplierGstin: SUPPLIER,
  supplierName: 'Konkan Steel',
  documentType: 'I',
  number: 'KS/101',
  date: '2026-09-05',
  reverseCharge: false,
  taxableMinor: 1_000_000,
  igstMinor: 180_000,
  cgstMinor: 0,
  sgstMinor: 0,
  cessMinor: 0,
  itcAvailable: true,
  ...over,
});

async function setup() {
  const m = await moneySetup(t);
  await t.deps.db.update(schema.companies).set({ taxIdentifier: GSTIN, taxRegistered: true }).where(eq(schema.companies.id, m.companyId));
  await t.deps.db.update(schema.parties).set({ taxId: SUPPLIER, billingStateCode: '29' }).where(eq(schema.parties.id, m.supplier!.id));
  await t.post(`${m.c}/gst/portal-sessions/otp`, { gstin: GSTIN, username: 'vertex' }, { token: m.token });
  await t.post(`${m.c}/gst/portal-sessions`, { gstin: GSTIN, otp: ReturnsSimulator.OTP }, { token: m.token });
  return m;
}

const bill = async (m: Money, supplierDocNumber: string, minor: number, date = '2026-09-05') => {
  const res = await t.post(
    `${m.c}/documents`,
    { kind: 'purchaseBill', partyId: m.supplier!.id, date, currency: 'INR', supplierDocNumber, lines: [line(m.gst(18), { quantity: 1, unitPrice: inr(minor) })], status: 'issued' },
    { token: m.token },
  );
  expect(res.status).toBe(201);
  return res.body.id as string;
};

describe('GSTR-2B', () => {
  it('says so before GSTN has made it', async () => {
    const m = await setup();
    const res = await t.post(`${m.c}/gst/gstr2b/fetch`, { gstin: GSTIN, period: '092026' }, { token: m.token });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('GSTR2B_NOT_GENERATED');
  });

  it('downloads, matches the purchase register, keeps decisions across a refetch, and claims the matched credit', async () => {
    const m = await setup();
    const matched = await bill(m, 'KS/101', 1_000_000);
    await bill(m, 'KS/102', 500_000);
    const unreported = await bill(m, 'KS/103', 200_000);
    sim().gstr2b.set(`${GSTIN}|092026`, [
      entry(),
      entry({ number: 'ks-0102', taxableMinor: 510_000, igstMinor: 91_800 }),
      entry({ number: 'KS/999', supplierGstin: '33AAACZ9999Z1Z5', supplierName: 'Unknown Traders' }),
    ]);

    const res = await t.post(`${m.c}/gst/gstr2b/fetch`, { gstin: GSTIN, period: '092026' }, { token: m.token });
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ lines: 3, matched: 1, partial: 1, missingInBooks: 1, missingIn2b: 1, claimableTax: inr(180_000) });
    const byNumber = (n: string) => res.body.rows.find((r: { number: string }) => r.number === n);
    expect(byNumber('KS/101').bill.documentId).toBe(matched);
    expect(byNumber('ks-0102')).toMatchObject({ status: 'partial', difference: { taxable: inr(10_000), tax: inr(1_800), days: 0 } });
    expect(res.body.missingIn2b.map((b: { documentId: string }) => b.documentId)).toEqual([unreported]);

    const stranger = byNumber('KS/999');
    expect((await t.put(`${m.c}/gst/gstr2b/lines/${stranger.id}/decision`, { decision: 'notOurs' }, { token: m.token })).status).toBe(204);
    // The supplier's figure for 102 is right after all: accept it as it stands.
    expect((await t.put(`${m.c}/gst/gstr2b/lines/${byNumber('ks-0102').id}/decision`, { decision: 'accepted' }, { token: m.token })).status).toBe(204);

    // A second download keeps both decisions.
    const again = await t.post(`${m.c}/gst/gstr2b/fetch`, { gstin: GSTIN, period: '092026' }, { token: m.token });
    expect(again.body.summary).toMatchObject({ matched: 1, manuallyLinked: 1, partial: 0, missingInBooks: 0, claimableTax: inr(180_000 + 91_800) });
    expect(byNumber('ks-0102').reasons).toEqual(['taxable', 'tax']);
    expect(again.body.rows.find((r: { number: string }) => r.number === 'KS/999').status).toBe('notOurs');

    const claim = await t.post(`${m.c}/gst/gstr2b/claim`, { gstin: GSTIN, period: '092026' }, { token: m.token });
    expect(claim.body).toEqual({ claimed: 2 });
    expect(await documentRow(t, matched)).toMatchObject({ itcClaimPeriod: '092026' });
    // A bill claimed for September isn't a candidate in October's match.
    sim().gstr2b.set(`${GSTIN}|102026`, []);
    await t.post(`${m.c}/gst/gstr2b/fetch`, { gstin: GSTIN, period: '102026' }, { token: m.token });
    const october = await t.get(`${m.c}/gst/gstr2b`, { token: m.token, query: { gstin: GSTIN, period: '102026' } });
    expect(october.body.missingIn2b.map((b: { documentId: string }) => b.documentId)).toEqual([unreported]);
  });

  it('downloads last month’s 2B on its own from the 14th, and tells the business', async () => {
    const m = await setup();
    await bill(m, 'KS/101', 1_000_000);
    sim().gstr2b.set(`${GSTIN}|092026`, [entry()]);
    t.setNow('2026-10-13T05:00:00Z');
    expect(await fetchDueGstr2b(t.deps)).toBe(0);
    t.setNow('2026-10-14T05:00:00Z');
    expect(await fetchDueGstr2b(t.deps)).toBe(1);
    expect(await fetchDueGstr2b(t.deps)).toBe(0);
    const notes = await t.deps.db.select().from(schema.notifications).where(eq(schema.notifications.companyId, m.companyId));
    expect(notes.map((n) => n.title)).toContain('GSTR-2B for 09/2026 is in');
  });
});
