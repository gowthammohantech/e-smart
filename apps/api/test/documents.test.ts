import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { sha256 } from '../src/lib/crypto';
import { ownerWithCompany, setupApi } from './helpers';
import { documentRow, invoiceBody, issueInvoice, line, moneySetup, onHand, pdfText } from './money-fixtures';

const t = setupApi();

describe('documents: totals', () => {
  it('charges IGST to a customer in another state and CGST+SGST in the same state', async () => {
    const m = await moneySetup(t);
    const inter = await t.post(`${m.c}/documents`, invoiceBody(m, { partyId: m.bengaluru.id }), { token: m.token });
    expect(inter.status).toBe(201);
    expect(inter.body).toMatchObject({ number: 'INVOICE-DRAFT', status: 'draft', placeOfSupplyStateCode: '29' });
    expect(inter.body.lines[0].taxRate).toBe(18);
    expect(inter.body.totals.taxLines[0].components).toEqual([{ type: 'IGST', label: 'IGST 18%', rate: 18, amount: { minor: 36000, currency: 'INR' } }]);
    expect(inter.body.totals.grandTotal).toEqual({ minor: 236000, currency: 'INR' });

    const intra = await t.post(`${m.c}/documents`, invoiceBody(m), { token: m.token });
    expect(intra.body.totals.taxLines[0].components).toEqual([
      { type: 'CGST', label: 'CGST 9%', rate: 9, amount: { minor: 18000, currency: 'INR' } },
      { type: 'SGST', label: 'SGST 9%', rate: 9, amount: { minor: 18000, currency: 'INR' } },
    ]);
    expect(intra.body.totals).toMatchObject({ subtotal: { minor: 200000 }, taxableAmount: { minor: 200000 }, totalTax: { minor: 36000 }, grandTotal: { minor: 236000 } });

    // Every total column is persisted, with the tax breakdown.
    const row = await documentRow(t, intra.body.id);
    expect(row).toMatchObject({ subtotalMinor: 200000, taxableAmountMinor: 200000, totalTaxMinor: 36000, grandTotalMinor: 236000, grandTotalBaseMinor: 236000, roundOffMinor: 0 });
    const components = await t.deps.db
      .select({ type: schema.documentTaxComponents.type, amount: schema.documentTaxComponents.amountMinor })
      .from(schema.documentTaxComponents)
      .innerJoin(schema.documentTaxLines, eq(schema.documentTaxLines.id, schema.documentTaxComponents.taxLineId))
      .where(eq(schema.documentTaxLines.documentId, intra.body.id));
    expect(components.sort((a, b) => a.type.localeCompare(b.type))).toEqual([
      { type: 'CGST', amount: 18000 },
      { type: 'SGST', amount: 18000 },
    ]);
  });

  it('rounds off to the rupee, applies discounts in FRD order, and calculates without saving', async () => {
    const m = await moneySetup(t);
    const calc = await t.post(`${m.c}/documents/calculate`, invoiceBody(m, { lines: [line(m.gst(18), { quantity: 1, unitPrice: { minor: 104950, currency: 'INR' } })] }), { token: m.token });
    expect(calc.status).toBe(200);
    // 1,049.50 + 18% (188.91) = 1,238.41 → 1,238.00
    expect(calc.body).toMatchObject({ totalTax: { minor: 18891 }, roundOff: { minor: -41, currency: 'INR' }, grandTotal: { minor: 123800 } });

    const disc = await t.post(
      `${m.c}/documents/calculate`,
      invoiceBody(m, {
        lines: [line(m.gst(5), { quantity: 4, unitPrice: { minor: 25000, currency: 'INR' }, discountMode: 'percent', discountValue: 10 })],
        documentDiscountMode: 'amount',
        documentDiscountValue: 50,
        charges: { minor: 2000, currency: 'INR' },
      }),
      { token: m.token },
    );
    // 4 × 250 = 1000 − 10% = 900 taxable; 5% = 45 → 945 − 50 + 20 = 915
    expect(disc.body).toMatchObject({ subtotal: { minor: 100000 }, lineDiscount: { minor: 10000 }, taxableAmount: { minor: 90000 }, totalTax: { minor: 4500 }, documentDiscount: { minor: 5000 }, charges: { minor: 2000 }, grandTotal: { minor: 91500 } });

    expect(await t.deps.db.select().from(schema.documents)).toHaveLength(0);
  });

  it('rejects lines that use another currency or an unknown tax category', async () => {
    const m = await moneySetup(t);
    const res = await t.post(
      `${m.c}/documents`,
      invoiceBody(m, { lines: [line('tax_nope'), line(m.gst(18), { unitPrice: { minor: 100, currency: 'USD' } })] }),
      { token: m.token },
    );
    expect(res.status).toBe(422);
    expect(res.body.issues.map((i: { field: string }) => i.field)).toEqual(['lines[0].taxCategoryId', 'lines[1].unitPrice.currency']);
  });
});

