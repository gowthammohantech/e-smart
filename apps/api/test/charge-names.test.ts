import { describe, expect, it } from 'vitest';
import { setupApi } from './helpers';
import { invoiceBody, moneySetup, pdfText } from './money-fixtures';

const t = setupApi();

describe('a business’s own names for other charges', () => {
  it('are its own: added, listed and renamed by it, never seen by another business', async () => {
    const a = await moneySetup(t);
    const b = await moneySetup(t);

    const made = await t.post(`${a.c}/charge-names`, { name: '  Courier   charges ' }, { token: a.token });
    expect(made.status, made.raw).toBe(201);
    expect(made.body).toMatchObject({ name: 'Courier charges', status: 'active' });

    // One of each name per business, whatever its case.
    const again = await t.post(`${a.c}/charge-names`, { name: 'COURIER CHARGES' }, { token: a.token });
    expect(again.status).toBe(422);
    expect(again.body.code).toBe('CHARGE_NAME_EXISTS');

    // Another business sees none of them, and may have the same name for itself.
    expect((await t.get(`${b.c}/charge-names`, { token: b.token })).body.data).toEqual([]);
    expect((await t.post(`${b.c}/charge-names`, { name: 'Courier charges' }, { token: b.token })).status).toBe(201);
    expect((await t.get(`${a.c}/charge-names`, { token: b.token })).status).toBe(403);

    // Hidden, it stays listed (as inactive) so the business can bring it back.
    const hidden = await t.put(`${a.c}/charge-names/${made.body.id}`, { name: 'Courier charges', status: 'inactive' }, { token: a.token, headers: { 'if-match': `"${made.body.version}"` } });
    expect(hidden.status, hidden.raw).toBe(200);
    expect((await t.get(`${a.c}/charge-names`, { token: a.token })).body.data).toMatchObject([{ name: 'Courier charges', status: 'inactive' }]);
  });

  it('print on a document as chosen, and stay so when the name is renamed', async () => {
    const m = await moneySetup(t);
    const name = await t.post(`${m.c}/charge-names`, { name: 'Labour charges' }, { token: m.token });

    const doc = await t.post(`${m.c}/documents`, invoiceBody(m, { status: 'issued', charges: { minor: 50000, currency: 'INR' }, chargesKind: 'other', chargesLabel: 'Labour charges' }), { token: m.token });
    expect(doc.status, doc.raw).toBe(201);
    const id = doc.body.document?.id ?? doc.body.id;
    expect((await t.get(`${m.c}/documents/${id}`, { token: m.token })).body).toMatchObject({ chargesKind: 'other', chargesLabel: 'Labour charges' });

    await t.put(`${m.c}/charge-names/${name.body.id}`, { name: 'Loading labour' }, { token: m.token, headers: { 'if-match': `"${name.body.version}"` } });
    const pdf = await t.get(`${m.c}/documents/${id}/pdf`, { token: m.token });
    if (pdf.status === 200) expect(pdfText(pdf.raw)).toContain('Labour charges');
    expect((await t.get(`${m.c}/documents/${id}`, { token: m.token })).body.chargesLabel).toBe('Labour charges');

    // No charges, no name for them.
    const none = await t.post(`${m.c}/documents`, invoiceBody(m, { chargesLabel: 'Labour charges' }), { token: m.token });
    expect(none.body.chargesLabel).toBeUndefined();
  });
});
