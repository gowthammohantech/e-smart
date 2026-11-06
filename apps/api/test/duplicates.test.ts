import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { schema } from '@esmart/db';
import { problemHandler } from '../src/http/errors';
import { setupApi } from './helpers';
import { issueInvoice, moneySetup } from './money-fixtures';

/**
 * The same thing asked for twice at once: a double tap, two tabs, a retry racing the original.
 * Each should happen once.
 */
const t = setupApi();

afterEach(() => vi.restoreAllMocks());

const inr = (minor: number) => ({ minor, currency: 'INR' });
const journal = { kind: 'journal', date: '2026-09-29', narration: 'Round-off', lines: [{ account: 'sys:roundOff', debit: inr(1_000), credit: inr(0) }, { account: 'sys:otherIncome', debit: inr(0), credit: inr(1_000) }] };

describe('sending at the same moment', () => {
  it('sends a document once when two sends race under different keys', async () => {
    const m = await moneySetup(t);
    const inv = await issueInvoice(t, m);
    const spy = vi.spyOn(t.deps.providers.whatsapp, 'send');
    const send = () => t.post(`${m.c}/documents/${inv.id}/send`, { channel: 'whatsapp', to: ['+919876543210'], attachPdf: false }, { token: m.token, headers: { 'idempotency-key': randomUUID() } });
    const [a, b] = await Promise.all([send(), send()]);
    expect(b.status).toBe(a.status);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(b.body.messageId).toBe(a.body.messageId);
  });

  it('sends a payment reminder once when two race, and again after the window', async () => {
    const m = await moneySetup(t);
    await issueInvoice(t, m);
    const spy = vi.spyOn(t.deps.providers.whatsapp, 'send');
    const remind = () => t.post(`${m.c}/receivables/reminders`, { partyId: m.mumbai.id, channel: 'whatsapp', includePaymentLink: false }, { token: m.token, headers: { 'idempotency-key': randomUUID() } });
    const [a, b] = await Promise.all([remind(), remind()]);
    expect([a.status, b.status]).toEqual([202, 202]);
    expect(spy).toHaveBeenCalledTimes(1);
    t.setNow(new Date(t.deps.now().getTime() + 3 * 60_000));
    await remind();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('importing twice', () => {
  it('refuses journals already in the books, naming the voucher', async () => {
    const m = await moneySetup(t);
    const first = await t.post(`${m.c}/vouchers/import`, { vouchers: [journal] }, { token: m.token });
    expect(first.body).toMatchObject({ created: 1, invalid: 0 });
    const again = await t.post(`${m.c}/vouchers/import`, { vouchers: [journal, { ...journal, narration: 'Round-off, second' }] }, { token: m.token });
    expect(again.body).toMatchObject({ created: 1, invalid: 1 });
    expect(again.body.results[0]).toMatchObject({ status: 'invalid' });
    expect(again.body.results[0].issues[0].message).toContain(first.body.results[0].number);
    const all = await t.deps.db.select().from(schema.vouchers).where(eq(schema.vouchers.companyId, m.companyId));
    expect(all).toHaveLength(2);
  });
});

describe('an idempotency key whose request died', () => {
  it('answers "still running" while the claim is fresh, and lets a retry take it over once stale', async () => {
    const m = await moneySetup(t);
    const key = randomUUID();
    const post = () => t.post(`${m.c}/vouchers`, journal, { token: m.token, headers: { 'idempotency-key': key } });
    // The first request claimed the key, then its process died before answering.
    const [{ requestHash }] = await (async () => {
      const probe = await post();
      expect(probe.status).toBe(201);
      return t.deps.db.select().from(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.key, key));
    })();
    await t.deps.db.delete(schema.vouchers).where(eq(schema.vouchers.companyId, m.companyId));
    await t.deps.db.update(schema.idempotencyKeys).set({ responseStatus: null, responseBody: null, createdAt: t.deps.now(), requestHash }).where(eq(schema.idempotencyKeys.key, key));

    const busy = await post();
    expect(busy.status).toBe(409);
    expect(busy.body.code).toBe('IDEMPOTENT_REQUEST_IN_PROGRESS');

    t.setNow(new Date(t.deps.now().getTime() + 6 * 60_000));
    const retried = await post();
    expect(retried.status).toBe(201);
    expect(retried.headers['idempotent-replayed']).toBeUndefined();
    const [row] = await t.deps.db.select().from(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.key, key));
    expect(row.responseStatus).toBe(201);
  });
});

describe('a one-time code asked for twice at once', () => {
  it('sends one code; the other request is told to wait', async () => {
    const phone = '+919400000077';
    const [a, b] = await Promise.all([t.post('/auth/otp/request', { phone }), t.post('/auth/otp/request', { phone })]);
    expect([a.status, b.status].sort()).toEqual([200, 429]);
    const rows = await t.deps.db.select().from(schema.otpRequests).where(and(eq(schema.otpRequests.phone, phone)));
    expect(rows).toHaveLength(1);
  });
});

describe('a duplicate the database refuses', () => {
  it('is a 409 conflict, not a server error', async () => {
    const app = Fastify();
    problemHandler(app);
    app.get('/dupe', async () => {
      throw Object.assign(new Error('insert failed'), { cause: Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }) });
    });
    const res = await app.inject({ method: 'GET', url: '/dupe' });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('ALREADY_EXISTS');
    await app.close();
  });
});