describe('documents: numbering and lifecycle', () => {
  it('numbers invoices INV/26-27/0001, /0002 on finalisation and restarts in the next fiscal year', async () => {
    const m = await moneySetup(t);
    t.setNow('2026-09-29T10:00:00Z');
    const a = await t.post(`${m.c}/documents`, invoiceBody(m), { token: m.token });
    const b = await t.post(`${m.c}/documents`, invoiceBody(m), { token: m.token });
    expect(a.body.number).toBe('INVOICE-DRAFT');

    const fb = await t.post(`${m.c}/documents/${b.body.id}/finalize`, {}, { token: m.token });
    expect(fb.status).toBe(200);
    expect(fb.body.document).toMatchObject({ number: 'INV/26-27/0001', status: 'issued', dueDate: '2026-10-29' });
    const fa = await t.post(`${m.c}/documents/${a.body.id}/finalize`, {}, { token: m.token });
    expect(fa.body.document.number).toBe('INV/26-27/0002');

    const again = await t.post(`${m.c}/documents/${a.body.id}/finalize`, {}, { token: m.token });
    expect(again.status).toBe(409);

    t.setNow('2027-04-02T10:00:00Z');
    const next = await issueInvoice(t, m, { date: '2027-04-02' });
    expect(next.number).toBe('INV/27-28/0001');
    const [series] = await t.deps.db
      .select()
      .from(schema.numberingSeries)
      .where(and(eq(schema.numberingSeries.companyId, m.companyId), eq(schema.numberingSeries.kind, 'invoice')));
    expect(series).toMatchObject({ nextNumber: 2, lastResetAt: '2027-04-01' });
  });

  it('hands out distinct, consecutive numbers to concurrent finalisations', async () => {
    const m = await moneySetup(t);
    t.setNow('2026-09-29T10:00:00Z');
    const drafts = await Promise.all([1, 2, 3, 4, 5].map(() => t.post(`${m.c}/documents`, invoiceBody(m), { token: m.token })));
    const done = await Promise.all(drafts.map((d) => t.post(`${m.c}/documents/${d.body.id}/finalize`, {}, { token: m.token })));
    expect(done.map((r) => r.body.document.number).sort()).toEqual(['INV/26-27/0001', 'INV/26-27/0002', 'INV/26-27/0003', 'INV/26-27/0004', 'INV/26-27/0005']);
  });

  it('deletes drafts only; a finalised document is cancelled and keeps its number', async () => {
    const m = await moneySetup(t);
    const draft = await t.post(`${m.c}/documents`, invoiceBody(m), { token: m.token });
    expect((await t.del(`${m.c}/documents/${draft.body.id}`, { token: m.token })).status).toBe(204);
    expect((await t.get(`${m.c}/documents/${draft.body.id}`, { token: m.token })).status).toBe(404);

    const inv = await issueInvoice(t, m);
    const del = await t.del(`${m.c}/documents/${inv.id}`, { token: m.token });
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('DOCUMENT_NOT_DRAFT');

    const cancelled = await t.post(`${m.c}/documents/${inv.id}/status`, { status: 'cancelled', reason: 'Raised twice' }, { token: m.token });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: 'cancelled', number: inv.number });

    const audit = await t.deps.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityId, inv.id));
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['created', 'finalized', 'marked cancelled']));
    const log = await t.deps.db.select().from(schema.changeLog).where(eq(schema.changeLog.entityId, inv.id));
    expect(log.every((l) => l.entityType === 'document')).toBe(true);
  });

  it('refuses a stale If-Match with 412 and freezes a finalised document except notes and terms', async () => {
    const m = await moneySetup(t);
    const draft = await t.post(`${m.c}/documents`, invoiceBody(m), { token: m.token });
    const url = `${m.c}/documents/${draft.body.id}`;
    expect(draft.headers.etag).toBe('"v1"');

    const edited = await t.patch(url, invoiceBody(m, { lines: [line(m.gst(12), { quantity: 3 })] }), { token: m.token, headers: { 'if-match': '"v1"' } });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ version: 2, totals: { taxableAmount: { minor: 300000 }, totalTax: { minor: 36000 }, grandTotal: { minor: 336000 } } });

    const stale = await t.patch(url, invoiceBody(m), { token: m.token, headers: { 'if-match': '"v1"' } });
    expect(stale.status).toBe(412);
    expect(stale.body.code).toBe('VERSION_MISMATCH');

    const fin = await t.post(`${url}/finalize`, {}, { token: m.token });
    const body = { ...invoiceBody(m), lines: edited.body.lines, dueDate: fin.body.document.dueDate };
    const notes = await t.patch(url, { ...body, notes: 'Thank you for your business' }, { token: m.token });
    expect(notes.status).toBe(200);
    expect(notes.body.notes).toBe('Thank you for your business');
    const change = await t.patch(url, { ...body, lines: [line(m.gst(12), { quantity: 5 })] }, { token: m.token });
    expect(change.status).toBe(409);
    expect(change.body.code).toBe('DOCUMENT_FINALIZED');
  });

  it('follows core transitions and never lets a client set a derived status', async () => {
    const m = await moneySetup(t);
    const quote = await t.post(`${m.c}/documents`, invoiceBody(m, { kind: 'quote' }), { token: m.token });
    const url = `${m.c}/documents/${quote.body.id}`;

    const paid = await t.post(`${url}/status`, { status: 'paid' }, { token: m.token });
    expect(paid.status).toBe(422);
    expect(paid.body.code).toBe('STATUS_DERIVED');

    const bad = await t.post(`${url}/status`, { status: 'accepted' }, { token: m.token });
    expect(bad.status).toBe(409);
    expect(bad.body.code).toBe('INVALID_TRANSITION');

    const sent = await t.post(`${url}/status`, { status: 'sent' }, { token: m.token });
    expect(sent.body).toMatchObject({ status: 'sent', number: 'QT/26-27/0001' });
    const accepted = await t.post(`${url}/status`, { status: 'accepted' }, { token: m.token });
    expect(accepted.body.status).toBe('accepted');

    const detail = await t.get(url, { token: m.token });
    expect(detail.body.allowedTransitions).toEqual([]);
    expect(detail.body.allowedConversions).toEqual(['salesOrder', 'invoice']);
  });

  it('converts quote → order → delivery → invoice with source links, and duplicates into a new draft', async () => {
    const m = await moneySetup(t);
    t.setNow('2026-09-29T10:00:00Z');
    const quote = await t.post(`${m.c}/documents`, invoiceBody(m, { kind: 'quote', status: 'sent', lines: [line(m.gst(18)), line(m.gst(5), { name: 'Bolts' })] }), { token: m.token });
    const order = await t.post(`${m.c}/documents/${quote.body.id}/convert`, { targetKind: 'salesOrder', lineIds: [quote.body.lines[1].id] }, { token: m.token });
    expect(order.status).toBe(201);
    expect(order.body).toMatchObject({ kind: 'salesOrder', status: 'draft', number: 'SALESORDER-DRAFT', sourceDocumentId: quote.body.id });
    expect(order.body.lines.map((l: { name: string }) => l.name)).toEqual(['Bolts']);

    const wrong = await t.post(`${m.c}/documents/${quote.body.id}/convert`, { targetKind: 'delivery' }, { token: m.token });
    expect(wrong.status).toBe(409);
    expect(wrong.body.code).toBe('INVALID_CONVERSION');
    const returnFromDraft = await t.post(`${m.c}/documents/${order.body.id}/convert`, { targetKind: 'salesReturn' }, { token: m.token });
    expect(returnFromDraft.status).toBe(409);

    const detail = await t.get(`${m.c}/documents/${quote.body.id}`, { token: m.token });
    expect(detail.body.linkedDocuments.map((d: { id: string }) => d.id)).toEqual([order.body.id]);

    const dup = await t.post(`${m.c}/documents/${quote.body.id}/duplicate`, {}, { token: m.token });
    expect(dup.status).toBe(201);
    expect(dup.body).toMatchObject({ kind: 'quote', status: 'draft', number: 'QUOTE-DRAFT', date: '2026-09-29', totals: quote.body.totals });
    expect(dup.body.sourceDocumentId).toBeUndefined();
  });

  it('lists with filters, derived statuses and a cursor', async () => {
    const m = await moneySetup(t);
    t.setNow('2026-09-29T10:00:00Z');
    // Already overdue when issued.
    await issueInvoice(t, m, { date: '2026-08-01', dueDate: '2026-08-31' });
    await issueInvoice(t, m, { partyId: m.bengaluru.id });
    await t.post(`${m.c}/documents`, invoiceBody(m, { kind: 'quote' }), { token: m.token });

    const all = await t.get(`${m.c}/documents`, { token: m.token });
    expect(all.body.data).toHaveLength(3);
    const overdue = await t.get(`${m.c}/documents`, { token: m.token, query: { overdue: true } });
    expect(overdue.body.data).toHaveLength(1);
    expect(overdue.body.data[0]).toMatchObject({ status: 'overdue', outstanding: { minor: 236000 }, partyName: 'Sunrise Retail' });
    const byStatus = await t.get(`${m.c}/documents`, { token: m.token, query: { status: 'overdue' } });
    expect(byStatus.body.data.map((d: { id: string }) => d.id)).toEqual([overdue.body.data[0].id]);
    const invoices = await t.get(`${m.c}/documents`, { token: m.token, query: { kind: 'invoice', q: 'Anand' } });
    expect(invoices.body.data).toHaveLength(1);

    const p1 = await t.get(`${m.c}/documents`, { token: m.token, query: { limit: 2 } });
    const p2 = await t.get(`${m.c}/documents`, { token: m.token, query: { limit: 2, cursor: p1.body.nextCursor } });
    expect([...p1.body.data, ...p2.body.data].map((d: { id: string }) => d.id)).toEqual(all.body.data.map((d: { id: string }) => d.id));
    expect(p2.body.nextCursor).toBeNull();
  });
});

