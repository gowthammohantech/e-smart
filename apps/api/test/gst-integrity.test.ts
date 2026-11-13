import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { line, moneySetup } from './money-fixtures';
import { setupApi } from './helpers';

/**
 * GST returns that stay true once filed (money audit, phase 2): a return filed on the portal can be
 * recorded here, and nothing is then issued into or cancelled out of the month it reported.
 */
const t = setupApi();

const GSTIN = '27AABCV1234F1ZO';
const SUPPLIER = '27AABCS2222K1ZQ';
const PERIOD = '092026';

async function setup() {
  const m = await moneySetup(t);
  const db = t.deps.db;
  await db.update(schema.companies).set({ taxIdentifier: GSTIN, taxRegistered: true }).where(eq(schema.companies.id, m.companyId));
  await db.update(schema.parties).set({ taxId: SUPPLIER }).where(eq(schema.parties.id, m.supplier!.id));
  t.setNow('2026-09-20T10:00:00Z');
  const sale = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.bengaluru.id, date: '2026-09-10', currency: 'INR', lines: [line(m.gst(18))], status: 'issued' }, { token: m.token });
  expect(sale.status).toBe(201);
  const bill = await t.post(
    `${m.c}/documents`,
    { kind: 'purchaseBill', partyId: m.supplier!.id, date: '2026-09-05', currency: 'INR', supplierDocNumber: 'KS/1', lines: [line(m.gst(18), { quantity: 1 })], status: 'issued' },
    { token: m.token },
  );
  expect(bill.status).toBe(201);
  await db.update(schema.documents).set({ itcClaimPeriod: PERIOD }).where(eq(schema.documents.id, bill.body.id));
  t.setNow('2026-10-15T10:00:00Z');
  const markFiled = (returnType: string, body: Record<string, unknown> = {}) => t.post(`${m.c}/gst/returns/${returnType}/mark-filed`, { gstin: GSTIN, period: PERIOD, filedOn: '2026-10-11', ...body }, { token: m.token });
  return { ...m, sale: sale.body, bill: bill.body, markFiled };
}

describe('returns filed on the portal', () => {
  it('records GSTR-1 then GSTR-3B as filed, closing the books through the month', async () => {
    const m = await setup();
    // 3B before 1 is refused, as when filing through the app.
    expect((await m.markFiled('gstr3b', { filedOn: '2026-10-14' })).body.code).toBe('GSTR1_FIRST');
    const r1 = await m.markFiled('gstr1', { arn: 'AA2710261234567' });
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ status: 'filed', arn: 'AA2710261234567', filedOn: '2026-10-11' });
    expect((await m.markFiled('gstr1')).body.code).toBe('RETURN_FILED');
    expect((await m.markFiled('gstr3b', { filedOn: '2026-10-14' })).status).toBe(200);
    const [company] = await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.companyId));
    expect(company.lockedThroughDate).toBe('2026-09-30');
  });

  it('refuses a date in the future', async () => {
    const m = await setup();
    expect((await m.markFiled('gstr1', { filedOn: '2026-12-01' })).status).toBe(422);
  });
});

describe('a month whose GSTR-1 is filed', () => {
  it('takes no invoice dated into it, and lets none in it be cancelled', async () => {
    const m = await setup();
    expect((await m.markFiled('gstr1')).status).toBe(200);
    const late = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.bengaluru.id, date: '2026-09-28', currency: 'INR', lines: [line(m.gst(18))], status: 'issued' }, { token: m.token });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('RETURN_FILED');
    // Dated in October, it goes through.
    expect((await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.bengaluru.id, date: '2026-10-15', currency: 'INR', lines: [line(m.gst(18))], status: 'issued' }, { token: m.token })).status).toBe(201);
    const cancel = await t.post(`${m.c}/documents/${m.sale.id}/status`, { status: 'cancelled', reason: 'Raised twice' }, { token: m.token, headers: { 'if-match': `"v${m.sale.version}"` } });
    expect(cancel.status).toBe(409);
    expect(cancel.body.code).toBe('RETURN_FILED');
  });

  it('lets no bill whose credit a filed GSTR-3B claimed be cancelled', async () => {
    const m = await setup();
    await m.markFiled('gstr1');
    await m.markFiled('gstr3b', { filedOn: '2026-10-14' });
    // The books are closed through September too; the claim is what is checked even once they reopen.
    await t.deps.db.update(schema.companies).set({ lockedThroughDate: null }).where(eq(schema.companies.id, m.companyId));
    const [bill] = await t.deps.db.select().from(schema.documents).where(eq(schema.documents.id, m.bill.id));
    const cancel = await t.post(`${m.c}/documents/${m.bill.id}/status`, { status: 'cancelled', reason: 'Wrong supplier' }, { token: m.token, headers: { 'if-match': `"v${bill.version}"` } });
    expect(cancel.status).toBe(409);
    expect(cancel.body.code).toBe('RETURN_FILED');
  });
});
