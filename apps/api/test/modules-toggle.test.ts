import { describe, expect, it } from 'vitest';
import { moduleEnabled } from '@esmart/core/domain/plan';
import { moneySetup } from './money-fixtures';
import { setupApi } from './helpers';

const t = setupApi();

describe('switching modules off', () => {
  it('works out what a module needs', () => {
    expect(moduleEnabled('pro', [], 'payables')).toBe(true);
    expect(moduleEnabled('pro', ['purchases'], 'payables')).toBe(false);
    expect(moduleEnabled('pro', ['expenses'], 'ocr')).toBe(false);
    expect(moduleEnabled('basic', [], 'books')).toBe(false);
    // Retail item fields are on for every plan until switched off.
    expect(moduleEnabled('free', [], 'pos')).toBe(true);
    expect(moduleEnabled('pro', ['pos'], 'pos')).toBe(false);
  });

  it('switches the retail item fields off and still numbers an item left without a SKU', async () => {
    const m = await moneySetup(t);
    const company = await t.get(`${m.c}`, { token: m.token });
    const off = await t.put(`${m.c}`, { ...company.body, disabledModules: ['pos'] }, { token: m.token, headers: { 'if-match': `"v${company.body.version}"` } });
    expect(off.status).toBe(200);
    expect(off.body.disabledModules).toEqual(['pos']);
    const tax = (await t.get(`${m.c}/tax-categories`, { token: m.token })).body.data[0];
    const item = await t.post(
      `${m.c}/items`,
      { sku: '', name: 'Plain thing', type: 'goods', unit: 'NOS', salePrice: { minor: 1000, currency: 'INR' }, purchasePrice: { minor: 500, currency: 'INR' }, taxCategoryId: tax.id },
      { token: m.token },
    );
    expect(item.status).toBe(201);
    expect(item.body.sku).toMatch(/^SKU-\d{4}$/);
  });

  it('refuses a switched-off module until the owner switches it back on', async () => {
    const m = await moneySetup(t);
    const company = await t.get(`${m.c}`, { token: m.token });
    expect(company.body.disabledModules).toEqual([]);
    const save = (disabledModules: string[], version: number) => t.put(`${m.c}`, { ...company.body, disabledModules }, { token: m.token, headers: { 'if-match': `"v${version}"` } });

    const off = await save(['books'], company.body.version);
    expect(off.status).toBe(200);
    expect(off.body.disabledModules).toEqual(['books']);
    const refused = await t.get(`${m.c}/vouchers`, { token: m.token });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('MODULE_OFF');
    // Other work goes on.
    expect((await t.get(`${m.c}/documents`, { token: m.token })).status).toBe(200);

    const on = await save([], off.body.version);
    expect(on.body.disabledModules).toEqual([]);
    expect((await t.get(`${m.c}/vouchers`, { token: m.token })).status).toBe(200);
  });

  it("refuses a report whose module is switched off, as the module's own routes are", async () => {
    const m = await moneySetup(t);
    const company = await t.get(`${m.c}`, { token: m.token });
    const range = { from: '2026-04-01', to: '2026-09-30' };
    expect((await t.get(`${m.c}/reports/purchase-summary`, { token: m.token, query: range })).status).toBe(200);
    const off = await t.put(`${m.c}`, { ...company.body, disabledModules: ['purchases'] }, { token: m.token, headers: { 'if-match': `"v${company.body.version}"` } });
    expect(off.status).toBe(200);
    for (const url of [`${m.c}/reports/purchase-summary`, `${m.c}/report-data/purchase-summary`]) {
      const refused = await t.get(url, { token: m.token, query: range });
      expect(refused.status, url).toBe(403);
      expect(refused.body.code).toBe('MODULE_OFF');
    }
    // A sales report goes on.
    expect((await t.get(`${m.c}/reports/sales-summary`, { token: m.token, query: range })).status).toBe(200);
  });
});
