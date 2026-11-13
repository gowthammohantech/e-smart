import { describe, expect, it } from 'vitest';
import { setupApi } from './helpers';
import { invoiceBody, moneySetup } from './money-fixtures';

const t = setupApi();

describe('the documents list order', () => {
  it('reads a day’s invoices by their number, newest first, across pages too', async () => {
    const m = await moneySetup(t);
    // Keyed in a, b, c but issued c, a, b: their numbers run against the order they were made.
    const drafts = [];
    for (let i = 0; i < 3; i++) drafts.push((await t.post(`${m.c}/documents`, invoiceBody(m), { token: m.token })).body.id as string);
    const [a, b, c] = drafts;
    for (const id of [c, a, b]) expect((await t.post(`${m.c}/documents/${id}/finalize`, {}, { token: m.token })).status).toBe(200);

    const all = await t.get(`${m.c}/documents`, { token: m.token, query: { kind: 'invoice' } });
    expect(all.body.data.map((d: { number: string }) => d.number)).toEqual(['INV/26-27/0003', 'INV/26-27/0002', 'INV/26-27/0001']);

    // A page at a time, the cursor carries the number too.
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { body: { data: { number: string }[]; nextCursor: string | null } } = await t.get(`${m.c}/documents`, { token: m.token, query: { kind: 'invoice', limit: '1', ...(cursor && { cursor }) } });
      seen.push(...page.body.data.map((d) => d.number));
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(seen).toEqual(['INV/26-27/0003', 'INV/26-27/0002', 'INV/26-27/0001']);
  });
});
