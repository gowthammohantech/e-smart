import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { loadAdvanceEvents } from '../src/modules/gst/advances';
import { setupApi } from './helpers';
import { line, moneySetup, type Money } from './money-fixtures';

const t = setupApi();
beforeEach(() => t.setNow('2026-09-29T10:00:00Z'));

const inr = (minor: number) => ({ minor, currency: 'INR' });
const GSTIN = '27AABCV1234F1ZO';
const registered = (m: Money) => t.deps.db.update(schema.companies).set({ taxIdentifier: GSTIN, taxRegistered: true }).where(eq(schema.companies.id, m.companyId));
const consulting = (m: Money, minor: number, over: Record<string, unknown> = {}) => line(m.gst(18), { name: 'Consulting', hsnCode: '998311', unit: 'HRS', quantity: 1, unitPrice: inr(minor), ...over });
const tb = async (m: Money, account: string) => {
  const res = await t.get(`${m.c}/reports/trial-balance`, { token: m.token, query: { from: '2026-04-01', to: '2027-03-31' } });
  return res.body.rows.find((r: { account: string }) => r.account === account)?.closing ?? inr(0);
};

describe('advance receipts for services', () => {
  it('carries SAC, cess and TDS the customer deducted, and refuses goods', async () => {
    const m = await moneySetup(t);
    await registered(m);
    // ₹12,800 for a service in Karnataka (inter-state), 18% GST and 10% cess inside it.
    const adv = await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.bengaluru.id, date: '2026-09-15', amount: inr(1_280_000), currency: 'INR', method: 'cash', accountId: m.cash.id, advanceTax: { taxCategoryId: m.gst(18), placeOfSupplyStateCode: '29', hsn: '998311', cessRate: 10 } },
      { token: m.token },
    );
    expect(adv.status).toBe(201);
    expect(adv.body.advanceTax).toMatchObject({ rate: 18, hsn: '998311', cessRate: 10 });
    const sep = await t.get(`${m.c}/gst/gstr1`, { token: m.token, query: { period: '092026' } });
    expect(sep.body.advances.received).toEqual([{ placeOfSupply: '29', rate: 18, interState: true, taxable: inr(1_000_000), igst: inr(180_000), cgst: inr(0), sgst: inr(0), cess: inr(100_000) }]);
    expect(await tb(m, 'sys:outputCess')).toEqual(inr(-100_000));
    expect(await tb(m, 'sys:gstOnAdvances')).toEqual(inr(280_000));

    // Goods: no GST on the advance (notification 66/2017).
    const goods = await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.mumbai.id, date: '2026-09-15', amount: inr(10_000), currency: 'INR', method: 'cash', accountId: m.cash.id, advanceTax: { taxCategoryId: m.gst(18), placeOfSupplyStateCode: '27', hsn: '7214' } },
      { token: m.token },
    );
    expect(goods.status).toBe(422);
    expect(goods.body.issues[0].field).toBe('advanceTax.hsn');

    // TDS deducted on the advance: it credits the customer and is part of the value taxed.
    const noSection = await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.mumbai.id, date: '2026-09-16', amount: inr(1_180_000), currency: 'INR', method: 'cash', accountId: m.cash.id, advanceTds: inr(20_000) },
      { token: m.token },
    );
    expect(noSection.status).toBe(422);
    const withTds = await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.mumbai.id, date: '2026-09-16', amount: inr(1_180_000), currency: 'INR', method: 'cash', accountId: m.cash.id, advanceTds: inr(20_000), tdsSection: '194JB', advanceTax: { taxCategoryId: m.gst(18), placeOfSupplyStateCode: '27' } },
      { token: m.token },
    );
    expect(withTds.status).toBe(201);
    expect(withTds.body.unallocated).toEqual(inr(1_200_000));
    expect(withTds.body.advanceTds).toEqual(inr(20_000));
    expect(await tb(m, 'sys:tdsReceivable:194JB')).toEqual(inr(20_000));
    const again = await t.get(`${m.c}/gst/gstr1`, { token: m.token, query: { period: '092026' } });
    // ₹12,000 at 18% inclusive: ₹1,830.51 of tax.
    expect(again.body.advances.received.find((r: { placeOfSupply: string }) => r.placeOfSupply === '27')).toMatchObject({ taxable: inr(1_016_949), cgst: inr(91_526), sgst: inr(91_525) });
  });
});

