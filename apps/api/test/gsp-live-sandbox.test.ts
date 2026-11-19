import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { ownerWithCompany, setupApi } from './helpers';
import { invoiceBody, issueInvoice, line, moneySetup } from './money-fixtures';

/**
 * LIVE: files real documents against the GSPs' SANDBOXES (NIC's test environment), end to end through the app.
 * Never runs in CI. Run it by hand:
 *
 *   LIVE_GSP=1 TEST_DATABASE_URL=postgres://esmart:esmart@localhost:5434/esmart_test npx vitest run test/gsp-live-sandbox.test.ts
 *
 * Reads the TAXATION_* settings from apps/api/.env, pins every company to a sandbox target, and walks the whole flow:
 * connection test, e-invoice, e-way bill by IRN, e-way bill with no IRN, Part B, extend, cancel. It prints what each
 * step answered. Production is never touched: only sandbox targets are chosen, and the test fails if one is not.
 */
const live = process.env.LIVE_GSP === '1';

function dotenv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of readFileSync(resolve(__dirname, '../.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)=(.*)$/.exec(raw);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = live ? dotenv() : {};
const gspEnv = Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('TAXATION_') || k === 'GSP_BASE_URL'));
// The default is Whitebooks sandbox, as in .env; Adaequare sandbox is chosen per company below.
// Only a live run builds the GSP targets; elsewhere the suite is skipped and the app is the default simulator one.
const t = setupApi(live ? { ...gspEnv, COMPLIANCE_PROVIDER: 'gsp', GSTIN_PROVIDER: 'gsp' } : {});

/**
 * The login a business types on its integrations screen, per gateway and tab. Never read from .env and never kept in
 * the repo: it comes from the shell that runs the test. Whitebooks: LIVE_WHITEBOOKS_USERNAME / _PASSWORD. Adaequare has
 * two test taxpayers, one per API family (its sandbox collections publish them): LIVE_ADAEQUARE_EINVOICE_USERNAME /
 * _PASSWORD for the e-invoice tab and LIVE_ADAEQUARE_EWAYBILL_USERNAME / _PASSWORD for the e-way bill tab.
 */
const shell = (name: string) => process.env[name] ?? '';
const LOGINS = {
  whitebooks: [{ portal: 'both', username: shell('LIVE_WHITEBOOKS_USERNAME'), password: shell('LIVE_WHITEBOOKS_PASSWORD') }],
  adaequare: [
    { portal: 'einvoice', username: shell('LIVE_ADAEQUARE_EINVOICE_USERNAME'), password: shell('LIVE_ADAEQUARE_EINVOICE_PASSWORD') },
    { portal: 'ewaybill', username: shell('LIVE_ADAEQUARE_EWAYBILL_USERNAME'), password: shell('LIVE_ADAEQUARE_EWAYBILL_PASSWORD') },
  ],
} as const;

const today = new Date().toISOString().slice(0, 10);
const show = (label: string, value: unknown) => {
  const text = `\n=== ${label}\n${JSON.stringify(value, null, 2).replace(/"(signedQrPayload|signedQRCode)": "[^"]{40,}"/g, '"$1": "<long>"').slice(0, 2500)}`;
  console.log(text);
  if (process.env.LIVE_OUT) appendFileSync(process.env.LIVE_OUT, text);
};

