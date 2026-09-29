import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { idem, ownerWithCompany, setupApi, type TestContext } from './helpers';

const t = setupApi();

const BILL = `TAX INVOICE
Precision Components Pvt Ltd
Plot 12, GIDC Vatva, Ahmedabad
GSTIN: 24AABCP1234F1ZQ
Invoice No: PC-2026/1183
Date: 14/05/2026
Steel Ball Bearing 6203 240 118.00 28,320.00
Hex Bolt M10x50 60 420.00 25,200.00
Sub Total 53,520.00
CGST 9% 4,816.80
SGST 9% 4,816.80
Grand Total 63,153.60`;

/** Reserves, uploads and completes an attachment; returns its id. */
async function uploadedScan(t: TestContext, c: string, token: string): Promise<string> {
  const reserved = await t.post(`${c}/attachments`, { name: 'bill.jpg', mimeType: 'image/jpeg', size: 4 }, { token });
  const u = new URL(reserved.body.uploadUrl);
  await t.app.inject({ method: 'PUT', url: u.pathname + u.search, headers: reserved.body.uploadHeaders, payload: Buffer.from('ffd8ffe0', 'hex') });
  await t.post(`${c}/attachments/${reserved.body.attachment.id}/complete`, {}, { token });
  return reserved.body.attachment.id;
}

const fieldsOf = (body: { fields: { key: string; value: string }[] }) => Object.fromEntries(body.fields.map((f) => [f.key, f.value]));

describe('ocr', () => {
  it('needs the OCR module', async () => {
    const { token, c } = await ownerWithCompany(t);
    const res = await t.post(`${c}/ocr/extractions`, { attachmentId: 'att_x', kind: 'expense' }, { token });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLAN_UPGRADE_REQUIRED');
  });

  it('extracts a supplier bill from its text and matches the supplier and items', async () => {
    const { token, c, company } = await ownerWithCompany(t, { plan: 'pro' });
    const [supplier] = await t.deps.db
      .insert(schema.parties)
      .values({ id: 'pty_prec', companyId: company.id!, kind: 'supplier', name: 'Precision Components Pvt Ltd', code: 'S-001', currency: 'INR', taxId: '24AABCP1234F1ZQ', billingLine1: 'Plot 12', billingCity: 'Ahmedabad', billingState: 'Gujarat', billingPostalCode: '382445', billingCountry: 'IN' })
      .returning();
    const [tax] = (await t.get(`${c}/tax-categories`, { token })).body.data;
    const item = await t.post(`${c}/items`, { sku: 'BRG-6203', name: 'Steel Ball Bearing 6203', type: 'goods', unit: 'PCS', salePrice: { minor: 15000, currency: 'INR' }, purchasePrice: { minor: 11800, currency: 'INR' }, taxCategoryId: tax.id }, { token });

    const attachmentId = await uploadedScan(t, c, token);
    const res = await t.post(`${c}/ocr/extractions`, { attachmentId, kind: 'purchaseBill', text: BILL }, { token, headers: idem() });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'completed', kind: 'purchaseBill', attachmentId, matchedPartyId: supplier.id });
    expect(fieldsOf(res.body)).toEqual({
      vendor: 'Precision Components Pvt Ltd',
      gstin: '24AABCP1234F1ZQ',
      date: '2026-05-14',
      reference: 'PC-2026/1183',
      amount: '63153.60',
      tax: '9633.60',
    });
    expect(res.body.lines).toEqual([
      { name: 'Steel Ball Bearing 6203', quantity: 240, unitPrice: 118, confidence: 0.8, matchedItemId: item.body.id },
      { name: 'Hex Bolt M10x50', quantity: 60, unitPrice: 420, confidence: 0.8 },
    ]);

    const got = await t.get(`${c}/ocr/extractions/${res.body.id}`, { token });
    expect(got.body).toEqual(res.body);
    const [line] = await t.deps.db.select().from(schema.ocrLines).where(eq(schema.ocrLines.extractionId, res.body.id)).limit(1);
    expect(line.unitPriceMinor).toBe(11800);
  });

  it('reads the sample receipt when no text is sent, and suggests an expense category', async () => {
    const { token, c } = await ownerWithCompany(t, { plan: 'pro' });
    const attachmentId = await uploadedScan(t, c, token);
    const res = await t.post(`${c}/ocr/extractions`, { attachmentId, kind: 'expense' }, { token });
    expect(res.status).toBe(202);
    const f = fieldsOf(res.body);
    expect(f).toMatchObject({ vendor: 'Urban Logistics', amount: '4720.00', tax: '720.00', reference: 'UL/2026/4471', category: 'Transport & freight' });
    expect(res.body.fields.find((x: { key: string }) => x.key === 'category').confidence).toBeLessThan(0.75);
    expect(res.body.lines).toEqual([]);
    expect(res.body.matchedPartyId).toBeUndefined();
  });

  it('refuses a pending or foreign attachment and hides other companies’ extractions', async () => {
    const { token, c } = await ownerWithCompany(t, { plan: 'pro' });
    const other = await ownerWithCompany(t, { plan: 'pro' });
    const pending = await t.post(`${c}/attachments`, { name: 'bill.jpg', mimeType: 'image/jpeg', size: 4 }, { token });
    const notReady = await t.post(`${c}/ocr/extractions`, { attachmentId: pending.body.attachment.id, kind: 'expense' }, { token });
    expect(notReady.status).toBe(422);
    expect(notReady.body.code).toBe('ATTACHMENT_NOT_READY');

    const attachmentId = await uploadedScan(t, c, token);
    const foreign = await t.post(`${other.c}/ocr/extractions`, { attachmentId, kind: 'expense' }, { token: other.token });
    expect(foreign.status).toBe(422);

    const mine = await t.post(`${c}/ocr/extractions`, { attachmentId, kind: 'expense' }, { token });
    expect((await t.get(`${other.c}/ocr/extractions/${mine.body.id}`, { token: other.token })).status).toBe(404);
    // The scan stays while an extraction points at it.
    const del = await t.del(`${c}/attachments/${attachmentId}`, { token });
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('ATTACHMENT_IN_USE');
  });
});
