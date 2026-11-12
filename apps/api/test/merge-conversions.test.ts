import { beforeEach, describe, expect, it } from 'vitest';
import { setupApi } from './helpers';
import { invoiceBody, line, moneySetup, onHand, type Money } from './money-fixtures';

const t = setupApi();
beforeEach(() => t.setNow('2026-09-29T10:00:00Z'));

type Doc = { id: string; number: string; lines: { name: string }[]; sourceDocumentId?: string; mergedSourceIds?: string[] };
const names = (d: Doc) => d.lines.map((l) => l.name);
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

/** A finalised document of `kind` with one line called `name`. */
async function made(m: Money, kind: string, name: string, over: Record<string, unknown> = {}): Promise<Doc> {
  const res = await t.post(`${m.c}/documents`, invoiceBody(m, { kind, status: over.status ?? 'confirmed', lines: [line(m.gst(18), { name })], ...over }), { token: m.token });
  if (res.status !== 201) throw new Error(`${kind}: ${res.status} ${res.raw}`);
  return res.body;
}

const convert = (m: Money, from: Doc, targetKind: string, alsoFrom?: Doc[]) =>
  t.post(`${m.c}/documents/${from.id}/convert`, { targetKind, ...(alsoFrom && { alsoFrom: ids(alsoFrom) }) }, { token: m.token });

