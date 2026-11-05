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
});