describe('documents: stock and plans', () => {
  it('moves stock on finalising a delivery, not again on its invoice, and reverses on cancel', async () => {
    const m = await moneySetup(t);
    const rod = await m.item();
    const service = await m.item({ trackInventory: false, name: 'Fitting' });
    const delivery = await t.post(
      `${m.c}/documents`,
      invoiceBody(m, { kind: 'delivery', lines: [line(m.gst(18), { itemId: rod, quantity: 3 }), line(m.gst(18), { itemId: service, name: 'Fitting' })] }),
      { token: m.token },
    );
    expect(await onHand(t, rod)).toBe(0);
    const done = await t.post(`${m.c}/documents/${delivery.body.id}/finalize`, {}, { token: m.token });
    expect(done.body.document).toMatchObject({ status: 'delivered', number: 'DN/26-27/0001' });
    expect(await onHand(t, rod)).toBe(-3);
    expect(await onHand(t, service)).toBe(0);
    const [mv] = await t.deps.db.select().from(schema.stockMovements).where(eq(schema.stockMovements.itemId, rod));
    expect(mv).toMatchObject({ type: 'salesIssue', referenceId: delivery.body.id, referenceNumber: 'DN/26-27/0001', unitCostMinor: 60000 });

    const inv = await t.post(`${m.c}/documents/${delivery.body.id}/convert`, { targetKind: 'invoice' }, { token: m.token });
    await t.post(`${m.c}/documents/${inv.body.id}/finalize`, {}, { token: m.token });
    expect(await onHand(t, rod)).toBe(-3);

    // A direct invoice moves stock itself; cancelling it puts the stock back.
    const direct = await issueInvoice(t, m, { lines: [line(m.gst(18), { itemId: rod, quantity: 2 })] });
    expect(await onHand(t, rod)).toBe(-5);
    await t.post(`${m.c}/documents/${direct.id}/status`, { status: 'cancelled' }, { token: m.token });
    expect(await onHand(t, rod)).toBe(-3);
  });

  it('needs the purchases module for purchase-side kinds, and receives stock on a bill', async () => {
    const free = await moneySetup(t, 'basic');
    const refused = await t.post(`${free.c}/documents`, invoiceBody(free, { kind: 'purchaseBill' }), { token: free.token });
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: 'PLAN_UPGRADE_REQUIRED', requiredPlan: 'pro' });
    const list = await t.get(`${free.c}/documents`, { token: free.token, query: { kind: 'purchaseOrder' } });
    expect(list.status).toBe(403);

    const m = await moneySetup(t);
    const rod = await m.item();
    const wrongParty = await t.post(`${m.c}/documents`, invoiceBody(m, { kind: 'purchaseBill' }), { token: m.token });
    expect(wrongParty.status).toBe(422);
    const bill = await t.post(
      `${m.c}/documents`,
      invoiceBody(m, { kind: 'purchaseBill', partyId: m.supplier!.id, supplierDocNumber: 'KS-889', status: 'issued', lines: [line(m.gst(18), { itemId: rod, quantity: 5, unitPrice: { minor: 55000, currency: 'INR' } })] }),
      { token: m.token },
    );
    expect(bill.body).toMatchObject({ number: 'BILL/26-27/0001', status: 'issued' });
    expect(await onHand(t, rod)).toBe(5);
    const [mv] = await t.deps.db.select().from(schema.stockMovements).where(eq(schema.stockMovements.itemId, rod));
    expect(mv).toMatchObject({ type: 'purchaseReceipt', unitCostMinor: 55000 });
  });

  it('keeps other companies out and viewers read-only', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const other = await ownerWithCompany(t);
    expect((await t.get(`${other.c}/documents/${inv.id}`, { token: other.token })).status).toBe(404);
    expect((await t.post(`${other.c}/documents/${inv.id}/finalize`, {}, { token: other.token })).status).toBe(404);

    await t.deps.db.update(schema.users).set({ role: 'viewer' }).where(eq(schema.users.id, m.user.id!));
    const res = await t.post(`${m.c}/documents`, invoiceBody(m), { token: m.token });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROLE_FORBIDDEN');
    expect((await t.get(`${m.c}/documents/${inv.id}`, { token: m.token })).status).toBe(200);
  });
});

