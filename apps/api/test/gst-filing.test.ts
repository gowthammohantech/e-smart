import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { ANSWER_LOST, recoverLostFilings } from '../src/modules/gst/filing';
import { ReturnsSimulator } from '../src/providers/returns';
import { line, moneySetup } from './money-fixtures';
import { setupApi } from './helpers';

const t = setupApi({ GST_FILING_ENABLED: 'true' });

const GSTIN = '27AABCV1234F1ZO';
const SUPPLIER = '27AABCS2222K1ZQ';
const PERIOD = '092026';
const sim = () => t.deps.providers.returns as ReturnsSimulator;
const inr = (minor: number) => ({ minor, currency: 'INR' });

/**
 * September: a ₹2,000 inter-state B2B sale (IGST ₹360), and a ₹1,000 bill from a Mumbai supplier
 * claimed from 2B (CGST and SGST ₹90 each). The credit pays half the IGST; ₹180 is cash.
 */
async function setup() {
  const m = await moneySetup(t);
  const db = t.deps.db;
  await db.update(schema.companies).set({ taxIdentifier: GSTIN, taxRegistered: true }).where(eq(schema.companies.id, m.companyId));
  await db.update(schema.parties).set({ taxId: SUPPLIER }).where(eq(schema.parties.id, m.supplier!.id));
  const sale = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.bengaluru.id, date: '2026-09-10', currency: 'INR', lines: [line(m.gst(18))], status: 'issued' }, { token: m.token });
  expect(sale.status).toBe(201);
  const bill = await t.post(
    `${m.c}/documents`,
    { kind: 'purchaseBill', partyId: m.supplier!.id, date: '2026-09-05', currency: 'INR', supplierDocNumber: 'KS/1', lines: [line(m.gst(18), { quantity: 1 })], status: 'issued' },
    { token: m.token },
  );
  expect(bill.status).toBe(201);
  await db.update(schema.documents).set({ itcClaimPeriod: PERIOD }).where(eq(schema.documents.id, bill.body.id));
  t.setNow('2026-10-15T10:00:00Z');
  await t.post(`${m.c}/gst/portal-sessions/otp`, { gstin: GSTIN, username: 'vertex' }, { token: m.token });
  await t.post(`${m.c}/gst/portal-sessions`, { gstin: GSTIN, otp: ReturnsSimulator.OTP }, { token: m.token });
  const step = (returnType: string, action: string, body: Record<string, unknown> = {}) => t.post(`${m.c}/gst/returns/${returnType}/${action}`, { gstin: GSTIN, period: PERIOD, ...body }, { token: m.token });
  return { ...m, step };
}

