/**
 * Many ways of bringing data in, run against a live server on throwaway businesses with the same
 * check-then-import code the app runs (run.ts):
 *   E2E_API=http://localhost:4000 DATABASE_URL=postgres://… npx vitest run matrix
 * Skipped unless E2E_API is set. DATABASE_URL (a local database only) lifts one business to the top plan;
 * the other stays on Free.
 */
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { api, setServerUrl, tokenStore } from './api';
import { loadBusiness } from './business';
import { ENTITIES, type SendResult } from './entities';
import { plansFromSheets } from './plans';
import { activeOf, parsePlans, runPlans } from './run';
import { readFile, readWorkbook, type Sheet } from './sheets';
import type { Business, SheetPlan } from '../types';

const API = process.env.E2E_API;

const memory = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
  key: () => null,
  length: 0,
} as Storage;

async function makeBusiness(label: string, plan: 'free' | 'business'): Promise<Business> {
  setServerUrl(API!);
  const stamp = `${label}${Date.now().toString(36)}`;
  const up = await api().POST('/auth/sign-up', { body: { name: `Matrix ${label}`, email: `migrator.matrix+${stamp}@example.com`, password: 'Test-pass-12345' } });
  tokenStore.set({ accessToken: up.data!.accessToken!, refreshToken: up.data!.refreshToken! });
  const company = await api().POST('/companies', {
    body: {
      name: `Matrix ${stamp}`, businessType: 'retail', country: 'IN', baseCurrency: 'INR',
      address: { line1: '12 Market Road', city: 'Pune', state: 'Maharashtra', stateCode: '27', postalCode: '411001', country: 'IN' },
      fiscalYearStartMonth: 4,
      taxRegistration: { regime: 'GST', identifierLabel: 'GSTIN', registered: false, placeOfSupplyStateCode: '27' },
      seedDefaults: true,
    } as never,
  });
  const id = (company.data as { id: string }).id;
  if (plan !== 'free' && process.env.DATABASE_URL && /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)) {
    const mod = 'pg';
    const pg = (await import(mod)) as { default: { Client: new (o: { connectionString: string }) => { connect(): Promise<void>; query(q: string, p: unknown[]): Promise<unknown>; end(): Promise<void> } } };
    const db = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query(`update companies set plan = $2 where id = $1`, [id, plan]);
    await db.end();
  }
  await api().POST('/companies/{companyId}/payment-accounts', {
    params: { path: { companyId: id } },
    body: { name: 'Matrix Bank', type: 'bank', currency: 'INR', openingBalance: { minor: 0, currency: 'INR' } } as never,
  });
  return loadBusiness(id);
}

/** Reads sheets as the app does, checks them, imports them, and holds the check to what the import then did. */
async function importAll(business: Business, plans: SheetPlan[], { expectCheckMatches = true } = {}) {
  const parsed = parsePlans(plans, business);
  const active = activeOf(plans, parsed);
  const checked = await runPlans({ business, active, dryRun: true });
  const imported = await runPlans({ business, active, dryRun: false });
  const by = (r: Awaited<ReturnType<typeof runPlans>>) => Object.fromEntries(r.results.map((x) => [x.plan.entity, x.sent]));
  const check = by(checked);
  const done = by(imported);
  if (expectCheckMatches) {
    for (const [kind, sent] of Object.entries(done)) {
      expect(sent.created, `${kind}: the check said ${check[kind].created} would be created. IMPORT: ${why(sent)}`).toBe(check[kind].created);
    }
  }
  return { check, done, active, parsed };
}

const why = (r: SendResult | undefined) => (r?.results ?? []).filter((x) => x.status !== 'created').map((x) => `#${x.index} ${x.status}: ${x.message ?? ''}`).join(' | ');
const count = async (business: Business, path: string, q: string) => {
  const res = await api().GET(path as never, { params: { path: { companyId: business.id }, query: { q, limit: 200 } } } as never);
  return ((res as { data?: { data?: unknown[] } }).data?.data ?? []).length;
};
const sheet = (name: string, rows: (string | number)[][]): Sheet => ({ name, rows: rows.map((r) => r.map(String)) });
const inFile = (name: string, sheets: Sheet[], business: Business) => plansFromSheets(name, sheets, business.ctx);

