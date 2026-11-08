import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { remindMsmeDue } from '../src/modules/ledger/msme';
import { setupApi } from './helpers';
import { fundCash, line, moneySetup, pdfText, type Money } from './money-fixtures';

const t = setupApi();
beforeEach(() => t.setNow('2026-09-29T10:00:00Z'));

const inr = (minor: number) => ({ minor, currency: 'INR' });
const category = async (m: Money) => (await t.deps.db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, m.companyId)))[0];

describe('cost centres', () => {
  it('tags documents, expenses and voucher lines, and is kept while in use', async () => {
    const m = await moneySetup(t);
    await fundCash(t, m);
    const site = await t.post(`${m.c}/cost-centres`, { name: 'Thane site', category: 'Project' }, { token: m.token });
    expect(site.status).toBe(201);
    const wing = await t.post(`${m.c}/cost-centres`, { name: 'Thane site, B wing', parentId: site.body.id }, { token: m.token });
    expect(wing.status).toBe(201);
    // A centre can't sit under one of its own.
    const loop = await t.put(`${m.c}/cost-centres/${site.body.id}`, { name: 'Thane site', parentId: wing.body.id }, { token: m.token, headers: { 'if-match': `"${site.body.version}"` } });
    expect(loop.status).toBe(422);

    const inv = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.mumbai.id, date: '2026-09-29', currency: 'INR', lines: [line(m.gst(18))], costCentreId: wing.body.id, status: 'issued' }, { token: m.token });
    expect(inv.status).toBe(201);
    expect(inv.body.costCentreId).toBe(wing.body.id);
    const bad = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.mumbai.id, date: '2026-09-29', currency: 'INR', lines: [line(m.gst(18))], costCentreId: 'ccn_nope' }, { token: m.token });
    expect(bad.status).toBe(422);
    const cat = await category(m);
    const exp = await t.post(`${m.c}/expenses`, { categoryId: cat.id, date: '2026-09-20', amount: inr(50_000), currency: 'INR', accountId: m.cash.id, method: 'cash', costCentreId: site.body.id }, { token: m.token });
    expect(exp.body.costCentreId).toBe(site.body.id);
    const jv = await t.post(
      `${m.c}/vouchers`,
      { kind: 'journal', date: '2026-09-29', lines: [{ account: `exp:${cat.id}`, debit: inr(10_000), credit: inr(0), costCentreId: wing.body.id }, { account: 'sys:capital', debit: inr(0), credit: inr(10_000) }] },
      { token: m.token },
    );
    expect(jv.status).toBe(201);
    expect(jv.body.lines[0].costCentreId).toBe(wing.body.id);
    // The report from the server keeps the voucher's line on its centre: the wing earned the invoice and bore the journal.
    const report = await t.get(`${m.c}/books/cost-centres`, { token: m.token, query: { from: '2026-04-01', to: '2027-03-31' } });
    expect(report.status).toBe(200);
    const centre = (id: string) => report.body.rows.find((r: { costCentreId?: string }) => r.costCentreId === id);
    expect(centre(wing.body.id).expense).toBe(10_000);
    expect(centre(site.body.id).expense).toBe(50_000);

    const remove = await t.del(`${m.c}/cost-centres/${wing.body.id}`, { token: m.token, headers: { 'if-match': `"${wing.body.version}"` } });
    expect(remove.status).toBe(409);
    expect(remove.body.code).toBe('COST_CENTRE_IN_USE');
  });
});