describe('GSTR-3B and filing', () => {
  it('builds 3B from the books and sets the tax off from credit before cash', async () => {
    const m = await setup();
    const res = await t.get(`${m.c}/gst/gstr3b`, { token: m.token, query: { gstin: GSTIN, period: PERIOD } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dueDate: '2026-10-20', filingEnabled: true, returns: [] });
    expect(res.body.outward.taxable).toMatchObject({ taxable: inr(200_000), igst: inr(36_000) });
    expect(res.body.itc.net).toMatchObject({ cgst: inr(9_000), sgst: inr(9_000) });
    expect(res.body.setOff.credit.cgst.igst).toEqual(inr(9_000));
    expect(res.body.setOff.credit.sgst.igst).toEqual(inr(9_000));
    expect(res.body.setOff.cash.igst).toEqual(inr(18_000));
  });

  it('files GSTR-1 then 3B, never twice, and closes the books with the set-off posted', async () => {
    const m = await setup();
    expect((await m.step('gstr3b', 'save')).body.status).toBe('saved');
    expect((await m.step('gstr3b', 'offset')).body.status).toBe('submitted');
    const early = await m.step('gstr3b', 'file', { otp: ReturnsSimulator.OTP });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('GSTR1_FIRST');

    expect((await m.step('gstr1', 'file', { otp: ReturnsSimulator.OTP })).body.code).toBe('RETURN_NOT_READY');
    const saved = await m.step('gstr1', 'save');
    expect(saved.body).toMatchObject({ status: 'saved', returnType: 'gstr1' });
    expect(saved.body.referenceId).toBeTruthy();
    expect((await m.step('gstr1', 'proceed')).body.status).toBe('submitted');
    expect((await m.step('gstr1', 'evc')).status).toBe(200);
    const wrong = await m.step('gstr1', 'file', { otp: '000000' });
    expect(wrong.status).toBe(422);
    const r1 = await m.step('gstr1', 'file', { otp: ReturnsSimulator.OTP });
    expect(r1.body).toMatchObject({ status: 'filed', filedOn: '2026-10-15' });
    expect(r1.body.arn).toMatch(/^AA27092026/);
    const again = await m.step('gstr1', 'file', { otp: ReturnsSimulator.OTP });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('RETURN_FILED');
    expect((await m.step('gstr1', 'save')).body.code).toBe('RETURN_FILED');

    // The answer to 3B's filing is lost; the portal's tracker says it went through.
    sim().loseNext('file');
    const r3 = await m.step('gstr3b', 'file', { otp: ReturnsSimulator.OTP });
    expect(r3.status).toBe(200);
    expect(r3.body.status).toBe('filed');
    // The wrong OTP, GSTR-1 and 3B: the second GSTR-1 never reached the portal.
    expect(sim().calls.filter((c) => c.op === 'file')).toHaveLength(3);

    const [company] = await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.companyId));
    expect(company.lockedThroughDate).toBe('2026-09-30');
    const [setOff] = await t.deps.db.select().from(schema.vouchers).where(and(eq(schema.vouchers.companyId, m.companyId), eq(schema.vouchers.kind, 'gstJournal')));
    expect(setOff.date).toBe('2026-09-30');
    expect(setOff.lines).toEqual([
      { account: 'sys:outputIgst', debitMinor: 18_000, creditMinor: 0 },
      { account: 'sys:inputCgst', debitMinor: 0, creditMinor: 9_000 },
      { account: 'sys:inputSgst', debitMinor: 0, creditMinor: 9_000 },
    ]);
    const late = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.mumbai.id, date: '2026-09-20', currency: 'INR', lines: [line(m.gst(18))], status: 'issued' }, { token: m.token });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('PERIOD_LOCKED');

    const view = await t.get(`${m.c}/gst/gstr3b`, { token: m.token, query: { gstin: GSTIN, period: PERIOD } });
    expect(view.body.returns.map((r: { returnType: string; status: string }) => `${r.returnType}:${r.status}`).sort()).toEqual(['gstr1:filed', 'gstr3b:filed']);
  });

  it('settles a filing whose answer was lost from the portal’s tracker, in the background', async () => {
    const m = await setup();
    await m.step('gstr1', 'save');
    await m.step('gstr1', 'proceed');
    // The portal filed it, but neither the answer nor the immediate check got back.
    const [row] = await t.deps.db.update(schema.gstReturns).set({ lastError: ANSWER_LOST }).where(eq(schema.gstReturns.returnType, 'gstr1')).returning();
    sim().filed.set(`${GSTIN}|gstr1|${PERIOD}`, { arn: 'AA2709202600001', filedOn: '2026-10-15' });
    expect(await recoverLostFilings(t.deps)).toBe(1);
    const [settled] = await t.deps.db.select().from(schema.gstReturns).where(eq(schema.gstReturns.id, row.id));
    expect(settled).toMatchObject({ status: 'filed', arn: 'AA2709202600001', lastError: null });
    expect(await recoverLostFilings(t.deps)).toBe(0);
  });

  it('settles a lost GSTR-3B filing in the background with the books closed and the set-off posted', async () => {
    const m = await setup();
    await m.step('gstr1', 'save');
    await m.step('gstr1', 'proceed');
    await m.step('gstr1', 'file', { otp: ReturnsSimulator.OTP });
    await m.step('gstr3b', 'save');
    await m.step('gstr3b', 'offset');
    // Filed on the portal, but the app heard nothing back, then or on the immediate check.
    await t.deps.db.update(schema.gstReturns).set({ lastError: ANSWER_LOST }).where(eq(schema.gstReturns.returnType, 'gstr3b'));
    sim().filed.set(`${GSTIN}|gstr3b|${PERIOD}`, { arn: 'AA2709202600003', filedOn: '2026-10-15' });
    expect(await recoverLostFilings(t.deps)).toBe(1);
    const [company] = await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.companyId));
    expect(company.lockedThroughDate).toBe('2026-09-30');
    const journals = await t.deps.db.select().from(schema.vouchers).where(and(eq(schema.vouchers.companyId, m.companyId), eq(schema.vouchers.kind, 'gstJournal')));
    expect(journals).toHaveLength(1);
  });

  it('records the books closing when the portal already has the return filed', async () => {
    const m = await setup();
    await m.step('gstr1', 'save');
    await m.step('gstr1', 'proceed');
    await m.step('gstr1', 'file', { otp: ReturnsSimulator.OTP });
    await m.step('gstr3b', 'save');
    await m.step('gstr3b', 'offset');
    // Filed on the portal directly; the app learns of it before filing again.
    sim().filed.set(`${GSTIN}|gstr3b|${PERIOD}`, { arn: 'AA2709202600004', filedOn: '2026-10-14' });
    const res = await m.step('gstr3b', 'file', { otp: ReturnsSimulator.OTP });
    expect(res.body).toMatchObject({ status: 'filed', arn: 'AA2709202600004' });
    const [company] = await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.companyId));
    expect(company.lockedThroughDate).toBe('2026-09-30');
  });

  it('files GSTR-1 for one GSTIN only, leaving out a branch registered under another', async () => {
    const m = await setup();
    const [main] = await t.deps.db.select().from(schema.branches).where(eq(schema.branches.companyId, m.companyId));
    const [karnataka] = await t.deps.db
      .insert(schema.branches)
      .values({ ...main, id: 'brn_karnataka', name: 'Bengaluru', code: 'BLR', isPrimary: false, gstin: '29AABCV1234F1ZX' })
      .returning();
    t.setNow('2026-09-29T10:00:00Z');
    const there = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.mumbai.id, branchId: karnataka.id, date: '2026-09-12', currency: 'INR', lines: [line(m.gst(18))], status: 'issued' }, { token: m.token });
    expect(there.status).toBe(201);
    t.setNow('2026-10-15T10:00:00Z');
    await m.step('gstr1', 'save');
    const [saved] = await t.deps.db.select().from(schema.gstReturns).where(and(eq(schema.gstReturns.gstin, GSTIN), eq(schema.gstReturns.returnType, 'gstr1')));
    // The Bengaluru branch's consumer sale would be a B2CS row; it belongs to the Karnataka return.
    const payload = saved.payload as { b2b: unknown[]; b2cs: unknown[] };
    expect(payload.b2cs).toEqual([]);
    // The Maharashtra registration's own sale to Bengaluru is still there.
    expect(payload.b2b).toHaveLength(1);
  });

  it('saves but does not file while filing is switched off', async () => {
    const m = await setup();
    const config = t.deps.config as { GST_FILING_ENABLED: boolean };
    config.GST_FILING_ENABLED = false;
    try {
      expect((await m.step('gstr1', 'save')).body.status).toBe('saved');
      const res = await m.step('gstr1', 'file', { otp: ReturnsSimulator.OTP });
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('FILING_DISABLED');
    } finally {
      config.GST_FILING_ENABLED = true;
    }
  });
});
