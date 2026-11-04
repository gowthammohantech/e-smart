import { beforeEach, describe, expect, it } from 'vitest';
import { setupApi } from './helpers';
import { documentRow, issueInvoice, line, moneySetup, onHand, type Money } from './money-fixtures';
import { joinTeam } from './team-helpers';

const t = setupApi();
beforeEach(() => t.setNow('2026-09-29T10:00:00Z'));

/** A value-only note: one line for the amount it changes, at the invoice's rate. */
const note = (m: Money, kind: string, sourceDocumentId: string, minor: number, over: Record<string, unknown> = {}) => ({
  kind,
  partyId: m.mumbai.id,
  sourceDocumentId,
  date: '2026-09-29',
  currency: 'INR',
  noteReason: 'discount',
  lines: [line(m.gst(18), { name: 'Rate difference', quantity: 1, unitPrice: { minor, currency: 'INR' } })],
  status: 'issued',
  ...over,
});

const receipt = (m: Money, over: Record<string, unknown> = {}) => ({
  direction: 'received',
  partyId: m.mumbai.id,
  date: '2026-09-29',
  amount: { minor: 0, currency: 'INR' },
  currency: 'INR',
  method: 'cash',
  accountId: m.cash.id,
  ...over,
});
const inr = (minor: number) => ({ minor, currency: 'INR' });

describe('credit and debit notes', () => {
  it('lowers what an invoice owes with a credit note, moving no stock', async () => {
    const m = await moneySetup(t);
    const itemId = await m.item();
    await m.allowNegativeStock();
    const inv = await issueInvoice(t, m, { lines: [line(m.gst(18), { itemId })] });
    const stockAfterSale = await onHand(t, itemId);

    const cn = await t.post(`${m.c}/documents`, note(m, 'creditNote', inv.id, 50000), { token: m.token });
    expect(cn.status).toBe(201);
    expect(cn.body).toMatchObject({ kind: 'creditNote', status: 'issued', noteReason: 'discount', number: 'CN/26-27/0001' });
    expect(cn.body.totals.grandTotal.minor).toBe(59000);
    expect(await onHand(t, itemId)).toBe(stockAfterSale);
    expect(await documentRow(t, inv.id)).toMatchObject({ amountPaidMinor: 59000, status: 'partiallyPaid' });

    // Cancelling the note gives the invoice its balance back.
    const cancelled = await t.post(`${m.c}/documents/${cn.body.id}/status`, { status: 'cancelled' }, { token: m.token, headers: { 'if-match': `"v${cn.body.version}"` } });
    expect(cancelled.status).toBe(200);
    expect(await documentRow(t, inv.id)).toMatchObject({ amountPaidMinor: 0 });
  });

  it('refuses credit beyond what the invoice charged, counting its debit notes', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m); // 2,360
    const tooMuch = await t.post(`${m.c}/documents`, note(m, 'creditNote', inv.id, 210000), { token: m.token });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.code).toBe('NOTE_EXCEEDS_SOURCE');

    const dn = await t.post(`${m.c}/documents`, note(m, 'debitNote', inv.id, 50000, { noteReason: 'priceChange' }), { token: m.token });
    expect(dn.status).toBe(201);
    expect(dn.body).toMatchObject({ kind: 'debitNote', status: 'issued', number: 'DBN/26-27/0001' });
    // The debit note is owed on its own, like an invoice.
    const balance = await t.get(`${m.c}/parties/${m.mumbai.id}`, { token: m.token });
    expect(balance.body.outstanding.minor).toBe(236000 + 59000);

    const fits = await t.post(`${m.c}/documents`, note(m, 'creditNote', inv.id, 210000), { token: m.token });
    expect(fits.status).toBe(201);
  });

  it('needs the invoice it changes, of the same party', async () => {
    const m = await moneySetup(t);
    const orphan = await t.post(`${m.c}/documents`, note(m, 'creditNote', '', 1000, { sourceDocumentId: undefined }), { token: m.token });
    expect(orphan.status).toBe(422);
    expect(orphan.body.issues[0].field).toBe('sourceDocumentId');

    const inv = await issueInvoice(t, m);
    const other = await t.post(`${m.c}/documents`, note(m, 'creditNote', inv.id, 1000, { partyId: m.bengaluru.id }), { token: m.token });
    expect(other.status).toBe(422);
  });

  it('refuses a credit note after 30 November following the year of the sale (s.34(2))', async () => {
    const m = await moneySetup(t);
    t.setNow('2025-06-10T10:00:00Z');
    const inv = await issueInvoice(t, m, { date: '2025-06-10' });
    t.setNow('2026-12-01T10:00:00Z');
    const late = await t.post(`${m.c}/documents`, note(m, 'creditNote', inv.id, 1000, { date: '2026-12-01' }), { token: m.token });
    expect(late.status).toBe(422);
    expect(late.body.code).toBe('NOTE_TIME_BARRED');
    const inTime = await t.post(`${m.c}/documents`, note(m, 'creditNote', inv.id, 1000, { date: '2026-11-30' }), { token: m.token });
    expect(inTime.status).toBe(201);
  });

  it('converts an invoice into a credit note and blocks cancelling the invoice under it', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const draft = await t.post(`${m.c}/documents/${inv.id}/convert`, { targetKind: 'creditNote' }, { token: m.token });
    expect(draft.status).toBe(201);
    expect(draft.body).toMatchObject({ kind: 'creditNote', status: 'draft', sourceDocumentId: inv.id });
    const fin = await t.post(`${m.c}/documents/${draft.body.id}/finalize`, {}, { token: m.token, headers: { 'if-match': `"v${draft.body.version}"` } });
    expect(fin.status).toBe(200);
    const blocked = await t.post(`${m.c}/documents/${inv.id}/status`, { status: 'cancelled' }, { token: m.token });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('DOCUMENT_HAS_RETURNS');
  });

  it('records a supplier’s credit and debit notes against their bill', async () => {
    const m = await moneySetup(t);
    const bill = await t.post(
      `${m.c}/documents`,
      { kind: 'purchaseBill', partyId: m.supplier!.id, date: '2026-09-29', currency: 'INR', supplierDocNumber: 'KS-9', lines: [line(m.gst(18))], status: 'issued' },
      { token: m.token },
    );
    expect(bill.status).toBe(201);
    const scn = await t.post(`${m.c}/documents`, note(m, 'supplierCreditNote', bill.body.id, 10000, { partyId: m.supplier!.id, supplierDocNumber: 'KS-CN-1' }), { token: m.token });
    expect(scn.status).toBe(201);
    expect(await documentRow(t, bill.body.id)).toMatchObject({ amountPaidMinor: 11800 });
    const sdn = await t.post(`${m.c}/documents`, note(m, 'supplierDebitNote', bill.body.id, 10000, { partyId: m.supplier!.id }), { token: m.token });
    expect(sdn.status).toBe(201);
    const payables = await t.get(`${m.c}/payables`, { token: m.token });
    expect(payables.body.documents.map((d: { document: { kind: string } }) => d.document.kind).sort()).toEqual(['purchaseBill', 'supplierDebitNote']);
  });

  it('reports notes in GSTR-1 as C and D against a registered buyer', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m, { partyId: m.bengaluru.id });
    await t.post(`${m.c}/documents`, note(m, 'creditNote', inv.id, 10000, { partyId: m.bengaluru.id }), { token: m.token });
    await t.post(`${m.c}/documents`, note(m, 'debitNote', inv.id, 5000, { partyId: m.bengaluru.id }), { token: m.token });
    const json = await t.get(`${m.c}/gst/gstr1/export`, { token: m.token, query: { period: '092026', format: 'gstn-json' } });
    expect(json.status).toBe(200);
    const notes = json.body.cdnr[0].nt.map((n: { ntty: string; val: number }) => [n.ntty, n.val]);
    expect(notes).toEqual(expect.arrayContaining([['C', 118], ['D', 59]]));
    expect(json.body.doc_issue.doc_det.map((d: { doc_num: number }) => d.doc_num)).toEqual([1, 4, 5]);
  });
});