describe.skipIf(!API)('many ways of bringing data in', () => {
  it('paid business: customers, items and invoices together, in any order, then again, then bigger', async () => {
    const b = await makeBusiness('P', 'business');
    const T = Date.now().toString(36).toUpperCase().slice(-4);
    const c1 = `Alpha ${T} Traders`;
    const c2 = `Beta ${T} Stores`;
    const c3 = `Gamma ${T} Mart`;
    const s1 = `Delta ${T} Supplies`;
    const sku = (n: string) => `${n}-${T}`;
    const contacts = sheet('Contacts', [
      ['Type', 'Name', 'GSTIN', 'Phone', 'City', 'State'],
      ['Customer', c1, '', '9000000001', 'Pune', 'Maharashtra'],
      ['Customer', c2, '', '9000000002', 'Chennai', 'Tamil Nadu'],
      ['Customer', c3, '', '9000000003', 'Delhi', 'Delhi'],
      ['Supplier', s1, '', '9000000004', 'Surat', 'Gujarat'],
    ]);
    const items = sheet('Items', [
      ['Name', 'SKU', 'Type', 'Unit', 'Sale Price', 'Purchase Price', 'GST %', 'Opening Stock'],
      [`Widget ${T}`, sku('WID'), 'Goods', 'NOS', 100, 60, 18, 500],
      [`Gadget ${T}`, sku('GAD'), 'Goods', 'NOS', 250, 150, 12, 100],
      [`Service ${T}`, sku('SVC'), 'Service', 'NOS', 1000, 0, 18, ''],
    ]);
    // The invoices sheet comes FIRST in the workbook, before the contacts and items it refers to.
    const sales = sheet('Sales Invoices', [
      ['Invoice No', 'Date', 'Customer', 'Item', 'Qty', 'Rate', 'GST %', 'Discount %'],
      [`A-${T}-1`, '15/06/2026', c1, sku('WID'), 10, 100, 18, ''],      // by SKU
      ['', '', '', `Gadget ${T}`, 2, 250, 12, 10],                         // by name, heading carried down
      [`A-${T}-2`, '16/06/2026', c2.toUpperCase(), sku('SVC'), 1, 1000, 18, ''], // customer in another case
      [`A-${T}-3`, '17/06/2026', c3, `Custom job ${T}`, 1, 500, 18, ''],     // an item we do not keep, with its GST
    ]);
    const purchases = sheet('Purchase Invoices', [
      ['Bill No', 'Date', 'Supplier', 'Item', 'Qty', 'Rate', 'GST %'],
      [`B-${T}-1`, '10/06/2026', s1, sku('WID'), 100, 60, 18],
    ]);
    const payments = sheet('Payments', [
      ['Date', 'Type', 'Party', 'Amount', 'Reference'],
      ['20/06/2026', 'Received', c1, 500, `PAY-${T}-1`],
    ]);
    const openings = sheet('Opening Balances', [['Type', 'Party', 'Number', 'Date', 'Due Date', 'Amount'], ['Customer invoice', c2, `OPN-${T}`, '10/05/2026', '10/06/2026', 7500]]);
    const first = await importAll(b, inFile('everything.xlsx', [sales, purchases, payments, openings, items, contacts], b));
    for (const [kind, r] of Object.entries(first.done)) expect(r.invalid + r.skipped, `${kind}: ${why(r)}`).toBe(0);
    expect(first.done.contacts.created).toBe(4);
    expect(first.done.items.created).toBe(3);
    expect(first.done.sales.created).toBe(3); // A-1 (two lines), A-2, A-3
    expect(await count(b, '/companies/{companyId}/parties', T)).toBe(4);
    expect(await count(b, '/companies/{companyId}/items', T)).toBe(3);
    expect(await count(b, '/companies/{companyId}/documents', T)).toBeGreaterThanOrEqual(5);

    // The same file again: nothing new, nothing doubled.
    const again = await importAll(b, inFile('everything.xlsx', [sales, purchases, payments, openings, items, contacts], b), { expectCheckMatches: false });
    for (const [kind, r] of Object.entries(again.done)) expect(r.created, `again ${kind}: ${why(r)}`).toBe(0);
    expect(await count(b, '/companies/{companyId}/parties', T)).toBe(4);

    // Invoices only, for customers already in the business, a customer by GSTIN, a typo, and an unknown item with no GST.
    const gst = (await api().GET('/companies/{companyId}/parties', { params: { path: { companyId: b.id }, query: { q: c1 } } as never })).data as { data: { id: string }[] };
    expect(gst.data.length).toBe(1);
    const more = await importAll(
      b,
      inFile('more.xlsx', [
        sheet('Sales', [
          ['Invoice No', 'Date', 'Customer', 'Item', 'Qty', 'Rate', 'GST %'],
          [`A-${T}-10`, '01/07/2026', c1, sku('WID'), 1, 100, 18],
          [`A-${T}-11`, '01/07/2026', `${c1}  `, sku('GAD'), 1, 250, 12],
          [`A-${T}-12`, '01/07/2026', `${c1} typo`, sku('WID'), 1, 100, 18],
          [`A-${T}-13`, '01/07/2026', c1, `Mystery ${T}`, 1, 100, ''],
        ]),
      ], b),
      { expectCheckMatches: true },
    );
    expect(more.done.sales.created).toBe(2);
    expect(why(more.done.sales)).toMatch(/No contact called/);
    expect(why(more.done.sales)).toMatch(/GST %/);

    // CSV files, one per kind, picked together.
    const csv = (name: string, text: string) => new File([text], name, { type: 'text/csv' });
    const fromCsv = (
      await Promise.all([
        readFile(csv(`customers-${T}.csv`, `Name,Type,Phone\n"Epsilon ${T}, Ltd",Customer,9111111111\nZeta ${T} Co,Customer,9222222222\n`)),
        readFile(csv(`stock-${T}.csv`, `Item Name,Item Code,Selling Price,GST Rate\nCSV Part ${T},CSV-${T},75,18%\n`)),
      ])
    ).flatMap((sheets, i) => plansFromSheets(['customers.csv', 'stock.csv'][i], sheets, b.ctx));
    const csvRun = await importAll(b, fromCsv);
    expect(csvRun.done.contacts.created).toBe(2);
    expect(csvRun.done.items.created).toBe(1);

    // A real .xlsx file, written and read back like one a person saved.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Customers');
    ws.addRow(['Name', 'Type', 'Phone', 'Opening Balance', 'Dr/Cr']);
    ws.addRow([`Eta ${T} Agency`, 'Customer', 9333333333, 12500.5, 'Dr']);
    ws.addRow([`Theta ${T} Works`, 'Customer', 9444444444, '', '']);
    const fromXlsx = await readWorkbook(new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer));
    const xlsxRun = await importAll(b, inFile('customers.xlsx', fromXlsx, b));
    expect(xlsxRun.done.contacts.created).toBe(2);

    // Bigger: more rows than one request takes (500), several hundred documents.
    const N = 1100;
    const manyContacts = sheet('Contacts', [['Type', 'Name', 'Phone'], ...Array.from({ length: N }, (_, i) => ['Customer', `Bulk ${T} ${String(i).padStart(4, '0')}`, `9${String(i).padStart(9, '0')}`])]);
    const manyItems = sheet('Items', [['Name', 'SKU', 'Sale Price', 'GST %'], ...Array.from({ length: 600 }, (_, i) => [`Bulk Item ${T} ${i}`, `BI-${T}-${i}`, 10 + i, 18])]);
    const manySales = sheet('Sales Invoices', [
      ['Invoice No', 'Date', 'Customer', 'Item', 'Qty', 'Rate', 'GST %'],
      ...Array.from({ length: 120 }, (_, i) => [`BULK-${T}-${i}`, '05/07/2026', `Bulk ${T} ${String(i).padStart(4, '0')}`, `BI-${T}-${i}`, 1, 10 + i, 18]),
    ]);
    const big = await importAll(b, inFile('big.xlsx', [manySales, manyItems, manyContacts], b));
    expect(big.done.contacts.created).toBe(N);
    expect(big.done.items.created).toBe(600);
    expect(big.done.sales.created).toBe(120);
    const listed = ((await api().GET('/companies/{companyId}/parties', { params: { path: { companyId: b.id }, query: { q: `Bulk ${T}`, limit: 200 } } as never })).data as { data: unknown[] }).data;
    expect(listed.length).toBe(200); // a page of the 1100
  }, 290_000);

  it('paid business: issued invoices take a number, bills, expenses and a posted journal go in, and journals can be kept as drafts', async () => {
    const b = await makeBusiness('Q', 'business');
    const T = Date.now().toString(36).toUpperCase().slice(-4);
    const cust = `Issued ${T} Customer`;
    const sup = `Issued ${T} Supplier`;
    const plans = inFile('issue.xlsx', [
      sheet('Contacts', [['Type', 'Name'], ['Customer', cust], ['Supplier', sup]]),
      sheet('Items', [['Name', 'SKU', 'Sale Price', 'Purchase Price', 'GST %', 'Opening Stock'], [`Thing ${T}`, `TH-${T}`, 100, 60, 18, 50]]),
      sheet('Sales Invoices', [['Invoice No', 'Date', 'Customer', 'Item', 'Qty', 'Rate', 'GST %'], [`I-${T}`, '10/07/2026', cust, `TH-${T}`, 2, 100, 18]]),
      sheet('Purchase Invoices', [['Bill No', 'Date', 'Supplier', 'Item', 'Qty', 'Rate', 'GST %'], [`PB-${T}`, '09/07/2026', sup, `TH-${T}`, 10, 60, 18]]),
      sheet('Expenses', [['Date', 'Category', 'Amount', 'GST %', 'Reference'], ['11/07/2026', `Matrix Rent ${T}`, 118, 18, `EXP-${T}`]]),
      sheet('Journals', [['Date', 'Journal No', 'Account', 'Debit', 'Credit'], ['01/07/2026', `JV-${T}`, 'Cash', 5000, ''], ['01/07/2026', `JV-${T}`, 'Capital', '', 5000]]),
    ], b);
    for (const p of plans) {
      if (p.entity === 'sales' || p.entity === 'purchases') p.options = { ...p.options, save: 'issue' };
    }
    const r = await importAll(b, plans);
    for (const [kind, x] of Object.entries(r.done)) expect(x.invalid + x.skipped, `${kind}: ${why(x)}`).toBe(0);
    const docs = ((await api().GET('/companies/{companyId}/documents', { params: { path: { companyId: b.id }, query: { limit: 50 } } as never })).data as { data: { kind: string; status: string; number: string }[] }).data;
    const invoice = docs.find((d) => d.kind === 'invoice')!;
    expect(invoice.status).not.toBe('draft');
    expect(invoice.number).not.toMatch(/DRAFT/);
    expect(docs.find((d) => d.kind === 'purchaseBill')!.status).not.toBe('draft');

    // Journals kept as drafts: they go in, and post nothing.
    const draftJournal = inFile('draft-journal.xlsx', [sheet('Journals', [['Date', 'Journal No', 'Account', 'Debit', 'Credit'], ['02/07/2026', `DJ-${T}`, 'Cash', 100, ''], ['02/07/2026', `DJ-${T}`, 'Capital', '', 100]])], b);
    draftJournal[0].options = { ...draftJournal[0].options, save: 'draft' };
    const drafted = await importAll(b, draftJournal);
    expect(drafted.done.journals.created, why(drafted.done.journals)).toBe(1);
    const vouchers = ((await api().GET('/companies/{companyId}/vouchers', { params: { path: { companyId: b.id }, query: { limit: 50 } } as never })).data as { data: { status: string; reference?: string }[] }).data;
    expect(vouchers.find((v) => v.reference === `DJ-${T}`)?.status).toBe('draft');
  }, 200_000);

  it('free business: what the plan has imports, what it lacks is said up front and rejected row by row, nothing throws', async () => {
    const b = await makeBusiness('F', 'free');
    expect(b.plan).toBe('free');
    const T = Date.now().toString(36).toUpperCase().slice(-4);
    const cust = `Free ${T} Customer`;
    const sup = `Free ${T} Supplier`;
    const plans = inFile('free.xlsx', [
      sheet('Contacts', [['Type', 'Name'], ['Customer', cust], ['Supplier', sup]]),
      sheet('Items', [['Name', 'SKU', 'Sale Price', 'GST %'], [`Free Thing ${T}`, `FT-${T}`, 100, 18]]),
      sheet('Sales Invoices', [['Invoice No', 'Date', 'Customer', 'Item', 'Qty', 'Rate', 'GST %'], [`F-${T}`, '10/07/2026', cust, `FT-${T}`, 1, 100, 18]]),
      sheet('Purchase Invoices', [['Bill No', 'Date', 'Supplier', 'Item', 'Qty', 'Rate', 'GST %'], [`FB-${T}`, '09/07/2026', sup, `FT-${T}`, 1, 60, 18]]),
      sheet('Payments', [['Date', 'Type', 'Party', 'Amount'], ['12/07/2026', 'Received', cust, 100], ['12/07/2026', 'Paid', sup, 50]]),
      sheet('Expenses', [['Date', 'Category', 'Amount'], ['11/07/2026', `Free Rent ${T}`, 118]]),
      sheet('Journals', [['Date', 'Journal No', 'Account', 'Debit', 'Credit'], ['01/07/2026', `FJ-${T}`, 'Cash', 100, ''], ['01/07/2026', `FJ-${T}`, 'Capital', '', 100]]),
    ], b);
    const parsed = parsePlans(plans, b);
    const warnings = Object.fromEntries(
      activeOf(plans, parsed).map((a) => [a.entity.id, a.entity.planNeeds?.(a.parsed.records.map((r) => r.value), b.ctx)]),
    );
    expect(warnings.contacts, 'a supplier needs Purchases').toMatch(/Purchases feature/);
    expect(warnings.purchases).toMatch(/Purchases feature/);
    expect(warnings.expenses).toMatch(/Expenses feature/);
    expect(warnings.payments, 'the payment made to a supplier').toMatch(/Payables feature/);
    expect(warnings.sales, 'sales are in every plan').toBeUndefined();
    expect(warnings.items).toBeUndefined();

    const r = await importAll(b, plans, { expectCheckMatches: true });
    expect(r.done.contacts.created, why(r.done.contacts)).toBe(1); // the customer; the supplier is refused
    expect(why(r.done.contacts)).toMatch(/pro plan|Purchases/);
    expect(r.done.items.created).toBe(1);
    expect(r.done.sales.created, why(r.done.sales)).toBe(1);
    expect(r.done.purchases.created).toBe(0);
    expect(why(r.done.purchases), 'says why the supplier is missing').toMatch(/was not added from the Contacts sheet/);
    expect(r.done.payments.created, why(r.done.payments)).toBe(1); // the receipt; the payment to the supplier is refused
    expect(r.done.expenses.created).toBe(0);
    expect(why(r.done.expenses)).toMatch(/pro plan|Expenses/);
    const journals = r.active.find((a) => a.entity.id === 'journals')!;
    expect(journals.parsed.records, 'journals are not read at all without Books').toHaveLength(0);
    expect(journals.parsed.errors[0].message).toMatch(/Books feature/);
    expect(ENTITIES.length).toBe(8);
  }, 120_000);
});
