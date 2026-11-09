import { afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import type { Deps } from '../src/context';
import { setupApi } from './helpers';

const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;

describe('/docs behind a username and password', () => {
  const t = setupApi({ DOCS_USERNAME: 'dev', DOCS_PASSWORD: 'correct-horse-battery' });

  it('asks for credentials, refuses wrong ones, and serves the page and contract with the right ones', async () => {
    const none = await t.app.inject({ method: 'GET', url: '/docs' });
    expect(none.statusCode).toBe(401);
    expect(none.headers['www-authenticate']).toContain('Basic');

    const wrong = await t.app.inject({ method: 'GET', url: '/docs/openapi.json', headers: { authorization: basic('dev', 'wrong-password-123') } });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.body).not.toContain('openapi');

    const auth = { authorization: basic('dev', 'correct-horse-battery') };
    const page = await t.app.inject({ method: 'GET', url: '/docs', headers: auth });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('SwaggerUIBundle');
    expect(page.headers['cache-control']).toBe('no-store');

    const spec = await t.app.inject({ method: 'GET', url: '/docs/openapi.json', headers: auth });
    expect(spec.statusCode).toBe(200);
    const body = spec.json();
    expect(body.openapi).toBe('3.1.0');
    expect(body.servers).toEqual([{ url: '/v1', description: 'This server' }]);
    expect(Object.keys(body.paths).length).toBeGreaterThan(200);
  });
});

describe('/docs in production', () => {
  const t = setupApi();
  const apps: FastifyInstance[] = [];
  afterAll(async () => Promise.all(apps.map((a) => a.close())));

  /** The test deps, with the docs settings a production deployment would have. */
  async function prodApp(docs: { DOCS_USERNAME?: string; DOCS_PASSWORD?: string }) {
    const deps: Deps = { ...t.deps, config: { ...t.deps.config, NODE_ENV: 'production', ...docs } };
    const app = await buildApp(deps, { logger: false });
    apps.push(app);
    return app;
  }

  it('is not there without credentials configured', async () => {
    const app = await prodApp({});
    expect((await app.inject({ method: 'GET', url: '/docs' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/docs/openapi.json' })).statusCode).toBe(404);
  });

  it('is there behind the password when they are', async () => {
    const app = await prodApp({ DOCS_USERNAME: 'ops', DOCS_PASSWORD: 'a-long-docs-password' });
    expect((await app.inject({ method: 'GET', url: '/docs' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/docs', headers: { authorization: basic('ops', 'a-long-docs-password') } })).statusCode).toBe(200);
  });
});
