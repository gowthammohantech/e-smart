// node --test tools/static-server.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { contentSecurityPolicy, createStaticServer, originOf, pickEncoding, securityHeaders } from './static-server.mjs';

let server;
let base;
const bundle = 'console.log("hello");\n'.repeat(500);

before(async () => {
  const root = await mkdtemp(join(tmpdir(), 'static-'));
  await mkdir(join(root, '_expo'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><div id="root"></div>');
  await writeFile(join(root, '_expo', 'entry-abc.js'), bundle);
  const csp = contentSecurityPolicy({ connect: [originOf('https://api.example.in/v1')] });
  server = createStaticServer({ root, hashedPrefixes: ['/_expo/'], headers: securityHeaders({ csp }), log: () => {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

describe('static server', () => {
  it('serves the app shell for any route, with the security headers', async () => {
    const res = await fetch(`${base}/sales/invoices/123`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /id="root"/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.match(res.headers.get('strict-transport-security'), /max-age=31536000/);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self';/);
    assert.match(csp, /connect-src 'self' https:\/\/api\.example\.in/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
  });

  it('answers 404 for a missing fingerprinted file instead of HTML', async () => {
    const res = await fetch(`${base}/_expo/entry-old.js`);
    assert.equal(res.status, 404);
  });

  it('compresses bundles for browsers that take it, and caches them for a year', async () => {
    const res = await fetch(`${base}/_expo/entry-abc.js`, { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    // fetch decodes it; the header says it came compressed.
    assert.equal(res.headers.get('content-encoding'), 'gzip');
    assert.equal(await res.text(), bundle);
  });

  it('refuses to leave the folder', async () => {
    const res = await fetch(`${base}/..%2F..%2Fetc%2Fpasswd`);
    assert.match(await res.text(), /id="root"/);
  });

  it('allows only GET and HEAD', async () => {
    assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
  });

  it('can report instead of enforce the policy', () => {
    const headers = securityHeaders({ csp: "default-src 'self'", cspReportOnly: true });
    assert.equal(headers['Content-Security-Policy'], undefined);
    assert.equal(headers['Content-Security-Policy-Report-Only'], "default-src 'self'");
  });
});

describe('helpers', () => {
  it('prefers brotli, then gzip', () => {
    assert.equal(pickEncoding('gzip, deflate, br'), 'br');
    assert.equal(pickEncoding('gzip'), 'gzip');
    assert.equal(pickEncoding(''), null);
  });

  it('reduces URLs to origins and drops junk', () => {
    assert.equal(originOf('https://api.example.in/v1'), 'https://api.example.in');
    assert.equal(originOf('https://*.blob.core.windows.net'), 'https://*.blob.core.windows.net');
    assert.equal(originOf('not a url'), null);
    assert.equal(originOf(undefined), null);
  });
});
