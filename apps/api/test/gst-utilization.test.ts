import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { ReturnsSimulator } from '../src/providers/returns';
import { line, moneySetup } from './money-fixtures';
import { setupApi } from './helpers';

const t = setupApi({ GST_FILING_ENABLED: 'true' });

const GSTIN = '27AABCV1234F1ZO';
const SUPPLIER = '27AABCS2222K1ZQ';
const PERIOD = '092026';
const inr = (minor: number) => ({ minor, currency: 'INR' });
const head = (tax: number) => ({ tax, interest: 0, penalty: 0, fee: 0, others: 0 });

/**
 * September: a ₹2,000 inter-state sale (IGST ₹360) and a ₹1,000 bill claimed from 2B (CGST and
 * SGST ₹90 each). Credit pays ₹180 of the IGST; ₹180 is cash. Today is 15 October, before the due date.
 */
async function setup() {
  const m = await moneySetup(t);
  const db = t.deps.db;
  await db.update(schema.companies).set({ taxIdentifier: GSTIN, taxRegistered: true }).where(eq(schema.companies.id, m.companyId));
  await db.update(schema.parties).set({ taxId: SUPPLIER }).where(eq(schema.parties.id, m.supplier!.id));
  await db.update(schema.paymentAccounts).set({ openingBalanceMinor: 10_000_00 }).where(eq(schema.paymentAccounts.id, m.cash.id));
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
  const view = () => t.get(`${m.c}/gst/utilization`, { token: m.token, query: { gstin: GSTIN, period: PERIOD } });
  const post = (setOff: unknown, date = '2026-10-15') => t.post(`${m.c}/gst/utilization`, { gstin: GSTIN, period: PERIOD, date, setOff }, { token: m.token });
  const challan = (lines: { account: string; debit: number; credit: number }[], heads: Record<string, unknown>) =>
    t.post(
      `${m.c}/vouchers`,
      {
        kind: 'gstChallan',
        date: '2026-10-14',
        reference: '26092700012345',
        lines: lines.map((l) => ({ account: l.account, debit: inr(l.debit), credit: inr(l.credit) })),
        gstChallan: { cpin: '26092700012345', cin: 'HDFC26092700001', depositedOn: '2026-10-14', heads },
      },
      { token: m.token },
    );
  return { ...m, bill: bill.body, view, post, challan };
}

