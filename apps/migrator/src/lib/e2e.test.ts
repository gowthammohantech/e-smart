/**
 * Runs the whole import, every kind of data, against a live server with a throwaway account:
 *   E2E_API=http://localhost:4000 DATABASE_URL=postgres://… npx vitest run e2e
 * Skipped unless E2E_API is set. DATABASE_URL (a local database only) lifts the new business off the
 * Free plan, so purchases, payments out, expenses and books can be tried too.
 */
import { describe, expect, it } from 'vitest';
import { api, setServerUrl } from './api';
import { loadBusiness } from './business';
import { ENTITIES, type Entity, type Env, type SendResult } from './entities';
import { normalizeGstin } from '@esmart/core/domain/gstin';
import { norm } from './kit';
import { partyKey } from './lookups';
import { defaultOptions } from './options';
import { sampleSheets } from './demo';
import { plansFromSheets } from './plans';
import { sendSheet } from './run';

const API = process.env.E2E_API;

// The app keeps what it has imported in the browser's storage; here, a map stands in for it.
const memory = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
  key: () => null,
  length: 0,
} as Storage;

describe.skipIf(!API)('against a live server', () => {
  it('imports every kind of data, then finds it all already there', async () => {
    setServerUrl(API!);
    const stamp = Date.now().toString(36);
    const email = `migrator.e2e+${stamp}@example.com`;
    const up = await api().POST('/auth/sign-up', { body: { name: 'Migrator E2E', email, password: 'Test-pass-12345' } });
    const tokens = up.data!;
    const { tokenStore } = await import('./api');
    tokenStore.set({ accessToken: tokens.accessToken!, refreshToken: tokens.refreshToken! });

    const company = await api().POST('/companies', {
      body: {
        name: `E2E ${stamp}`, businessType: 'retail', country: 'IN', baseCurrency: 'INR',
        address: { line1: '12 Market Road', city: 'Pune', state: 'Maharashtra', stateCode: '27', postalCode: '411001', country: 'IN' },
        fiscalYearStartMonth: 4,
        taxRegistration: { regime: 'GST', identifierLabel: 'GSTIN', registered: false, placeOfSupplyStateCode: '27' },
        seedDefaults: true,
      } as never,
    });
    const id = (company.data as { id: string }).id;

    if (process.env.DATABASE_URL && /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)) {
      const mod = 'pg';
      const pg = (await import(mod)) as { default: { Client: new (o: { connectionString: string }) => { connect(): Promise<void>; query(q: string, p: unknown[]): Promise<unknown>; end(): Promise<void> } } };
      const client = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      await client.query(`update companies set plan = 'business' where id = $1`, [id]);
      await client.end();
    }

    await api().POST('/companies/{companyId}/payment-accounts', {
      params: { path: { companyId: id } },
      body: { name: 'E2E Bank', type: 'bank', currency: 'INR', openingBalance: { minor: 0, currency: 'INR' } } as never,
    });
    const business = await loadBusiness(id);
    const accounts = business.ctx.accounts;
    expect(accounts.length, 'the business has a chart of accounts').toBeGreaterThan(2);
    // Ordinary accounts: not the GST or TDS control accounts, which a journal may not touch.
    const ordinary = accounts.filter((a) => !/gst|tds|tcs|duties|control/i.test(a.name));
    // Cash in, from the owner's capital: cash may not go below nothing, so it is the debit.
    const debit = ordinary.find((a) => /^cash/i.test(a.name)) ?? ordinary[0];
    const credit = ordinary.find((a) => /capital/i.test(a.name) && a !== debit) ?? ordinary.find((a) => a !== debit)!;

    const sharma = `E2E Sharma ${stamp}`;
    const kumar = `E2E Kumar ${stamp}`;
    const sku = `E2E-${stamp}`.toUpperCase();
    const sheets: Record<string, string[][]> = {
      contacts: [['Type', 'Name', 'Phone'], ['Customer', sharma, '9876543210'], ['Supplier', kumar, '9123456780']],
      items: [['Name', 'SKU', 'Type', 'Unit', 'Sale Price', 'Purchase Price', 'GST %', 'Opening Stock'], [`Bearing ${stamp}`, sku, 'Goods', 'NOS', '250', '180', '18', '40']],
      openings: [['Type', 'Party', 'Number', 'Date', 'Due Date', 'Amount'], ['Customer invoice', sharma, `OPN-${stamp}`, '15/02/2026', '15/03/2026', '5,000']],
      journals: [['Date', 'Journal No', 'Account', 'Debit', 'Credit'], ['31/03/2026', `JV-${stamp}`, debit.name, '700', ''], ['31/03/2026', `JV-${stamp}`, credit.name, '', '700']],
      sales: [['Invoice No', 'Date', 'Customer', 'Item', 'Qty', 'Rate', 'GST %'], [`INV-${stamp}`, '31/03/2026', sharma, sku, '2', '250', '18'], ['', '', '', 'Packing', '1', '50', '18']],
      purchases: [['Bill No', 'Date', 'Supplier', 'Item', 'Qty', 'Rate', 'GST %'], [`B-${stamp}`, '31/03/2026', kumar, sku, '10', '180', '18']],
      payments: [['Date', 'Type', 'Party', 'Amount', 'Method', 'Reference'], ['01/04/2026', 'Received', sharma, '1,000', 'Bank', `UTR-${stamp}`], ['01/04/2026', 'Paid', kumar, '500', 'Cash', `CASH-${stamp}`]],
      expenses: [['Date', 'Category', 'Amount', 'GST %', 'Reference'], ['02/04/2026', `E2E Rent ${stamp}`, '118', '18', `R-${stamp}`]],
    };

    const parsed = ENTITIES.map((entity) => {
      const rows = sheets[entity.id];
      const p = entity.parse(rows, entity.guess(rows[0]), business.ctx, { stockDate: '2026-01-01' });
      expect(p.errors, `${entity.id} reads cleanly`).toEqual([]);
      return { entity, parsed: p };
    });
    // What this same file adds first, so the check does not fault a sheet for referring to it.
    const pending = {
      parties: new Set([partyKey(sharma), partyKey(kumar), normalizeGstin('')].filter(Boolean)),
      items: new Set([norm(`Bearing ${stamp}`), norm(sku)]),
    };
    const envFor = (entity: Entity): Env => ({ companyId: id, ctx: business.ctx, pending, rejected: { parties: new Map() }, options: defaultOptions(entity, business.ctx) });
    const send = (entity: Entity, values: unknown[], dryRun: boolean) => entity.send(values, dryRun, envFor(entity));
    const describeAll = (r: SendResult) => r.results.filter((x) => x.status !== 'created').map((x) => `${x.index}: ${x.status} ${x.message ?? ''}`).join(' | ');

    // 1. The check, before anything exists: every sheet passes, though contacts and items are not there yet.
    for (const { entity, parsed: p } of parsed) {
      const r = await send(entity, p.records.map((x) => x.value), true);
      expect(r.invalid, `${entity.id} check: ${describeAll(r)}`).toBe(0);
      expect(r.created, `${entity.id} check creates`).toBe(p.records.length);
    }

    // 2. The import, in order.
    const outcome: Record<string, SendResult> = {};
    for (const { entity, parsed: p } of parsed) {
      outcome[entity.id] = await send(entity, p.records.map((x) => x.value), false);
      expect(outcome[entity.id].invalid, `${entity.id} import: ${describeAll(outcome[entity.id])}`).toBe(0);
      expect(outcome[entity.id].created, `${entity.id} import creates`).toBe(p.records.length);
    }

    // 3. The same file again: nothing is created twice.
    for (const { entity, parsed: p } of parsed) {
      const r = await send(entity, p.records.map((x) => x.value), false);
      expect(r.created, `${entity.id} again creates nothing: ${describeAll(r)}`).toBe(0);
    }

    // The sales invoice came in as a draft with both lines, under the new business.
    const docs = await api().GET('/companies/{companyId}/documents', { params: { path: { companyId: id }, query: { kind: ['invoice'] } as never } });
    const rows = (docs.data as { data?: { status: string; partyName: string }[] }).data ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'draft', partyName: sharma });
  }, 180_000);

  it('the demo sample imports whole, again as a fresh set, and the one with mistakes imports all but its mistakes', async () => {
    setServerUrl(API!);
    const stamp = Date.now().toString(36);
    const up = await api().POST('/auth/sign-up', { body: { name: 'Migrator Demo', email: `migrator.demo+${stamp}@example.com`, password: 'Test-pass-12345' } });
    const { tokenStore } = await import('./api');
    tokenStore.set({ accessToken: up.data!.accessToken!, refreshToken: up.data!.refreshToken! });
    const company = await api().POST('/companies', {
      body: {
        name: `Demo ${stamp}`, businessType: 'retail', country: 'IN', baseCurrency: 'INR',
        address: { line1: '12 Market Road', city: 'Pune', state: 'Maharashtra', stateCode: '27', postalCode: '411001', country: 'IN' },
        fiscalYearStartMonth: 4,
        taxRegistration: { regime: 'GST', identifierLabel: 'GSTIN', registered: false, placeOfSupplyStateCode: '27' },
        seedDefaults: true,
      } as never,
    });
    const id = (company.data as { id: string }).id;
    if (process.env.DATABASE_URL && /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)) {
      const mod = 'pg';
      const pg = (await import(mod)) as { default: { Client: new (o: { connectionString: string }) => { connect(): Promise<void>; query(q: string, p: unknown[]): Promise<unknown>; end(): Promise<void> } } };
      const client = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      await client.query(`update companies set plan = 'business' where id = $1`, [id]);
      await client.end();
    }
    await api().POST('/companies/{companyId}/payment-accounts', {
      params: { path: { companyId: id } },
      body: { name: 'Demo Bank', type: 'bank', currency: 'INR', openingBalance: { minor: 0, currency: 'INR' } } as never,
    });
    const business = await loadBusiness(id);

    // Sheets are read in dependency order, as the Review screen does, with the check's view of what is pending.
    const run = async (mistakes: boolean) => {
      const sheets = sampleSheets(business.ctx, { mistakes });
      const plans = plansFromSheets('Sample', sheets, business.ctx, true)
        .map((p) => ({ p, entity: ENTITIES.find((e) => e.id === p.entity)! }))
        .sort((a, b) => ENTITIES.indexOf(a.entity) - ENTITIES.indexOf(b.entity))
        .map(({ p, entity }) => ({ entity, p, parsed: entity.parse(p.sheet.rows, p.mapping, business.ctx, p.options) }));
      const pending = { parties: new Set<string>(), items: new Set<string>() };
      for (const x of plans) for (const r of x.parsed.records) {
        if (x.entity.id === 'contacts') pending.parties.add(partyKey((r.value as { name: string }).name));
        if (x.entity.id === 'items') {
          const i = r.value as { name: string; sku: string };
          pending.items.add(norm(i.name));
          pending.items.add(norm(i.sku));
        }
      }
      const out: Record<string, SendResult> = {};
      for (const x of plans) {
        const env: Env = { companyId: id, ctx: business.ctx, pending, rejected: { parties: new Map() }, options: x.p.options };
        const values = x.parsed.records.map((r) => r.value);
        const checked = await sendSheet(x.entity, values, true, env);
        expect(checked.created, `${x.entity.id} check: ${checked.results.filter((r) => r.status !== 'created').map((r) => r.message).join(' | ')}`).toBe(values.length - checked.invalid - checked.skipped);
        out[x.entity.id] = await sendSheet(x.entity, values, false, env);
      }
      return { out, plans };
    };

    const first = await run(false);
    for (const [kind, r] of Object.entries(first.out)) expect(r.invalid + r.skipped, `${kind}: ${r.results.map((x) => x.message).join(' | ')}`).toBe(0);
    // A second load is a fresh set: it imports whole again, and does not collide with the first.
    const second = await run(false);
    for (const [kind, r] of Object.entries(second.out)) expect(r.invalid + r.skipped, `again ${kind}: ${r.results.map((x) => x.message).join(' | ')}`).toBe(0);

    // With mistakes: every good record still goes in; only the wrong rows are held back.
    const third = await run(true);
    const held = Object.fromEntries(third.plans.map((x) => [x.entity.id, x.parsed.errors.length + third.out[x.entity.id].invalid]));
    expect(held.contacts).toBe(2);
    expect(held.items).toBe(1);
    expect(held.sales).toBeGreaterThanOrEqual(3);
    for (const [kind, r] of Object.entries(third.out)) expect(r.created, `${kind} still imports its good rows`).toBeGreaterThan(0);

    const parties = ((await api().GET('/companies/{companyId}/parties', { params: { path: { companyId: id }, query: { limit: 100 } } })).data as { data: unknown[] }).data;
    // Each load adds as many contacts as it has good ones (the number varies from load to load).
    expect(parties.length).toBe(first.out.contacts.created + second.out.contacts.created + third.out.contacts.created);
  }, 240_000);
});