describe('reimbursements (pure agent)', () => {
  it('recovers a billable expense once, on an invoice to the customer it is billed to', async () => {
    const m = await moneySetup(t);
    await fundCash(t, m);
    const cat = await category(m);
    const exp = await t.post(`${m.c}/expenses`, { categoryId: cat.id, date: '2026-09-20', amount: inr(250_000), currency: 'INR', accountId: m.cash.id, method: 'cash', billable: true, customerId: m.mumbai.id }, { token: m.token });
    expect(exp.status).toBe(201);
    const plain = await t.post(`${m.c}/expenses`, { categoryId: cat.id, date: '2026-09-20', amount: inr(1_000), currency: 'INR', accountId: m.cash.id, method: 'cash' }, { token: m.token });
    const recover = (partyId: string, expenseId: string) =>
      t.post(
        `${m.c}/documents`,
        { kind: 'invoice', partyId, date: '2026-09-29', currency: 'INR', status: 'issued', lines: [line(m.gst(18)), line(m.gst(18), { name: 'Port charges paid for you', quantity: 1, unitPrice: inr(250_000), gst: { reimbursement: true }, expenseId })] },
        { token: m.token },
      );

    const first = await recover(m.mumbai.id, exp.body.id);
    expect(first.status).toBe(201);
    expect(first.body.lines[1].expenseId).toBe(exp.body.id);
    expect(first.body.totals.reimbursements).toEqual(inr(250_000));
    const again = await recover(m.mumbai.id, exp.body.id);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('EXPENSE_ALREADY_RECOVERED');
    expect((await recover(m.bengaluru.id, exp.body.id)).status).toBe(422);
    expect((await recover(m.mumbai.id, plain.body.id)).status).toBe(422);
  });
});

describe('GST on advances for services', () => {
  it('reports the advance in table 11A when received and 11B when invoiced, and in 3B', async () => {
    const m = await moneySetup(t);
    const GSTIN = '27AABCV1234F1ZO';
    await t.deps.db.update(schema.companies).set({ taxIdentifier: GSTIN, taxRegistered: true }).where(eq(schema.companies.id, m.companyId));
    // ₹11,800 for consulting, received in September before any invoice.
    const adv = await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.mumbai.id, date: '2026-09-15', amount: inr(1_180_000), currency: 'INR', method: 'cash', accountId: m.cash.id, advanceTax: { taxCategoryId: m.gst(18), placeOfSupplyStateCode: '27' } },
      { token: m.token },
    );
    expect(adv.status).toBe(201);
    expect(adv.body.advanceTax).toMatchObject({ rate: 18, placeOfSupplyStateCode: '27' });
    const paid = await t.post(
      `${m.c}/payments`,
      { direction: 'paid', partyId: m.supplier!.id, date: '2026-09-15', amount: inr(100), currency: 'INR', method: 'cash', accountId: m.cash.id, advanceTax: { taxCategoryId: m.gst(18), placeOfSupplyStateCode: '27' } },
      { token: m.token },
    );
    expect(paid.status).toBe(422);

    const sep = await t.get(`${m.c}/gst/gstr1`, { token: m.token, query: { period: '092026' } });
    expect(sep.body.advances.received).toEqual([{ placeOfSupply: '27', rate: 18, interState: false, taxable: inr(1_000_000), igst: inr(0), cgst: inr(90_000), sgst: inr(90_000), cess: inr(0) }]);
    const sep3b = await t.get(`${m.c}/gst/gstr3b`, { token: m.token, query: { gstin: GSTIN, period: '092026' } });
    expect(sep3b.body.outward.taxable).toMatchObject({ taxable: inr(1_000_000), cgst: inr(90_000), sgst: inr(90_000) });
    expect(sep3b.body.breakup['3.1a']).toEqual([expect.objectContaining({ type: 'advance', id: adv.body.id, cgst: inr(90_000) })]);
    // Its receipt is the receipt voucher Rule 50 asks for, with the tax on the advance.
    const voucher = await t.get(`${m.c}/payments/${adv.body.id}/receipt`, { token: m.token });
    expect(pdfText(voucher.raw)).toContain('RECEIPT VOUCHER');

    // October: the invoice is raised and the advance applied to it.
    t.setNow('2026-10-10T10:00:00Z');
    const inv = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.mumbai.id, date: '2026-10-10', currency: 'INR', status: 'issued', lines: [line(m.gst(18), { quantity: 1, unitPrice: inr(1_000_000) })] }, { token: m.token });
    expect(inv.status).toBe(201);
    const applied = await t.put(
      `${m.c}/payments/${adv.body.id}`,
      { ...adv.body, allocations: [{ documentId: inv.body.id, documentNumber: inv.body.number, amount: inr(1_180_000) }] },
      { token: m.token, headers: { 'if-match': `"${adv.body.version}"` } },
    );
    expect(applied.status).toBe(200);
    const oct = await t.get(`${m.c}/gst/gstr1`, { token: m.token, query: { period: '102026' } });
    expect(oct.body.advances).toEqual({ received: [], adjusted: [{ placeOfSupply: '27', rate: 18, interState: false, taxable: inr(1_000_000), igst: inr(0), cgst: inr(90_000), sgst: inr(90_000), cess: inr(0) }] });
    const json = await t.get(`${m.c}/gst/gstr1/export`, { token: m.token, query: { period: '102026' } });
    expect(JSON.parse(json.raw).txpd).toEqual([{ pos: '27', sply_ty: 'INTRA', itms: [{ rt: 18, ad_amt: 10000, iamt: 0, camt: 900, samt: 900, csamt: 0 }] }]);
    // October's 3B: the invoice's tax, less the advance's already paid.
    const oct3b = await t.get(`${m.c}/gst/gstr3b`, { token: m.token, query: { gstin: GSTIN, period: '102026' } });
    expect(oct3b.body.outward.taxable).toMatchObject({ taxable: inr(0), cgst: inr(0), sgst: inr(0) });

    // The trial balance: the advance's tax is fully taken back.
    const tb = await t.get(`${m.c}/reports/trial-balance`, { token: m.token, query: { from: '2026-04-01', to: '2026-10-31' } });
    expect(tb.body.rows.find((r: { account: string }) => r.account === 'sys:gstOnAdvances')?.closing ?? inr(0)).toEqual(inr(0));
  });
});

