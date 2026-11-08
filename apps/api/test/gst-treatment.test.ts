import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { documentRow, fundCash, invoiceBody, line, moneySetup, type Money } from './money-fixtures';

const t = setupApi();

const KARNATAKA = { line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', stateCode: '29', postalCode: '560001', country: 'IN' };

const bill = (m: Money, over: Record<string, unknown> = {}) =>
  invoiceBody(m, { kind: 'purchaseBill', partyId: m.supplier!.id, supplierDocNumber: 'GTA-42', ...over });

describe('GST treatment: masters', () => {
  it('keeps an item’s GST treatment and reads a party’s PAN from its GSTIN', async () => {
    const m = await moneySetup(t);
    const item = await t.post(
      `${m.c}/items`,
      { sku: 'FRT', name: 'Freight recovered', type: 'service', unit: 'NOS', salePrice: { minor: 0, currency: 'INR' }, purchasePrice: { minor: 0, currency: 'INR' }, taxCategoryId: m.gst(18), gst: { reimbursement: true, cessRate: 0 } },
      { token: m.token },
    );
    expect(item.status).toBe(201);
    expect(item.body.gst).toEqual({ reimbursement: true });

    const plain = await t.get(`${m.c}/parties/${m.bengaluru.id}`, { token: m.token });
    expect(plain.body.pan).toBe('AABCG4321K');

    const msme = await t.post(
      `${m.c}/parties`,
      { kind: 'supplier', name: 'Shree Transport', currency: 'INR', billingAddress: KARNATAKA, openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 15, msmeType: 'micro', udyamNumber: 'udyam-ka-03-0001234', reverseCharge: true },
      { token: m.token },
    );
    expect(msme.status).toBe(201);
    expect(msme.body).toMatchObject({ msmeType: 'micro', udyamNumber: 'UDYAM-KA-03-0001234', reverseCharge: true });
  });
});

describe('GST treatment: documents', () => {
  it('copies the item’s treatment onto the line and charges nothing on an exempt supply', async () => {
    const m = await moneySetup(t);
    const exempt = await m.item({ supplyType: 'exempt' });
    const res = await t.post(`${m.c}/documents`, invoiceBody(m, { lines: [line(m.gst(18), { itemId: exempt })] }), { token: m.token });
    expect(res.status).toBe(201);
    expect(res.body.lines[0]).toMatchObject({ taxRate: 0, gst: { supplyType: 'exempt' } });
    expect(res.body.totals).toMatchObject({ totalTax: { minor: 0 }, grandTotal: { minor: 200000 } });
  });

  it('adds cess as its own component and keeps a reimbursement out of the taxable value', async () => {
    const m = await moneySetup(t);
    const res = await t.post(
      `${m.c}/documents`,
      invoiceBody(m, {
        lines: [
          line(m.gst(18), { gst: { cessRate: 12 } }),
          line(m.gst(18), { name: 'Port charges paid for you', quantity: 1, unitPrice: { minor: 50000, currency: 'INR' }, gst: { reimbursement: true } }),
        ],
      }),
      { token: m.token },
    );
    expect(res.status).toBe(201);
    expect(res.body.totals.taxLines[0].components.map((c: { type: string }) => c.type)).toEqual(['CGST', 'SGST', 'CESS']);
    // 2,000 taxable + 360 GST + 240 cess, then the 500 recovered at cost.
    expect(res.body.totals).toMatchObject({ taxableAmount: { minor: 200000 }, totalTax: { minor: 60000 }, reimbursements: { minor: 50000 }, grandTotal: { minor: 310000 } });
    expect(await documentRow(t, res.body.id)).toMatchObject({ reimbursementsMinor: 50000 });
  });

  it('puts a bill from a reverse-charge supplier under reverse charge, outside what is owed to them', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.parties).set({ reverseCharge: true }).where(eq(schema.parties.id, m.supplier!.id));
    const res = await t.post(`${m.c}/documents`, bill(m, { status: 'issued' }), { token: m.token });
    expect(res.status).toBe(201);
    expect(res.body.reverseCharge).toBe(true);
    expect(res.body.totals).toMatchObject({ totalTax: { minor: 0 }, reverseChargeTax: { minor: 36000 }, grandTotal: { minor: 200000 } });
    expect(res.body.totals.taxLines[0].reverseCharge).toBe(true);
    // The supplier as registered then is kept with the bill.
    expect(res.body.partyStateCode).toBe('27');
  });

  it('takes a bill from a reverse-charge supplier out of reverse charge when it says so', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.parties).set({ reverseCharge: true }).where(eq(schema.parties.id, m.supplier!.id));
    const res = await t.post(`${m.c}/documents`, bill(m, { status: 'issued', reverseCharge: false }), { token: m.token });
    expect(res.status).toBe(201);
    expect(res.body.reverseCharge).toBeFalsy();
    expect(res.body.totals).toMatchObject({ totalTax: { minor: 36000 }, reverseChargeTax: { minor: 0 } });
  });

  it('charges no GST on a composition dealer’s sale', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.companies).set({ compositionScheme: true }).where(eq(schema.companies.id, m.companyId));
    const res = await t.post(`${m.c}/documents`, invoiceBody(m), { token: m.token });
    expect(res.body.totals).toMatchObject({ totalTax: { minor: 0 }, grandTotal: { minor: 200000 } });
  });

  it('supplies from a branch’s own GSTIN state', async () => {
    const m = await moneySetup(t);
    await t.deps.db.update(schema.branches).set({ gstin: '29AABCV1234F1ZQ' }).where(eq(schema.branches.id, m.branch.id));
    // A Mumbai buyer is now out of state.
    const res = await t.post(`${m.c}/documents`, invoiceBody(m), { token: m.token });
    expect(res.body.totals.taxLines[0].components.map((c: { type: string }) => c.type)).toEqual(['IGST']);
  });

  it('snapshots the buyer’s GSTIN when the invoice is issued', async () => {
    const m = await moneySetup(t);
    const res = await t.post(`${m.c}/documents`, invoiceBody(m, { partyId: m.bengaluru.id, status: 'issued' }), { token: m.token });
    expect(res.body).toMatchObject({ partyGstin: '29AABCG4321K1ZM', partyStateCode: '29' });
  });
});

describe('GST treatment: expenses', () => {
  it('works out reverse-charge tax on top of the supplier’s price', async () => {
    const m = await moneySetup(t);
    await fundCash(t, m);
    const [cat] = await t.deps.db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, m.companyId));
    const res = await t.post(
      `${m.c}/expenses`,
      { categoryId: cat.id, date: '2026-09-10', amount: { minor: 100000, currency: 'INR' }, currency: 'INR', accountId: m.cash.id, method: 'cash', taxCategoryId: m.gst(5), reverseCharge: true, supplierGstin: '29aabcs1111k1zz', itcEligibility: 'eligible' },
      { token: m.token },
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ amount: { minor: 100000 }, taxAmount: { minor: 5000 }, reverseCharge: true, supplierGstin: '29AABCS1111K1ZZ' });
  });
});