describe('the adjustment entry', () => {
  it('applies a service advance to a later invoice, taking its GST back on the invoice date', async () => {
    const m = await moneySetup(t);
    await registered(m);
    const adv = await t.post(
      `${m.c}/payments`,
      { direction: 'received', partyId: m.mumbai.id, date: '2026-09-15', amount: inr(1_180_000), currency: 'INR', method: 'cash', accountId: m.cash.id, advanceTax: { taxCategoryId: m.gst(18), placeOfSupplyStateCode: '27', hsn: '998311' } },
      { token: m.token },
    );
    expect(adv.status).toBe(201);
    t.setNow('2026-10-10T10:00:00Z');
    const inv = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.mumbai.id, date: '2026-10-10', currency: 'INR', status: 'issued', lines: [consulting(m, 1_000_000)] }, { token: m.token });
    expect(inv.status).toBe(201);

    const list = await t.get(`${m.c}/payments/adjust`, { token: m.token, query: { partyId: m.mumbai.id } });
    expect(list.status).toBe(200);
    expect(list.body.credits).toEqual([expect.objectContaining({ sourceType: 'payment', id: adv.body.id, left: inr(1_180_000), advanceTax: true })]);
    expect(list.body.open).toEqual([expect.objectContaining({ documentId: inv.body.id, outstanding: inr(1_180_000), hasServiceLines: true })]);

    const done = await t.post(`${m.c}/payments/adjust`, { partyId: m.mumbai.id }, { token: m.token });
    expect(done.status).toBe(200);
    expect(done.body.applied).toEqual([{ sourceType: 'payment', sourceId: adv.body.id, documentId: inv.body.id, amount: inr(1_180_000) }]);
    expect(done.body.credits).toEqual([]);
    expect(done.body.open).toEqual([]);
    const paid = await t.get(`${m.c}/documents/${inv.body.id}`, { token: m.token });
    expect(paid.body.status).toBe('paid');
    const oct = await t.get(`${m.c}/gst/gstr1`, { token: m.token, query: { period: '102026' } });
    expect(oct.body.advances.adjusted).toEqual([{ placeOfSupply: '27', rate: 18, interState: false, taxable: inr(1_000_000), igst: inr(0), cgst: inr(90_000), sgst: inr(90_000), cess: inr(0) }]);
    expect(await tb(m, 'sys:gstOnAdvances')).toEqual(inr(0));
  });

  it('applies a direct credit note without any GST on advance, and settles a debit note', async () => {
    const m = await moneySetup(t);
    await registered(m);
    const inv = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.mumbai.id, date: '2026-09-20', currency: 'INR', status: 'issued', lines: [line(m.gst(18), { quantity: 1, unitPrice: inr(100_000) })] }, { token: m.token });
    expect(inv.status).toBe(201);
    const dn = await t.post(
      `${m.c}/documents`,
      { kind: 'debitNote', partyId: m.mumbai.id, sourceDocumentId: inv.body.id, date: '2026-09-21', currency: 'INR', noteReason: 'priceChange', status: 'issued', lines: [line(m.gst(18), { name: 'Rate difference', quantity: 1, unitPrice: inr(10_000) })] },
      { token: m.token },
    );
    expect(dn.status).toBe(201);
    const cn = await t.post(
      `${m.c}/documents`,
      { kind: 'creditNote', partyId: m.mumbai.id, date: '2026-09-25', currency: 'INR', noteReason: 'discount', status: 'issued', lines: [line(m.gst(18), { name: 'Volume discount', quantity: 1, unitPrice: inr(50_000) })] },
      { token: m.token },
    );
    expect(cn.status).toBe(201);
    const before = await t.get(`${m.c}/parties/${m.mumbai.id}`, { token: m.token });

    const list = await t.get(`${m.c}/payments/adjust`, { token: m.token, query: { partyId: m.mumbai.id } });
    expect(list.body.credits).toEqual([expect.objectContaining({ sourceType: 'note', id: cn.body.id, left: inr(59_000) })]);
    expect(list.body.open.map((o: { documentId: string }) => o.documentId)).toEqual([inv.body.id, dn.body.id]);

    // Chosen by hand: part to the debit note, the rest to the invoice.
    const tooMuch = await t.post(`${m.c}/payments/adjust`, { partyId: m.mumbai.id, allocations: [{ sourceType: 'note', sourceId: cn.body.id, documentId: dn.body.id, amount: inr(20_000) }] }, { token: m.token });
    expect(tooMuch.status).toBe(422);
    const done = await t.post(
      `${m.c}/payments/adjust`,
      {
        partyId: m.mumbai.id,
        allocations: [
          { sourceType: 'note', sourceId: cn.body.id, documentId: dn.body.id, amount: inr(11_800) },
          { sourceType: 'note', sourceId: cn.body.id, documentId: inv.body.id, amount: inr(47_200) },
        ],
      },
      { token: m.token },
    );
    expect(done.status).toBe(200);
    expect(done.body.credits).toEqual([]);
    expect(done.body.open).toEqual([expect.objectContaining({ documentId: inv.body.id, outstanding: inr(70_800) })]);
    expect((await t.get(`${m.c}/documents/${dn.body.id}`, { token: m.token })).body.status).toBe('paid');

    // Not money and not an advance: nothing reaches table 11 or GST on advances, and what the party owes is the same.
    const [company] = await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.companyId));
    expect(await loadAdvanceEvents(t.deps.db, company, '2027-03-31')).toEqual([]);
    expect(await tb(m, 'sys:gstOnAdvances')).toEqual(inr(0));
    const after = await t.get(`${m.c}/parties/${m.mumbai.id}`, { token: m.token });
    // What they owe falls by the note, and so does the credit they hold: the net is the same.
    expect(before.body.outstanding).toEqual(inr(129_800));
    expect(before.body.advance).toEqual(inr(59_000));
    expect(after.body.outstanding).toEqual(inr(70_800));
    expect(after.body.advance ?? inr(0)).toEqual(inr(0));
    // The note can't be cancelled while it is applied.
    const cancel = await t.post(`${m.c}/documents/${cn.body.id}/status`, { status: 'cancelled' }, { token: m.token });
    expect(cancel.status).toBe(409);
  });
});

