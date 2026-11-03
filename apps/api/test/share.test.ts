import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { issueInvoice, moneySetup } from './money-fixtures';

const t = setupApi();

/** An issued invoice and a share link to it. */
async function shared() {
  const m = await moneySetup(t);
  const inv = await issueInvoice(t, m);
  const res = await t.post(`${m.c}/documents/${inv.id}/share-link`, {}, { token: m.token });
  const token = res.body.url.split('/').pop() as string;
  return { m, inv, token };
}

const open = (path: string) => t.app.inject({ method: 'GET', url: path });

describe('public share page', () => {
  it('shows the document to anyone with the link, counts the view, and keeps it private', async () => {
    const { inv, token } = await shared();
    const page = await open(`/share/${token}`);
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain(inv.number);
    expect(page.body).toContain('Download PDF');
    expect(page.headers).toMatchObject({
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex, nofollow',
    });
    expect(page.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(page.body).not.toContain('<script');

    const [link] = await t.deps.db.select().from(schema.shareLinks).where(eq(schema.shareLinks.documentId, inv.id));
    expect(link.viewCount).toBe(1);
    expect(link.lastViewedAt).not.toBeNull();
  });

  it('serves the PDF from the same link', async () => {
    const { token } = await shared();
    const pdf = await open(`/share/${token}/pdf`);
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.headers['content-disposition']).toContain('inline; filename="INV-26-27-0001.pdf"');
  });

  it('offers the payment link while the invoice is owing', async () => {
    const { m, inv, token } = await shared();
    expect((await open(`/share/${token}`)).body).not.toContain('Pay now');
    const link = await t.post(`${m.c}/documents/${inv.id}/payment-link`, {}, { token: m.token });
    const page = await open(`/share/${token}`);
    expect(page.body).toContain('Pay now');
    expect(page.body).toContain(link.body.url);
  });

  it('answers the same 404 for an unknown, malformed or expired token', async () => {
    const { inv, token } = await shared();
    const unknown = await open('/share/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const malformed = await open('/share/..%2F..%2Fetc');
    await t.deps.db.update(schema.shareLinks).set({ expiresAt: new Date(t.deps.now().getTime() - 1000) }).where(eq(schema.shareLinks.documentId, inv.id));
    const expired = await open(`/share/${token}`);
    for (const res of [unknown, malformed, expired]) {
      expect(res.statusCode).toBe(404);
      expect(res.body).toContain('This link isn’t available');
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(unknown.body).toBe(expired.body);
    expect((await open(`/share/${token}/pdf`)).statusCode).toBe(404);
  });

  it('withdraws the page when the document is cancelled or the account suspended', async () => {
    const a = await shared();
    await t.post(`${a.m.c}/documents/${a.inv.id}/status`, { status: 'cancelled', reason: 'Raised twice' }, { token: a.m.token });
    expect((await open(`/share/${a.token}`)).statusCode).toBe(404);

    const b = await shared();
    const [company] = await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, b.m.company.id!));
    await t.deps.db.update(schema.accounts).set({ suspendedAt: new Date(), suspendedReason: 'test' }).where(eq(schema.accounts.id, company.accountId));
    expect((await open(`/share/${b.token}`)).statusCode).toBe(404);
  });
});
