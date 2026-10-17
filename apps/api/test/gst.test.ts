import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { ownerWithCompany, setupApi } from './helpers';
import { invoiceBody, issueInvoice, line, moneySetup } from './money-fixtures';

const t = setupApi();

/**
 * September 2026: a B2B invoice to Bengaluru (IGST), a B2C invoice in Mumbai
 * (CGST + SGST), and a credit note against the B2B one. A draft, a cancelled
 * invoice and an October invoice must not count.
 */
async function september() {
  const m = await moneySetup(t);
  t.setNow('2026-10-05T10:00:00Z');
  const hsn = (over: Record<string, unknown> = {}) => [line(m.gst(18), { hsnCode: '7214', ...over })];
  const b2b = await issueInvoice(t, m, { partyId: m.bengaluru.id, date: '2026-09-10', lines: hsn() });
  const b2c = await issueInvoice(t, m, { date: '2026-09-12', lines: hsn({ quantity: 3 }) });
  const ret = await t.post(`${m.c}/documents/${b2b.id}/convert`, { targetKind: 'salesReturn' }, { token: m.token });
  await t.patch(`${m.c}/documents/${ret.body.id}`, { ...invoiceBody(m, { kind: 'salesReturn', partyId: m.bengaluru.id, date: '2026-09-20', sourceDocumentId: b2b.id }), lines: [line(m.gst(18), { hsnCode: '7214', quantity: 1 })] }, { token: m.token });
  const credit = await t.post(`${m.c}/documents/${ret.body.id}/finalize`, {}, { token: m.token });
  expect(credit.body.document.status).toBe('approved');

  await t.post(`${m.c}/documents`, invoiceBody(m, { date: '2026-09-15', lines: hsn() }), { token: m.token });
  const cancelled = await issueInvoice(t, m, { date: '2026-09-16', lines: hsn() });
  await t.post(`${m.c}/documents/${cancelled.id}/status`, { status: 'cancelled' }, { token: m.token });
  await issueInvoice(t, m, { date: '2026-10-01', lines: hsn() });
  return { m, b2b, b2c, credit: credit.body.document };
}

describe('gst: GSTR-1', () => {
  it('puts each document in its table and totals match the invoices', async () => {
    const { m, b2b, b2c, credit } = await september();
    const res = await t.get(`${m.c}/gst/gstr1`, { token: m.token, query: { period: '092026' } });
    expect(res.status).toBe(200);
    const s = res.body;
    expect(s.period).toBe('092026');
    expect(s.b2b).toEqual([
      expect.objectContaining({ documentId: b2b.id, gstin: '29AABCG4321K1ZM', placeOfSupply: '29', rate: 18, taxableValue: { minor: 200000, currency: 'INR' }, igst: { minor: 36000, currency: 'INR' }, invoiceValue: { minor: 236000, currency: 'INR' } }),
    ]);
    expect(s.b2cs).toEqual([expect.objectContaining({ documentId: b2c.id, cgst: { minor: 27000, currency: 'INR' }, sgst: { minor: 27000, currency: 'INR' }, taxableValue: { minor: 300000, currency: 'INR' } })]);
    expect(s.cdnr).toEqual([expect.objectContaining({ documentId: credit.id, invoiceValue: { minor: 118000, currency: 'INR' } })]);
    expect(s.b2cl).toEqual([]);

    // Totals: the invoices less the credit note, straight from the documents' own totals.
    const docs = await Promise.all([b2b.id, b2c.id, credit.id].map((id) => t.get(`${m.c}/documents/${id}`, { token: m.token })));
    const [inv1, inv2, cn] = docs.map((d) => d.body.totals);
    expect(s.totals).toEqual({
      taxableValue: { minor: inv1.taxableAmount.minor + inv2.taxableAmount.minor - cn.taxableAmount.minor, currency: 'INR' },
      tax: { minor: inv1.totalTax.minor + inv2.totalTax.minor - cn.totalTax.minor, currency: 'INR' },
      invoiceValue: { minor: inv1.grandTotal.minor + inv2.grandTotal.minor - cn.grandTotal.minor, currency: 'INR' },
      documents: 3,
    });
    expect(s.totals.taxableValue.minor).toBe(400000);
    expect(s.hsn).toEqual([expect.objectContaining({ hsnCode: '7214', quantity: 4, taxableValue: { minor: 400000, currency: 'INR' } })]);
    // Table 13 counts the cancelled invoice too, never the draft.
    expect(s.docs).toEqual([
      expect.objectContaining({ nature: 'creditNote', total: 1, cancelled: 0 }),
      expect.objectContaining({ nature: 'invoice', total: 3, cancelled: 1 }),
    ]);

    const bad = await t.get(`${m.c}/gst/gstr1`, { token: m.token, query: { period: '2026-09' }, unchecked: true });
    expect(bad.status).toBe(422);
    const other = await ownerWithCompany(t);
    const empty = await t.get(`${other.c}/gst/gstr1`, { token: other.token, query: { period: '092026' } });
    expect(empty.body.totals.documents).toBe(0);
  });

  it('exports the GSTN offline-tool JSON, CSV and Excel', async () => {
    const { m, b2b } = await september();
    const json = await t.get(`${m.c}/gst/gstr1/export`, { token: m.token, query: { period: '092026' } });
    expect(json.status).toBe(200);
    expect(json.headers['content-type']).toContain('application/json');
    expect(json.body).toMatchObject({
      gstin: '27AAPFU0939F1ZV',
      fp: '092026',
      b2b: [{ ctin: '29AABCG4321K1ZM', inv: [{ inum: b2b.number, idt: '10-09-2026', val: 2360, pos: '29', itms: [{ num: 1, itm_det: { txval: 2000, rt: 18, iamt: 360, camt: 0, samt: 0 } }] }] }],
      b2cs: [{ sply_ty: 'INTRA', pos: '27', rt: 18, txval: 3000, camt: 270, samt: 270 }],
      cdnr: [{ ctin: '29AABCG4321K1ZM', nt: [{ ntty: 'C', val: 1180 }] }],
      hsn: { data: [{ hsn_sc: '7214', uqc: 'NOS', qty: 4, txval: 4000 }] },
      doc_issue: { doc_det: [{ doc_num: 1, docs: [{ totnum: 3, cancel: 1, net_issue: 2 }] }, { doc_num: 5, docs: [{ totnum: 1, cancel: 0, net_issue: 1 }] }] },
    });

    const csv = await t.get(`${m.c}/gst/gstr1/export`, { token: m.token, query: { period: '092026', format: 'csv' } });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('GSTR1_27AAPFU0939F1ZV_092026.csv');
    const lines = csv.raw.trim().split('\r\n');
    expect(lines[0]).toBe('table,gstin,partyName,number,date,kind,placeOfSupply,rate,taxableValue,cgst,sgst,igst,invoiceValue');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe(`b2b,29AABCG4321K1ZM,Anand Enterprises,${b2b.number},2026-09-10,invoice,29-Karnataka,18,2000,0,0,360,2360`);

    const xlsx = await t.get(`${m.c}/gst/gstr1/export`, { token: m.token, query: { period: '092026', format: 'xlsx' } });
    expect(xlsx.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'B2B', 'B2CL', 'B2CS', 'EXP', 'CDNR', 'CDNUR', 'HSN', 'NIL', 'DOCS']);
    expect(wb.getWorksheet('B2B')!.getRow(3).getCell(11).value).toBe(2360);

    const bad = await t.get(`${m.c}/gst/gstr1/export`, { token: m.token, query: { period: 'sept' } });
    expect(bad.status).toBe(422);
  });
});