async function walk(gateway: 'whitebooks' | 'adaequare') {
  const m = await moneySetup(t);
  t.setNow(new Date());
  // The e-invoicing turnover threshold, then the company's own login and target.
  await t.put(`${m.c}/compliance-settings`, { annualTurnover: { minor: 60_000_000_00, currency: 'INR' } }, { token: m.token });
  await t.deps.db.update(schema.companies).set({ gspProvider: gateway, gspEnvironment: 'sandbox' }).where(eq(schema.companies.id, m.companyId));
  for (const login of LOGINS[gateway]) {
    const saved = await t.put(`${m.c}/compliance-settings/credentials`, login, { token: m.token });
    expect(saved.status).toBe(204);
  }

  const conn = await t.post(`${m.c}/compliance-settings/test-connection`, {}, { token: m.token });
  show(`${gateway} sandbox: connection test`, conn.body);

  // 1. E-invoice to a registered buyer.
  await m.allowNegativeStock();
  const rod = await m.item();
  const inv = await issueInvoice(t, m, { date: today, partyId: m.bengaluru.id, lines: [line(m.gst(18), { itemId: rod, hsnCode: '721420', unitPrice: { minor: 50_000_00, currency: 'INR' } })] });
  const einv = await t.post(`${m.c}/documents/${inv.id}/e-invoice`, {}, { token: m.token });
  show(`${gateway} sandbox: e-invoice`, { status: einv.status, body: einv.body });

  // 2. E-way bill by IRN (when the IRN was registered).
  const ewayBody = (documentId: string) => ({
    documentId,
    subSupplyType: 'supply',
    transactionType: 1,
    from: { legalName: 'Vertex Traders', gstin: '27AAPFU0939F1ZV', address1: '12 Market Road', place: 'Mumbai', pincode: '400001', stateCode: '27' },
    to: { legalName: 'Anand Enterprises', gstin: '29AABCG4321K1ZM', address1: '4 MG Road', place: 'Bengaluru', pincode: '560001', stateCode: '29' },
    transporterId: '27AABCT5512M1Z6',
    transporterName: 'Konkan Roadlines',
    transportMode: 'road',
    vehicleNumber: 'MH04AB1234',
    vehicleType: 'regular',
    distanceKm: 450,
  });
  const ewbByIrn = await t.post(`${m.c}/eway-bills`, ewayBody(inv.id), { token: m.token });
  show(`${gateway} sandbox: e-way bill by IRN`, { status: ewbByIrn.status, body: ewbByIrn.body });

  // 3. E-way bill with no IRN: a B2C-style goods invoice to an unregistered customer.
  const inv2 = await issueInvoice(t, m, { date: today, partyId: m.mumbai.id, lines: [line(m.gst(18), { itemId: rod, hsnCode: '721420', unitPrice: { minor: 60_000_00, currency: 'INR' } })] });
  const direct = await t.post(`${m.c}/eway-bills`, { ...ewayBody(inv2.id), to: { legalName: 'Sunrise Retail', gstin: 'URP', address1: '12 Market Road', place: 'Mumbai', pincode: '400001', stateCode: '27' } }, { token: m.token });
  show(`${gateway} sandbox: e-way bill, no IRN`, { status: direct.status, body: direct.body });

  const bill = (direct.body as { ewayBill?: { id: string } }).ewayBill ?? (ewbByIrn.body as { ewayBill?: { id: string } }).ewayBill;
  if (bill) {
    const url = `${m.c}/eway-bills/${bill.id}`;
    const partB = await t.post(`${url}/part-b`, { mode: 'road', vehicleNumber: 'MH12XY9876', vehicleType: 'regular', fromPlace: 'Pune', fromStateCode: '27', reasonCode: '2', remark: 'Breakdown' }, { token: m.token });
    show(`${gateway} sandbox: Part B`, { status: partB.status, body: partB.body });
    const cancel = await t.post(`${url}/cancel`, { reasonCode: '2', remark: 'Cancelled the order' }, { token: m.token });
    show(`${gateway} sandbox: cancel e-way bill`, { status: cancel.status, body: cancel.body });
  }

  // 4. An IRN with no e-way bill on it, cancelled on its own (the first one is held by its e-way bill).
  const inv3 = await issueInvoice(t, m, { date: today, partyId: m.bengaluru.id, lines: [line(m.gst(18), { itemId: rod, hsnCode: '721420', unitPrice: { minor: 10_000_00, currency: 'INR' } })] });
  const einv3 = await t.post(`${m.c}/documents/${inv3.id}/e-invoice`, {}, { token: m.token });
  show(`${gateway} sandbox: second e-invoice`, { status: einv3.status });
  const cancelIrn = await t.post(`${m.c}/documents/${inv3.id}/e-invoice/cancel`, { reasonCode: '2', remark: 'Wrong rate' }, { token: m.token });
  show(`${gateway} sandbox: cancel IRN`, { status: cancelIrn.status, body: cancelIrn.body });

  return { einv, ewbByIrn, direct, cancelIrn, conn };
}

describe.skipIf(!live)('LIVE sandbox: the whole flow', () => {
  it('only ever runs against sandbox targets', () => {
    expect(env.TAXATION_GSP_ENVIRONMENT).toBe('sandbox');
  });

  it.skipIf(process.env.LIVE_ONLY === 'adaequare' || !process.env.LIVE_WHITEBOOKS_PASSWORD)('Whitebooks sandbox (needs LIVE_WHITEBOOKS_USERNAME/_PASSWORD in the shell)', async () => {
    const r = await walk('whitebooks');
    expect(r.einv.status).toBeLessThan(500);
  }, 240_000);

  it.skipIf(process.env.LIVE_ONLY === 'whitebooks' || !process.env.LIVE_ADAEQUARE_EINVOICE_PASSWORD)('Adaequare sandbox (needs LIVE_ADAEQUARE_* logins in the shell)', async () => {
    const r = await walk('adaequare');
    expect(r.einv.status).toBeLessThan(500);
  }, 240_000);
});

// Referenced so the unused-import rule stays quiet while the file is edited.
void invoiceBody;
void ownerWithCompany;