describe('merge conversions: sales orders into one delivery challan', () => {
  it('offers the party’s other open orders and carries all their lines into one challan', async () => {
    const m = await moneySetup(t);
    const first = await made(m, 'salesOrder', 'Rods', { date: '2026-09-20' });
    const second = await made(m, 'salesOrder', 'Bolts', { date: '2026-09-25' });
    // Another customer's, and a draft: neither goes in.
    await made(m, 'salesOrder', 'Nuts', { partyId: m.bengaluru.id });
    await made(m, 'salesOrder', 'Washers', { status: 'draft' });

    const detail = await t.get(`${m.c}/documents/${first.id}`, { token: m.token });
    expect(ids(detail.body.mergeableWith)).toEqual([second.id]);

    const challan = await convert(m, first, 'delivery', [second]);
    expect(challan.status).toBe(201);
    expect(challan.body).toMatchObject({ kind: 'delivery', status: 'draft', sourceDocumentId: first.id, mergedSourceIds: [second.id] });
    expect(names(challan.body)).toEqual(['Rods', 'Bolts']);

    // Both are carried forward now: neither converts again, and each lists the challan.
    for (const order of [first, second]) {
      const again = await convert(m, order, 'delivery');
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('ALREADY_CONVERTED');
      const d = await t.get(`${m.c}/documents/${order.id}`, { token: m.token });
      expect(d.body.allowedConversions).toEqual([]);
      expect(d.body.mergeableWith).toEqual([]);
      expect(ids(d.body.linkedDocuments)).toContain(challan.body.id);
      const list = await t.get(`${m.c}/documents`, { token: m.token, query: { sourceDocumentId: order.id } });
      expect(ids(list.body.data)).toEqual([challan.body.id]);
    }
    // The challan lists the orders it came from.
    const own = await t.get(`${m.c}/documents/${challan.body.id}`, { token: m.token });
    expect(ids(own.body.linkedDocuments).sort()).toEqual([first.id, second.id].sort());

    // Thrown away, it frees both orders again.
    const del = await t.del(`${m.c}/documents/${challan.body.id}`, { token: m.token });
    expect(del.status).toBe(204);
    const freed = await t.get(`${m.c}/documents/${second.id}`, { token: m.token });
    expect(freed.body.allowedConversions).toContain('delivery');
  });

  it('refuses an order of another party, a draft, or one already carried forward', async () => {
    const m = await moneySetup(t);
    const first = await made(m, 'salesOrder', 'Rods');
    const elsewhere = await made(m, 'salesOrder', 'Nuts', { partyId: m.bengaluru.id });
    const draft = await made(m, 'salesOrder', 'Washers', { status: 'draft' });
    const quote = await made(m, 'quote', 'Bolts', { status: 'sent' });

    for (const other of [elsewhere, draft, quote]) {
      const res = await convert(m, first, 'delivery', [other]);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INVALID_MERGE');
    }
    const taken = await made(m, 'salesOrder', 'Bolts');
    expect((await convert(m, taken, 'delivery')).status).toBe(201);
    const res = await convert(m, first, 'delivery', [taken]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_CONVERTED');
  });

  it('merges only where the conversion allows it', async () => {
    const m = await moneySetup(t);
    const a = await made(m, 'quote', 'Rods', { status: 'sent' });
    const b = await made(m, 'quote', 'Bolts', { status: 'sent' });
    const res = await convert(m, a, 'salesOrder', [b]);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_MERGE');
    const detail = await t.get(`${m.c}/documents/${a.id}`, { token: m.token });
    expect(detail.body.mergeableWith).toEqual([]);
  });
});

describe('merge conversions: delivery notes into one invoice', () => {
  it('bills several delivery notes on one invoice, which moves no stock again', async () => {
    const m = await moneySetup(t);
    await m.allowNegativeStock();
    const itemId = await m.item();
    const note = (name: string, quantity: number, date: string) => made(m, 'delivery', name, { status: 'delivered', date, lines: [line(m.gst(18), { name, itemId, quantity })] });
    const first = await note('Rods', 2, '2026-09-20');
    const second = await note('More rods', 3, '2026-09-25');
    expect(await onHand(t, itemId)).toBe(-5);

    const detail = await t.get(`${m.c}/documents/${second.id}`, { token: m.token });
    expect(ids(detail.body.mergeableWith)).toEqual([first.id]);

    // Converted from the later one: its lines come first, the earlier note's after.
    const invoice = await convert(m, second, 'invoice', [first]);
    expect(invoice.status).toBe(201);
    expect(invoice.body).toMatchObject({ kind: 'invoice', sourceDocumentId: second.id, mergedSourceIds: [first.id] });
    expect(names(invoice.body)).toEqual(['More rods', 'Rods']);
    const issued = await t.post(`${m.c}/documents/${invoice.body.id}/finalize`, {}, { token: m.token });
    expect(issued.status).toBe(200);
    expect(issued.body.document.totals.grandTotal.minor).toBe(5 * 100000 * 1.18);
    // The notes took the stock out; the invoice leaves it.
    expect(await onHand(t, itemId)).toBe(-5);
    expect((await convert(m, first, 'invoice')).body.code).toBe('ALREADY_CONVERTED');
  });

  it('an invoice from a challan merged from orders moves no stock either', async () => {
    const m = await moneySetup(t);
    await m.allowNegativeStock();
    const itemId = await m.item();
    const order = (name: string) => made(m, 'salesOrder', name, { lines: [line(m.gst(18), { name, itemId, quantity: 1 })] });
    const a = await order('Rods');
    const b = await order('Bolts');
    const challan = await convert(m, a, 'delivery', [b]);
    expect((await t.post(`${m.c}/documents/${challan.body.id}/finalize`, {}, { token: m.token })).status).toBe(200);
    expect(await onHand(t, itemId)).toBe(-2);
    const invoice = await convert(m, challan.body, 'invoice');
    expect((await t.post(`${m.c}/documents/${invoice.body.id}/finalize`, {}, { token: m.token })).status).toBe(200);
    expect(await onHand(t, itemId)).toBe(-2);
  });
});

describe('merge conversions: purchase orders into one goods receipt', () => {
  it('receives several of a supplier’s open orders on one GRN, which takes the stock in once', async () => {
    const m = await moneySetup(t);
    const itemId = await m.item();
    const po = (name: string, quantity: number, date: string, over: Record<string, unknown> = {}) =>
      made(m, 'purchaseOrder', name, { partyId: m.supplier!.id, date, lines: [line(m.gst(18), { name, itemId, quantity })], ...over });
    const first = await po('Rods', 4, '2026-09-10');
    const second = await po('More rods', 6, '2026-09-15');
    // A customer's order is not the supplier's.
    await made(m, 'salesOrder', 'Rods');

    const detail = await t.get(`${m.c}/documents/${first.id}`, { token: m.token });
    expect(ids(detail.body.mergeableWith)).toEqual([second.id]);

    const grn = await convert(m, first, 'goodsReceipt', [second]);
    expect(grn.status).toBe(201);
    expect(grn.body).toMatchObject({ kind: 'goodsReceipt', partyId: m.supplier!.id, sourceDocumentId: first.id, mergedSourceIds: [second.id] });
    expect(names(grn.body)).toEqual(['Rods', 'More rods']);
    expect((await t.post(`${m.c}/documents/${grn.body.id}/finalize`, {}, { token: m.token })).status).toBe(200);
    expect(await onHand(t, itemId)).toBe(10);

    for (const order of [first, second]) {
      const again = await convert(m, order, 'goodsReceipt');
      expect(again.body.code).toBe('ALREADY_CONVERTED');
      const d = await t.get(`${m.c}/documents/${order.id}`, { token: m.token });
      expect(ids(d.body.linkedDocuments)).toContain(grn.body.id);
    }
  });

  it('a purchase order goes straight to a bill one at a time', async () => {
    const m = await moneySetup(t);
    const a = await made(m, 'purchaseOrder', 'Rods', { partyId: m.supplier!.id });
    const b = await made(m, 'purchaseOrder', 'Bolts', { partyId: m.supplier!.id });
    const res = await convert(m, a, 'purchaseBill', [b]);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_MERGE');
  });
});

describe('merge conversions: goods receipts into one purchase bill', () => {
  it('bills several GRNs on one purchase bill, which adds no stock again', async () => {
    const m = await moneySetup(t);
    const itemId = await m.item();
    const grn = (name: string, quantity: number, date: string) =>
      made(m, 'goodsReceipt', name, { partyId: m.supplier!.id, status: 'received', date, lines: [line(m.gst(18), { name, itemId, quantity })] });
    const first = await grn('Rods', 4, '2026-09-10');
    const second = await grn('More rods', 6, '2026-09-15');
    expect(await onHand(t, itemId)).toBe(10);

    const detail = await t.get(`${m.c}/documents/${first.id}`, { token: m.token });
    expect(ids(detail.body.mergeableWith)).toEqual([second.id]);

    const bill = await convert(m, first, 'purchaseBill', [second]);
    expect(bill.status).toBe(201);
    expect(bill.body).toMatchObject({ kind: 'purchaseBill', sourceDocumentId: first.id, mergedSourceIds: [second.id] });
    expect(names(bill.body)).toEqual(['Rods', 'More rods']);
    const patched = await t.patch(`${m.c}/documents/${bill.body.id}`, { ...invoiceBody(m, { kind: 'purchaseBill', partyId: m.supplier!.id, lines: bill.body.lines }), supplierDocNumber: 'KS/2026/118' }, { token: m.token });
    expect(patched.status).toBe(200);
    const issued = await t.post(`${m.c}/documents/${bill.body.id}/finalize`, {}, { token: m.token });
    expect(issued.status).toBe(200);
    expect(issued.body.document.totals.grandTotal.minor).toBe(10 * 100000 * 1.18);
    // The receipts brought the stock in; the bill leaves it.
    expect(await onHand(t, itemId)).toBe(10);
    expect((await convert(m, second, 'purchaseBill')).body.code).toBe('ALREADY_CONVERTED');
  });

  it('a bill from a GRN merged from purchase orders adds no stock either', async () => {
    const m = await moneySetup(t);
    const itemId = await m.item();
    const po = (name: string) => made(m, 'purchaseOrder', name, { partyId: m.supplier!.id, lines: [line(m.gst(18), { name, itemId, quantity: 3 })] });
    const a = await po('Rods');
    const b = await po('Bolts');
    const grn = await convert(m, a, 'goodsReceipt', [b]);
    expect((await t.post(`${m.c}/documents/${grn.body.id}/finalize`, {}, { token: m.token })).status).toBe(200);
    expect(await onHand(t, itemId)).toBe(6);
    const bill = await convert(m, grn.body, 'purchaseBill');
    await t.patch(`${m.c}/documents/${bill.body.id}`, { ...invoiceBody(m, { kind: 'purchaseBill', partyId: m.supplier!.id, lines: bill.body.lines }), supplierDocNumber: 'KS/2026/119' }, { token: m.token });
    expect((await t.post(`${m.c}/documents/${bill.body.id}/finalize`, {}, { token: m.token })).status).toBe(200);
    expect(await onHand(t, itemId)).toBe(6);
  });
});

describe('merge conversions: refusals', () => {
  it('an order straight to an invoice goes one at a time', async () => {
    const m = await moneySetup(t);
    const a = await made(m, 'salesOrder', 'Rods');
    const b = await made(m, 'salesOrder', 'Bolts');
    const res = await convert(m, a, 'invoice', [b]);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_MERGE');
  });
});