describe('documents: output', () => {
  it('renders the PDF, and mints a hashed share link and a payment link', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const pdf = await t.get(`${m.c}/documents/${inv.id}/pdf`, { token: m.token });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.headers['content-disposition']).toContain('INV-26-27-0001.pdf');
    expect(pdf.raw.startsWith('%PDF-')).toBe(true);
    expect(pdfText(pdf.raw)).toContain('INV/26-27/0001');

    const share = await t.post(`${m.c}/documents/${inv.id}/share-link`, {}, { token: m.token });
    expect(share.body.url).toMatch(/^http:\/\/localhost:4000\/share\/[A-Za-z0-9_-]+$/);
    const token = share.body.url.split('/').pop();
    const [stored] = await t.deps.db.select().from(schema.shareLinks).where(eq(schema.shareLinks.documentId, inv.id));
    expect(stored.tokenHash).toBe(sha256(token));

    const link = await t.post(`${m.c}/documents/${inv.id}/payment-link`, { amount: { minor: 100000, currency: 'INR' } }, { token: m.token });
    expect(link.status).toBe(200);
    expect(link.body.upiUri).toContain('am=1000.00');
    const [pl] = await t.deps.db.select().from(schema.paymentLinks).where(eq(schema.paymentLinks.documentId, inv.id));
    expect(pl).toMatchObject({ amountMinor: 100000, status: 'active', url: link.body.url });
    const tooMuch = await t.post(`${m.c}/documents/${inv.id}/payment-link`, { amount: { minor: 999999, currency: 'INR' } }, { token: m.token });
    expect(tooMuch.status).toBe(422);
  });

  it('sends by WhatsApp, logs the delivery, notifies, and issues a draft quote', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const res = await t.post(`${m.c}/documents/${inv.id}/send`, { channel: 'whatsapp', includePaymentLink: true }, { token: m.token });
    expect(res.status).toBe(202);
    const msg = t.providers.outbox.last('whatsapp', '+919800000001');
    expect(msg?.text).toContain('INV/26-27/0001');
    expect(msg?.text).toMatch(/Pay: http/);
    const [delivery] = await t.deps.db.select().from(schema.messageDeliveries).where(eq(schema.messageDeliveries.id, res.body.messageId));
    expect(delivery).toMatchObject({ channel: 'whatsapp', purpose: 'documentSend', status: 'sent', documentId: inv.id, includePaymentLink: true });
    const notes = await t.deps.db.select().from(schema.notifications).where(eq(schema.notifications.companyId, m.companyId));
    expect(notes.map((n) => n.kind)).toContain('invoiceSent');
    expect((await t.get(`${m.c}/documents/${inv.id}`, { token: m.token })).body.status).toBe('issued');

    const quote = await t.post(`${m.c}/documents`, invoiceBody(m, { kind: 'quote' }), { token: m.token });
    await t.post(`${m.c}/documents/${quote.body.id}/send`, { channel: 'email' }, { token: m.token });
    expect(t.providers.outbox.last('email', 'accounts@sunrise.example')?.subject).toBe('QT/26-27/0001 from Vertex Traders');
    const sentQuote = await t.get(`${m.c}/documents/${quote.body.id}`, { token: m.token });
    expect(sentQuote.body).toMatchObject({ status: 'sent', number: 'QT/26-27/0001' });
  });
});
