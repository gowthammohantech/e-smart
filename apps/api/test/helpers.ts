import { randomUUID } from 'node:crypto';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach } from 'vitest';
import { createDb, createPool, schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import type { Deps } from '../src/context';
import { loadOperations, type Operation } from '../src/openapi/spec';
import { createProviders, type Providers } from '../src/providers';

/** Tables that hold reference data: loaded by the migration, never truncated. */
const REFERENCE = new Set(['countries', 'currencies', 'states', 'cities', 'pincodes', 'units', 'hsn_codes', 'plans', 'plan_modules', 'integrations']);

const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
addFormats.default(ajv);
for (const f of ['int32', 'int64', 'float', 'double', 'binary', 'byte', 'password']) ajv.addFormat(f, true);
const validators = new WeakMap<object, ReturnType<typeof ajv.compile>>();

export type Res<T = any> = { status: number; body: T; headers: Record<string, string | string[] | undefined>; raw: string };
export type CallOptions = {
  token?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  /** Skip the contract check (e.g. to assert on a deliberately bad request). */
  unchecked?: boolean;
};

export type TestContext = {
  app: FastifyInstance;
  deps: Deps;
  providers: Providers;
  /** Pin the clock. */
  setNow: (d: Date | string) => void;
  call: <T = any>(method: string, url: string, opts?: CallOptions) => Promise<Res<T>>;
  get: <T = any>(url: string, opts?: CallOptions) => Promise<Res<T>>;
  post: <T = any>(url: string, body?: unknown, opts?: CallOptions) => Promise<Res<T>>;
  put: <T = any>(url: string, body?: unknown, opts?: CallOptions) => Promise<Res<T>>;
  patch: <T = any>(url: string, body?: unknown, opts?: CallOptions) => Promise<Res<T>>;
  del: <T = any>(url: string, opts?: CallOptions) => Promise<Res<T>>;
};

function matchOperation(operations: Operation[], method: string, path: string): Operation | undefined {
  return operations.find((op) => {
    if (op.method !== method) return false;
    const re = new RegExp(`^${op.path.replace(/\{[^}]+\}/g, '[^/]+')}$`);
    return re.test(path);
  });
}

/**
 * Checks a response against the contract: the status must be one the
 * operation declares (or a problem+json error), and the body must match its
 * schema. Every call in every test goes through this.
 */
function checkContract(op: Operation | undefined, problem: object, res: Res, method: string, url: string) {
  const where = `${method} ${url} → ${res.status}`;
  if (!op) throw new Error(`${where}: no contract operation matches this route`);
  const type = String(res.headers['content-type'] ?? '').split(';')[0];
  if (res.status >= 400) {
    if (!type.includes('problem+json')) throw new Error(`${where}: errors must be application/problem+json, got ${type}`);
    validate(problem, res.body, where);
    return;
  }
  const declared = op.responses[String(res.status)];
  if (!declared) throw new Error(`${where}: status not declared for ${op.id} (declares ${Object.keys(op.responses).join(', ')})`);
  const media = Object.keys(declared);
  if (!media.length) {
    if (res.raw.length) throw new Error(`${where}: declared without a body but returned one`);
    return;
  }
  if (!media.includes(type)) throw new Error(`${where}: content-type ${type} not declared (${media.join(', ')})`);
  const s = declared[type];
  if (s && type.includes('json')) validate(s, res.body, where);
}

function validate(schema: object, body: unknown, where: string) {
  let v = validators.get(schema);
  if (!v) {
    v = ajv.compile(schema);
    validators.set(schema, v);
  }
  if (!v(body)) {
    throw new Error(`${where}: response breaks the contract:\n${ajv.errorsText(v.errors, { separator: '\n' })}\n${JSON.stringify(body, null, 2).slice(0, 2000)}`);
  }
}

/**
 * A server on the test database, truncated before every test. Call once at
 * the top of a test file.
 */
export function setupApi(): TestContext {
  const url = process.env.TEST_DATABASE_URL!;
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: url, LOG_LEVEL: 'silent', DEMO_OTP: 'false', RATE_LIMIT_PER_MINUTE: '100000' });
  const pool = createPool(url, 5);
  const providers = createProviders(config, { info: () => {} });
  let now: Date | null = null;
  const deps: Deps = { db: createDb(pool), pool, config, providers, now: () => (now ? new Date(now) : new Date()) };
  let app: FastifyInstance | null = null;
  let operations: Operation[] = [];
  let problem: object = {};
  let tables: string[] = [];

  const ctx = {
    deps,
    providers,
    setNow: (d: Date | string) => {
      now = new Date(d);
    },
  } as TestContext;

  beforeEach(async () => {
    if (!app) {
      app = await buildApp(deps, { logger: false });
      await app.ready();
      const loaded = await loadOperations();
      operations = loaded.operations;
      problem = (loaded.spec as any).components.schemas.Problem;
      const { rows } = await pool.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
      tables = rows.map((r) => r.tablename).filter((t) => !REFERENCE.has(t));
      ctx.app = app;
    }
    now = null;
    providers.outbox.clear();
    await pool.query(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  ctx.call = async (method, url, opts = {}) => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    const qs = opts.query
      ? '?' + new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString()
      : '';
    const res = await app!.inject({ method: method as never, url: `/v1${url}${qs}`, headers, payload: opts.body as never });
    const type = String(res.headers['content-type'] ?? '');
    const out: Res = {
      status: res.statusCode,
      headers: res.headers as Res['headers'],
      raw: res.body,
      body: type.includes('json') && res.body ? JSON.parse(res.body) : res.rawPayload,
    };
    if (!opts.unchecked) checkContract(matchOperation(operations, method, url), problem, out, method, url);
    return out;
  };
  ctx.get = (url, opts) => ctx.call('GET', url, opts);
  ctx.post = (url, body, opts) => ctx.call('POST', url, { ...opts, body: body ?? {} });
  ctx.put = (url, body, opts) => ctx.call('PUT', url, { ...opts, body });
  ctx.patch = (url, body, opts) => ctx.call('PATCH', url, { ...opts, body });
  ctx.del = (url, opts) => ctx.call('DELETE', url, opts);
  return ctx;
}

// ----------------------------------------------------------------- fixtures

export const MUMBAI: Schema<'Address'> = { line1: '12 Market Road', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', postalCode: '400001', country: 'IN' };
export const BENGALURU: Schema<'Address'> = { line1: '4 MG Road', city: 'Bengaluru', state: 'Karnataka', stateCode: '29', postalCode: '560001', country: 'IN' };

let seq = 0;
export type Owner = { token: string; refreshToken: string; user: Schema<'User'>; email: string; password: string };

/** Signs up a new account owner. */
export async function signUpOwner(t: TestContext, over: Partial<{ name: string; email: string; phone: string; password: string }> = {}): Promise<Owner> {
  const email = over.email ?? `owner${++seq}-${randomUUID().slice(0, 6)}@example.com`;
  const password = over.password ?? 'correct horse battery';
  const res = await t.post('/auth/sign-up', { name: over.name ?? 'Priya Shah', email, password, ...(over.phone ? { phone: over.phone } : {}) });
  if (res.status !== 201) throw new Error(`sign-up failed: ${res.status} ${res.raw}`);
  return { token: res.body.accessToken, refreshToken: res.body.refreshToken, user: res.body.user, email, password };
}

/** A GST-registered Mumbai company. `plan` is set directly, as billing would. */
export async function createCompany(
  t: TestContext,
  token: string,
  over: Partial<Schema<'Company'>> & { plan?: Schema<'PlanTier'>; branches?: Schema<'Branch'>[] } = {},
): Promise<Schema<'Company'>> {
  const { plan, ...body } = over;
  const res = await t.post(
    '/companies',
    {
      name: 'Vertex Traders',
      businessType: 'wholesale',
      country: 'IN',
      baseCurrency: 'INR',
      address: MUMBAI,
      fiscalYearStartMonth: 4,
      taxRegistration: { regime: 'GST', identifier: '27AAPFU0939F1ZV', identifierLabel: 'GSTIN', registered: true, placeOfSupplyStateCode: '27' },
      ...body,
    },
    { token },
  );
  if (res.status !== 201) throw new Error(`createCompany failed: ${res.status} ${res.raw}`);
  if (plan && plan !== 'free') {
    await t.deps.db.update(schema.companies).set({ plan }).where(eq(schema.companies.id, res.body.id));
    return { ...res.body, plan };
  }
  return res.body;
}

/** An owner with one company, the starting point for most tests. */
export async function ownerWithCompany(t: TestContext, over: Parameters<typeof createCompany>[2] = {}) {
  const owner = await signUpOwner(t);
  const company = await createCompany(t, owner.token, over);
  return { ...owner, company, c: `/companies/${company.id}` };
}

/** A fresh Idempotency-Key header. */
export const idem = () => ({ 'idempotency-key': randomUUID() });
