import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
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

  describe('a file downloaded from the portal', () => {
    const fixture = readFileSync(join(__dirname, 'fixtures/gstr2b-092026.json'));
    /** The business has its GSTIN but no portal session. */
    const unconnected = async () => {
      const m = await moneySetup(t);
      await t.deps.db.update(schema.companies).set({ taxIdentifier: GSTIN, taxRegistered: true }).where(eq(schema.companies.id, m.companyId));
      await t.deps.db.update(schema.parties).set({ taxId: SUPPLIER, billingStateCode: '29' }).where(eq(schema.parties.id, m.supplier!.id));
      return m;
    };
    const upload = (m: Money, fileName: string, content: Buffer, over: Record<string, string> = {}) =>
      t.post(`${m.c}/gst/gstr2b/import`, { gstin: GSTIN, period: '092026', fileName, contentBase64: content.toString('base64'), ...over }, { token: m.token });

    it('reads the portal JSON without a session, matches it, and keeps decisions when it comes again', async () => {
      const m = await unconnected();
      const matched = await bill(m, 'KS/101', 1_000_000);
      const res = await upload(m, 'returns_R2B_27AABCV1234F1ZO_092026.json', fixture);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ fetched: true, generatedOn: '2026-10-14' });
      expect(res.body.summary).toMatchObject({ lines: 4, matched: 1, missingInBooks: 3, claimableTax: inr(180_000) });
      const byNumber = (n: string) => res.body.rows.find((r: { number: string }) => r.number === n);
      expect(byNumber('KS/101').bill.documentId).toBe(matched);
      // Two rates of one invoice are one line; credit the portal marks unavailable stays so.
      expect(byNumber('KS/150')).toMatchObject({ taxable: inr(200_000), tax: inr(36_000), itcAvailable: false, itcReason: 'P' });
      expect(byNumber('KS/CN/7')).toMatchObject({ documentType: 'C', section: 'cdnr', tax: inr(9_000) });
      expect(byNumber('2034567')).toMatchObject({ documentType: 'BOE', supplierGstin: 'INNSA1', taxable: inr(5_000_000) });

      await t.put(`${m.c}/gst/gstr2b/lines/${byNumber('KS/150').id}/decision`, { decision: 'notOurs' }, { token: m.token });
      const again = await upload(m, 'r2b.json', fixture);
      expect(again.body.rows.find((r: { number: string }) => r.number === 'KS/150').status).toBe('notOurs');
      const claim = await t.post(`${m.c}/gst/gstr2b/claim`, { gstin: GSTIN, period: '092026' }, { token: m.token });
      expect(claim.body).toEqual({ claimed: 1 });
    });

    it('refuses another GSTIN’s or month’s file, and anything that isn’t a 2B', async () => {
      const m = await unconnected();
      const other = JSON.parse(fixture.toString());
      other.data.gstin = '27AAPFU0939F1ZV';
      expect((await upload(m, 'r2b.json', Buffer.from(JSON.stringify(other)))).body.code).toBe('GSTR2B_WRONG_GSTIN');
      expect((await upload(m, 'r2b.json', fixture, { period: '082026' })).body.code).toBe('GSTR2B_WRONG_PERIOD');
      const junk = await upload(m, 'r2b.json', Buffer.from('{"hello":1}'));
      expect(junk.status).toBe(422);
      expect(junk.body.code).toBe('UNSUPPORTED_FILE');
      // A GSTIN that isn't the business's.
      expect((await upload(m, 'r2b.json', fixture, { gstin: '27AAPFU0939F1ZV' })).status).toBe(422);
    });

    it('reads the portal’s Excel workbook by its headings', async () => {
      const m = await unconnected();
      await bill(m, 'KS/101', 1_000_000);
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet('Read me').addRow(['Goods and Services Tax - GSTR-2B']);
      const b2b = wb.addWorksheet('B2B');
      b2b.addRow(['Taxable inward supplies received from registered persons']);
      b2b.addRow([]);
      b2b.addRow(['GSTIN of supplier', 'Trade/Legal name', 'Invoice Details', '', '', '', 'Place of supply', 'Supply Attract Reverse Charge', 'Taxable Value (₹)', 'Tax Amount', '', '', '', 'GSTR-1/IFF/GSTR-5 Period', 'GSTR-1/IFF/GSTR-5 Filing Date', 'ITC Availability', 'Reason', 'Applicable % of Tax Rate']);
      b2b.addRow(['', '', 'Invoice number', 'Invoice type', 'Invoice Date', 'Invoice Value(₹)', '', '', '', 'Integrated Tax(₹)', 'Central Tax(₹)', 'State/UT Tax(₹)', 'Cess(₹)']);
      b2b.addRow([SUPPLIER, 'Konkan Steel', 'KS/101', 'Regular', '05/09/2026', 11800, 'Maharashtra', 'No', 6000, 1080, 0, 0, 0, 'Sep-26', '11/10/2026', 'Yes', '', '']);
      b2b.addRow([SUPPLIER, 'Konkan Steel', 'KS/101', 'Regular', '05/09/2026', 11800, 'Maharashtra', 'No', 4000, 720, 0, 0, 0, 'Sep-26', '11/10/2026', 'Yes', '', '']);
      const cdnr = wb.addWorksheet('B2B-CDNR');
      cdnr.addRow(['GSTIN of supplier', 'Trade/Legal name', 'Credit note/Debit note details', '', '', '', '', 'Place of supply', 'Supply Attract Reverse Charge', 'Taxable Value (₹)', 'Tax Amount']);
      cdnr.addRow(['', '', 'Note number', 'Note type', 'Note Supply type', 'Note date', 'Note Value (₹)', '', '', '', 'Integrated Tax(₹)', 'Central Tax(₹)', 'State/UT Tax(₹)', 'Cess(₹)']);
      cdnr.addRow([SUPPLIER, 'Konkan Steel', 'KS/DN/2', 'Debit note', 'Regular', '28/09/2026', 1180, 'Maharashtra', 'No', 1000, 180, 0, 0, 0]);
      const res = await upload(m, 'R2B.xlsx', Buffer.from(await wb.xlsx.writeBuffer()));
      expect(res.status).toBe(200);
      expect(res.body.summary).toMatchObject({ lines: 2, matched: 1, missingInBooks: 1, claimableTax: inr(180_000) });
      expect(res.body.rows.find((r: { number: string }) => r.number === 'KS/DN/2')).toMatchObject({ documentType: 'D', date: '2026-09-28', tax: inr(18_000) });
    });
  });
});
