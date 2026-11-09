import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { issueInvoice, moneySetup, pdfText } from './money-fixtures';

const t = setupApi();

const open = (path: string) => t.app.inject({ method: 'GET', url: path });

/** The share page for an invoice: the full printed HTML, where the stub PDF keeps only its start. */
async function sharePage(m: Awaited<ReturnType<typeof moneySetup>>, id: string) {
  const res = await t.post(`${m.c}/documents/${id}/share-link`, {}, { token: m.token });
  return (await open(`/share/${res.body.url.split('/').pop()}`)).body;
}

describe('printed layouts', () => {
  it("prints the company's layout, and one invoice's own over it, even once issued", async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    expect(await sharePage(m, inv.id)).toContain('class="head"'); // the standard page

    await t.deps.db.update(schema.companies).set({ invoiceTemplate: { layout: 'classic' } }).where(eq(schema.companies.id, m.companyId));
    const classic = await sharePage(m, inv.id);
    expect(classic).toContain('class="sheet"');
    expect(classic).toContain('Total tax amount');

    const set = await t.put(`${m.c}/documents/${inv.id}/print-layout`, { layout: 'modern' }, { token: m.token });
    expect(set.status).toBe(200);
    expect(set.body.printLayout).toBe('modern');
    expect(set.body.number).toBe(inv.number); // still the issued invoice, unchanged but for its layout
    expect(await sharePage(m, inv.id)).toContain('class="cards"');

    const back = await t.put(`${m.c}/documents/${inv.id}/print-layout`, { layout: null }, { token: m.token });
    expect(back.body.printLayout).toBeUndefined();
    expect(await sharePage(m, inv.id)).toContain('class="sheet"');

    const audit = await t.deps.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityId, inv.id));
    expect(audit.some((a) => JSON.stringify(a).includes('printLayout'))).toBe(true);
  });

  it('refuses a layout it does not know, and a stale If-Match', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    expect((await t.put(`${m.c}/documents/${inv.id}/print-layout`, { layout: 'fancy' }, { token: m.token })).status).toBe(422);
    const stale = await t.put(`${m.c}/documents/${inv.id}/print-layout`, { layout: 'classic' }, { token: m.token, headers: { 'if-match': '"v0"' } });
    expect(stale.status).toBe(412);
  });

  it('labels the copies, and prints all three in one file', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    await t.put(`${m.c}/documents/${inv.id}/print-layout`, { layout: 'classic' }, { token: m.token });
    const dup = await t.get(`${m.c}/documents/${inv.id}/pdf`, { token: m.token, query: { copy: 'duplicate' } });
    expect(dup.status).toBe(200);
    expect(pdfText(dup.raw)).toContain('DUPLICATE FOR TRANSPORTER');
    const all = await t.get(`${m.c}/documents/${inv.id}/pdf`, { token: m.token, query: { copy: 'all' } });
    expect(all.status).toBe(200);
    expect(pdfText(all.raw)).toContain('ORIGINAL FOR RECIPIENT');
  });

  it("keeps a viewer from changing an invoice's layout", async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    await t.deps.db.update(schema.users).set({ role: 'viewer' }).where(eq(schema.users.id, m.user.id!));
    expect((await t.put(`${m.c}/documents/${inv.id}/print-layout`, { layout: 'classic' }, { token: m.token })).status).toBe(403);
  });
});