describe('settling an invoice without cash', () => {
  it('settles with cash plus TDS the customer deducted, and a discount', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m); // 2,360
    const res = await t.post(
      `${m.c}/payments`,
      receipt(m, { amount: inr(230000), allocations: [{ documentId: inv.id, amount: inr(230000), tdsDeducted: inr(4000), discount: inr(2000) }] }),
      { token: m.token },
    );
    expect(res.status).toBe(201);
    expect(res.body.allocations[0]).toMatchObject({ amount: inr(230000), tdsDeducted: inr(4000), discount: inr(2000) });
    expect(res.body.unallocated.minor).toBe(0);
    expect(await documentRow(t, inv.id)).toMatchObject({ amountPaidMinor: 236000, status: 'paid' });
    // The statement counts what settled it, not only the cash.
    const statement = await t.get(`${m.c}/parties/${m.mumbai.id}/statement`, { token: m.token });
    expect(statement.body.closingBalance.minor).toBe(0);
  });

  it('writes off the rest with no money moving, for an owner but not a sales user', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const sales = await joinTeam(t, m.token, { role: 'sales', companyIds: [m.companyId] });
    const body = receipt(m, { allocations: [{ documentId: inv.id, amount: inr(0), writeOff: inr(236000) }] });
    const refused = await t.post(`${m.c}/payments`, body, { token: sales.token });
    expect(refused.status).toBe(422);
    const ok = await t.post(`${m.c}/payments`, body, { token: m.token });
    expect(ok.status).toBe(201);
    expect(await documentRow(t, inv.id)).toMatchObject({ status: 'paid' });
  });

  it('refuses settling more than is owed', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const res = await t.post(`${m.c}/payments`, receipt(m, { amount: inr(236000), allocations: [{ documentId: inv.id, amount: inr(236000), discount: inr(100) }] }), { token: m.token });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ALLOCATION_EXCEEDS_OUTSTANDING');
  });
});