describe('paying micro and small suppliers on time', () => {
  it('lists their unpaid bills against the 45-day limit and reminds the business once', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.parties).set({ msmeType: 'micro', udyamNumber: 'UDYAM-MH-19-0012345' }).where(eq(schema.parties.id, m.supplier!.id));
    const bill = (date: string, dueDate?: string) =>
      t.post(`${m.c}/documents`, { kind: 'purchaseBill', partyId: m.supplier!.id, date, dueDate, currency: 'INR', supplierDocNumber: `KS/${date}`, lines: [line(m.gst(18), { quantity: 1 })], status: 'issued' }, { token: m.token });
    const late = await bill('2026-08-01', '2026-10-30');
    const soon = await bill('2026-09-25');
    expect(late.status).toBe(201);

    const report = await t.get(`${m.c}/reports/msme-payables`, { token: m.token, query: { from: '2026-04-01', to: '2026-09-29' } });
    expect(report.status).toBe(200);
    expect(report.body.rows.map((r: { number: string; dueDate: string; daysLeft: number }) => [r.number, r.dueDate, r.daysLeft])).toEqual([
      [late.body.number, '2026-09-15', -14],
      // No date agreed on the bill: 15 days, whatever the supplier's standing terms (RULES 8.7).
      [soon.body.number, '2026-10-10', 11],
    ]);
    expect(report.body.rows[0].interest.minor).toBeGreaterThan(0);
    expect(report.body.notPaidInTime.map((r: { number: string }) => r.number)).toEqual([late.body.number]);

    expect(await remindMsmeDue(t.deps)).toBe(1);
    expect(await remindMsmeDue(t.deps)).toBe(0);
    t.setNow('2026-10-04T10:00:00Z');
    expect(await remindMsmeDue(t.deps)).toBe(1);
    const notes = await t.deps.db.select().from(schema.notifications).where(and(eq(schema.notifications.companyId, m.companyId), eq(schema.notifications.kind, 'compliance')));
    expect(notes.map((n) => n.title)).toEqual([`${late.body.number} to Konkan Steel is past the MSME limit`, `${soon.body.number} to Konkan Steel is due by 10 Oct 2026`]);
  });
});
