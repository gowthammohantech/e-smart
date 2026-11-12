import { beforeEach, describe, expect, it } from 'vitest';
import { setupApi } from './helpers';
import { invoiceBody, line, moneySetup, type Money } from './money-fixtures';

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
