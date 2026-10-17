import { describe, expect, it } from 'vitest';
import { invoiceBody, moneySetup } from './money-fixtures';
import { setupApi } from './helpers';

const t = setupApi();

describe('router', () => {
  it('accepts comma-separated array query params (style: form, explode: false)', async () => {
    const m = await moneySetup(t);
    await t.post(`${m.c}/documents`, invoiceBody(m), { token: m.token });
    await t.post(`${m.c}/documents`, invoiceBody(m, { kind: 'quote' }), { token: m.token });
    await t.post(`${m.c}/documents`, invoiceBody(m, { kind: 'salesOrder' }), { token: m.token });

    const res = await t.get(`${m.c}/documents`, { token: m.token, query: { kind: 'invoice,quote' } });
    expect(res.status).toBe(200);
    expect(res.body.data.map((d: { kind: string }) => d.kind).sort()).toEqual(['invoice', 'quote']);
  });
});