describe('GST utilization (set-off) and the GST cash ledger', () => {
  it('works the set-off out from 3B, refuses it without cash, and posts it once a challan fills the cash ledger', async () => {
    const m = await setup();
    const v = await m.view();
    expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ forward: { igst: 36_000, cgst: 0, sgst: 0 }, available: { cgst: 9_000, sgst: 9_000 }, cashBalance: { igst: 0 }, existing: [] });
    expect(v.body.prefill.credit.cgst.igst).toBe(9_000);
    expect(v.body.prefill.credit.sgst.igst).toBe(9_000);
    expect(v.body.prefill.cash.igst).toBe(18_000);
    // The Output ledger carries what 3B says is owed.
    expect(v.body.outputCheck).toMatchObject({ ok: true, books: { igst: 36_000 } });

    const short = await m.post(v.body.prefill);
    expect(short.status).toBe(422);
    expect(short.body.code).toBe('CASH_LEDGER_SHORT');

    // CGST credit can't pay SGST, nor can tax be left unpaid.
    const wrong = await m.post({ ...v.body.prefill, credit: { ...v.body.prefill.credit, cgst: { igst: 0, cgst: 0, sgst: 9_000, cess: 0 } } });
    expect(wrong.status).toBe(422);

    // A challan whose heads don't match its lines is refused; one that does fills the cash ledger.
    const mismatch = await m.challan([{ account: 'sys:gstCashLedger:igst', debit: 18_000, credit: 0 }, { account: `pay:${m.cash.id}`, debit: 0, credit: 18_000 }], { igst: head(17_000) });
    expect(mismatch.status).toBe(422);
    const toSales = await m.challan([{ account: 'sys:sales', debit: 18_000, credit: 0 }, { account: `pay:${m.cash.id}`, debit: 0, credit: 18_000 }], { igst: head(18_000) });
    expect(toSales.status).toBe(422);
    const paid = await m.challan([{ account: 'sys:gstCashLedger:igst', debit: 18_000, credit: 0 }, { account: `pay:${m.cash.id}`, debit: 0, credit: 18_000 }], { igst: head(18_000) });
    expect(paid.status).toBe(201);
    expect(paid.body).toMatchObject({ kind: 'gstChallan', gstChallan: { cpin: '26092700012345', heads: { igst: head(18_000) } } });
    expect(paid.body.number).toMatch(/^GCH/);

    const after = await m.view();
    expect(after.body.cashBalance.igst).toBe(18_000);
    const r3b = await t.get(`${m.c}/gst/gstr3b`, { token: m.token, query: { gstin: GSTIN, period: PERIOD } });
    expect(r3b.body.setOff.cashLedger.igst).toEqual(inr(18_000));

    const early = await m.post(after.body.prefill, '2026-09-20');
    expect(early.status).toBe(422);
    const posted = await m.post(after.body.prefill);
    expect(posted.status).toBe(201);
    expect(posted.body).toMatchObject({ kind: 'gstJournal', gstin: GSTIN, gstPeriod: PERIOD, date: '2026-10-15' });
    const lines = posted.body.lines as { account: string; debit: { minor: number }; credit: { minor: number } }[];
    expect(lines.reduce((a, l) => a + l.debit.minor - l.credit.minor, 0)).toBe(0);
    expect(lines.find((l) => l.account === 'sys:outputIgst')?.debit.minor).toBe(36_000);
    expect(lines.find((l) => l.account === 'sys:gstCashLedger:igst')?.credit.minor).toBe(18_000);

    // Once a period; the screen shows the one there is.
    const twice = await m.post(after.body.prefill);
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe('SET_OFF_EXISTS');
    // The challan's money is spent: it can't be deleted from under the set-off.
    const gone = await t.del(`${m.c}/vouchers/${paid.body.id}`, { token: m.token });
    expect(gone.status).toBe(409);
    expect(gone.body.code).toBe('CHALLAN_USED');
    const shown = await m.view();
    expect(shown.body.existing.map((x: { id: string }) => x.id)).toEqual([posted.body.id]);
    expect(shown.body.cashBalance.igst).toBe(0);
    // A set-off is reversed and posted again, not edited.
    const edit = await t.put(`${m.c}/vouchers/${posted.body.id}`, { ...posted.body, narration: 'changed' }, { token: m.token, headers: { 'If-Match': `"${posted.body.version}"` } });
    expect(edit.status).toBe(422);

    // The books: Output, Input and the cash ledger are all cleared.
    const tb = await t.get(`${m.c}/books/trial-balance`, { token: m.token, query: { from: '2026-04-01', to: '2026-10-31' } });
    const closing = (account: string) => (tb.body.rows as { account: string; closing: { minor: number } }[]).find((r) => r.account === account)?.closing.minor ?? 0;
    expect(closing('sys:outputIgst')).toBe(0);
    expect(closing('sys:inputCgst')).toBe(0);
    expect(closing('sys:gstCashLedger:igst')).toBe(0);

    // Filing 3B afterwards posts no second set-off.
    await t.post(`${m.c}/gst/portal-sessions/otp`, { gstin: GSTIN, username: 'vertex' }, { token: m.token });
    await t.post(`${m.c}/gst/portal-sessions`, { gstin: GSTIN, otp: ReturnsSimulator.OTP }, { token: m.token });
    const step = (returnType: string, action: string, body: Record<string, unknown> = {}) => t.post(`${m.c}/gst/returns/${returnType}/${action}`, { gstin: GSTIN, period: PERIOD, ...body }, { token: m.token });
    await step('gstr1', 'save');
    await step('gstr1', 'proceed');
    await step('gstr1', 'evc');
    expect((await step('gstr1', 'file', { otp: ReturnsSimulator.OTP })).body.status).toBe('filed');
    await step('gstr3b', 'save');
    await step('gstr3b', 'offset');
    expect((await step('gstr3b', 'file', { otp: ReturnsSimulator.OTP })).body.status).toBe('filed');
    const journals = await t.deps.db.select().from(schema.vouchers).where(and(eq(schema.vouchers.companyId, m.companyId), eq(schema.vouchers.kind, 'gstJournal')));
    expect(journals.map((j) => j.id)).toEqual([posted.body.id]);
  });

  it('posts a 180-day ITC reversal and its reclaim in the books, agreeing with 3B 4B(2)', async () => {
    const m = await setup();
    await t.deps.db.update(schema.documents).set({ itcReversedOn: '2026-10-05' }).where(eq(schema.documents.id, m.bill.id));
    const r3b = await t.get(`${m.c}/gst/gstr3b`, { token: m.token, query: { gstin: GSTIN, period: '102026' } });
    expect(r3b.status).toBe(200);
    const reversed = r3b.body.itc.reversedOther;
    expect(reversed.cgst).toEqual(inr(9_000));
    const ledger = async (account: string, from: string, to: string) => {
      const res = await t.get(`${m.c}/books/ledger`, { token: m.token, query: { account, from, to } });
      expect(res.status).toBe(200);
      return res.body as { opening: number; closing: number };
    };
    const oct = await ledger('sys:inputCgst', '2026-10-01', '2026-10-31');
    expect(oct.opening - oct.closing).toBe(reversed.cgst.minor);
    expect((await ledger('sys:itcReversed', '2026-10-01', '2026-10-31')).closing).toBe(18_000);
    // Paid in November: the credit comes back.
    await t.deps.db.update(schema.documents).set({ itcReclaimedOn: '2026-11-03' }).where(eq(schema.documents.id, m.bill.id));
    t.setNow('2026-11-10T10:00:00Z');
    const nov = await ledger('sys:inputCgst', '2026-11-01', '2026-11-30');
    expect(nov.closing - nov.opening).toBe(9_000);
    expect((await ledger('sys:itcReversed', '2026-11-01', '2026-11-30')).closing).toBe(0);
  });

  it('lists a debit note in GSTR-1 table 13 within the contract', async () => {
    const m = await setup();
    const [inv] = await t.deps.db.select().from(schema.documents).where(and(eq(schema.documents.companyId, m.companyId), eq(schema.documents.kind, 'invoice')));
    const dn = await t.post(
      `${m.c}/documents`,
      { kind: 'debitNote', partyId: m.bengaluru.id, sourceDocumentId: inv.id, date: '2026-09-21', currency: 'INR', noteReason: 'priceChange', status: 'issued', lines: [line(m.gst(18), { name: 'Rate difference', quantity: 1, unitPrice: inr(10_000) })] },
      { token: m.token },
    );
    expect(dn.status).toBe(201);
    const r1 = await t.get(`${m.c}/gst/gstr1`, { token: m.token, query: { period: PERIOD } });
    expect(r1.status).toBe(200);
    expect(r1.body.docs.map((d: { nature: string }) => d.nature)).toContain('debitNote');
  });
});