describe('receipt vouchers', () => {
  it('keep a party, are searched by it and summed by what they were for', async () => {
    const m = await moneySetup(t);
    const site = await t.post(`${m.c}/cost-centres`, { name: 'Head office' }, { token: m.token });
    const receipt = (minor: number, over: Record<string, unknown> = {}) =>
      t.post(`${m.c}/vouchers`, { kind: 'receipt', date: '2026-09-20', lines: [{ account: `pay:${m.cash.id}`, debit: inr(minor), credit: inr(0) }, { account: 'sys:otherIncome', debit: inr(0), credit: inr(minor), costCentreId: site.body.id }], ...over }, { token: m.token });
    const rent = await receipt(500_000, { partyId: m.mumbai.id, narration: 'Rent for the godown' });
    expect(rent.status).toBe(201);
    expect(rent.body).toMatchObject({ partyId: m.mumbai.id, attachmentIds: [] });
    await receipt(20_000, { narration: 'Interest' });
    expect((await receipt(1_000, { partyId: 'pty_nope' })).status).toBe(422);

    const found = await t.get(`${m.c}/vouchers`, { token: m.token, query: { kind: 'receipt', q: 'Sunrise' } });
    expect(found.body.data.map((v: { id: string }) => v.id)).toEqual([rent.body.id]);
    const summary = await t.get(`${m.c}/vouchers/summary`, { token: m.token, query: { kind: 'receipt' } });
    expect(summary.status).toBe(200);
    expect(summary.body).toEqual({ count: 2, total: inr(520_000), byAccount: [{ account: 'sys:otherIncome', total: inr(520_000) }] });
    const report = await t.get(`${m.c}/books/cost-centres`, { token: m.token, query: { from: '2026-04-01', to: '2027-03-31' } });
    expect(report.body.rows.find((r: { costCentreId?: string }) => r.costCentreId === site.body.id).income).toBe(520_000);
  });
});

describe('cost centres on bill lines', () => {
  it('split what a bill costs over its lines’ centres, and keep stock on the bill’s', async () => {
    const m = await moneySetup(t);
    const a = await t.post(`${m.c}/cost-centres`, { name: 'Project A' }, { token: m.token });
    const b = await t.post(`${m.c}/cost-centres`, { name: 'Project B' }, { token: m.token });
    const service = { name: 'Site cleaning', quantity: 1, unit: 'NOS' };
    const bill = await t.post(
      `${m.c}/documents`,
      {
        kind: 'purchaseBill',
        partyId: m.supplier!.id,
        date: '2026-09-20',
        currency: 'INR',
        supplierDocNumber: 'KS/1',
        costCentreId: a.body.id,
        status: 'issued',
        lines: [line(m.gst(18), { ...service, unitPrice: inr(30_000) }), line(m.gst(18), { ...service, name: 'Scaffolding hire', unitPrice: inr(70_000), costCentreId: b.body.id })],
      },
      { token: m.token },
    );
    expect(bill.status).toBe(201);
    expect(bill.body.lines[1].costCentreId).toBe(b.body.id);
    const report = await t.get(`${m.c}/books/cost-centres`, { token: m.token, query: { from: '2026-04-01', to: '2027-03-31' } });
    const centre = (id: string) => report.body.rows.find((r: { costCentreId?: string }) => r.costCentreId === id);
    expect(centre(a.body.id).expense).toBe(30_000);
    expect(centre(b.body.id).expense).toBe(70_000);

    // A stock item's line takes the bill's centre.
    const rod = await m.item();
    const stock = await t.post(
      `${m.c}/documents`,
      { kind: 'purchaseBill', partyId: m.supplier!.id, date: '2026-09-21', currency: 'INR', supplierDocNumber: 'KS/2', status: 'issued', lines: [line(m.gst(18), { itemId: rod, costCentreId: b.body.id })] },
      { token: m.token },
    );
    expect(stock.status).toBe(422);
    expect(stock.body.issues[0].field).toBe('lines[0].costCentreId');
    // A centre in use on a line stays.
    const remove = await t.del(`${m.c}/cost-centres/${b.body.id}`, { token: m.token, headers: { 'if-match': `"${b.body.version}"` } });
    expect(remove.status).toBe(409);
  });
});
