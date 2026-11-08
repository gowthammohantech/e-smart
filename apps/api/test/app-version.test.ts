import { describe, expect, it } from 'vitest';
import { compareVersions } from '../src/http/appVersion';
import { INTERNAL_HEADER, INTERNAL_TOKEN } from '../src/lib/internal';
import { setupApi } from './helpers';

const t = setupApi({ MIN_APP_VERSION: '1.0.5' });

describe('minimum app version', () => {
  it('compares dotted versions by number', () => {
    expect(compareVersions('1.0.4', '1.0.5')).toBeLessThan(0);
    expect(compareVersions('1.0.10', '1.0.5')).toBeGreaterThan(0);
    expect(compareVersions('1.1', '1.0.5')).toBeGreaterThan(0);
    expect(compareVersions('1.0.5', '1.0.5')).toBe(0);
  });

  it('refuses an older native build with 426 APP_UPDATE_REQUIRED', async () => {
    const res = await t.get('/plans', { headers: { 'x-app-version': '1.0.4' } });
    expect(res.status).toBe(426);
    expect(res.body.code).toBe('APP_UPDATE_REQUIRED');
    expect(res.body.minVersion).toBe('1.0.5');
  });

  it('serves the current build, a newer one, the web app and requests with no session', async () => {
    const cases: Record<string, string>[] = [{ 'x-app-version': '1.0.5' }, { 'x-app-version': '2.0.0' }, { 'x-app-version': 'web' }, {}];
    for (const headers of cases) {
      expect((await t.get('/plans', { headers })).status).toBe(200);
    }
  });

  it('takes a signed-in request with no version for an offline-first build, which never sent one', async () => {
    const res = await t.get('/me', { headers: { authorization: 'Bearer anything' } });
    expect(res.status).toBe(426);
    expect(res.body.code).toBe('APP_UPDATE_REQUIRED');
  });

  it('still lets an old build reach /sync/push, so it can send what it kept', async () => {
    const res = await t.post('/sync/push', { mutations: [] }, { headers: { 'x-app-version': '1.0.4' } });
    expect(res.status).not.toBe(426);
  });

  it('lets the server call itself (Lixi tools, MCP, sync replays) without a version', async () => {
    const res = await t.get('/plans', { headers: { authorization: 'Bearer anything', [INTERNAL_HEADER]: INTERNAL_TOKEN } });
    expect(res.status).not.toBe(426);
  });

  it('does not let a forged internal header past the gate', async () => {
    const res = await t.get('/me', { headers: { authorization: 'Bearer anything', [INTERNAL_HEADER]: 'forged' } });
    expect(res.status).toBe(426);
  });
});
