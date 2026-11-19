import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { outboundContext, purgeOutboundCalls, trackedFetch, trackOperation } from '../src/lib/outbound';
import { redactBody, redactHeaders, redactUrl } from '../src/lib/redact';
import { describeGspOperation } from '../src/providers/gsp/operations';
import { FetchGspTransport } from '../src/providers/gsp/transport';
import { ownerWithCompany, setupApi, signUpOwner, type TestContext } from './helpers';
import { totpCode, totpStep } from '../src/lib/totp';

const t = setupApi();
const O = schema.outboundCalls;

const answer = (status: number, body: unknown) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'set-cookie': 'sid=abc' } });

/** Rows are written after the response is handed back; wait for them. */
async function rows(where?: (r: typeof O.$inferSelect) => boolean, want = 1) {
  for (let i = 0; i < 50; i++) {
    const all = (await t.deps.db.select().from(O)).filter(where ?? (() => true));
    if (all.length >= want) return all.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    await new Promise((r) => setTimeout(r, 40));
  }
  return [];
}

async function operator(t: TestContext, role: 'superadmin' | 'support') {
  const op = await signUpOwner(t, { name: `${role} operator` });
  await t.deps.db.update(schema.users).set({ platformRole: role }).where(eq(schema.users.id, op.user.id!));
  const { secret } = (await t.post('/admin/mfa/enrollment', {}, { token: op.token })).body;
  const confirmed = await t.post('/admin/mfa/enrollment/confirm', { code: totpCode(secret, totpStep(t.deps.now().getTime())) }, { token: op.token });
  if (confirmed.status !== 200) throw new Error(confirmed.raw);
  return op;
}

describe('redaction', () => {
  it('removes secrets from headers, the query string and bodies, and keeps the rest', () => {
    expect(redactHeaders({ Authorization: 'Bearer abc.def', gspappsecret: 's3cret', gspappid: 'APPID12345', gstin: '29AAGCB1286Q000', 'Content-Type': 'application/json', password: 'pw' })).toEqual({
      Authorization: 'Bearer [redacted]',
      gspappsecret: '[redacted]',
      gspappid: 'APPI…',
      gstin: '29AAGCB1286Q000',
      'Content-Type': 'application/json',
      password: '[redacted]',
    });
    const url = redactUrl('http://pay4sms.in/sendsms/?token=TOP&number=9999999999&message=Your+OTP+is+123456&sender=ABC', ['message']);
    expect(url.url).not.toMatch(/TOP|123456/);
    expect(url.host).toBe('pay4sms.in');
    expect(url.path).toBe('/sendsms/');
    expect(url.url).toContain('sender=ABC');

    const body = JSON.parse(redactBody(JSON.stringify({ username: 'u', password: 'p', nested: { auth_token: 'x', ok: 1 }, list: [{ client_secret: 'y' }], Gstin: '29AAGCB1286Q000' })));
    expect(body).toEqual({ username: 'u', password: '[redacted]', nested: { auth_token: '[redacted]', ok: 1 }, list: [{ client_secret: '[redacted]' }], Gstin: '29AAGCB1286Q000' });
    expect(redactBody('grant_type=x&client_secret=zzz&code=1')).toBe('grant_type=x&client_secret=[redacted]&code=1');
  });

  it('names a GSP operation in words', () => {
    expect(describeGspOperation('/enriched/ei/api/invoice')).toBe('Generate e-invoice (IRN)');
    expect(describeGspOperation('/einvoice/type/GENERATE/version/V1_03')).toBe('Generate e-invoice (IRN)');
    expect(describeGspOperation('/einvoice/type/CANCEL/version/V1_03')).toBe('Cancel e-invoice (IRN)');
    expect(describeGspOperation('/enriched/commonapi/search')).toBe('GSTIN lookup (taxpayer search)');
    expect(describeGspOperation('/enriched/ewb/ewayapi', { action: 'VEHEWB' })).toBe('E-way bill: VEHEWB');
  });
});

describe('trackedFetch', () => {
  it('records where a successful production call went, without its bodies or secrets', async () => {
    const id = randomUUID();
    const res = await outboundContext.run({ source: 'request', requestId: id, route: 'POST /v1/things' }, () =>
      trackedFetch({ service: 'razorpay', environment: 'production', operation: 'Create payment link', fetchImpl: answer(200, { id: 'plink_1' }) as typeof fetch }, 'https://api.razorpay.com/v1/payment_links?key=abc', {
        method: 'POST',
        headers: { authorization: 'Basic c2VjcmV0', 'content-type': 'application/json' },
        body: JSON.stringify({ amount: 100 }),
      }),
    );
    expect(await res.json()).toEqual({ id: 'plink_1' }); // the caller still reads its own body
    const [row] = await rows((r) => r.requestId === id);
    expect(row).toMatchObject({ service: 'razorpay', environment: 'production', operation: 'Create payment link', method: 'POST', host: 'api.razorpay.com', path: '/v1/payment_links', status: 200, outcome: 'ok', source: 'request', route: 'POST /v1/things' });
    expect(row.requestBody).toBeNull();
    expect(row.responseBody).toBeNull();
    expect(row.requestBytes).toBe(14);
    expect(JSON.stringify(row)).not.toContain('c2VjcmV0');
    expect(row.requestHeaders).toMatchObject({ authorization: 'Basic [redacted]' });
  });

  it('keeps the request and the answer in full when a call fails, secrets still out', async () => {
    const id = randomUUID();
    await outboundContext.run({ source: 'request', requestId: id }, () =>
      trackedFetch({ service: 'resend', operation: 'Send email', fetchImpl: answer(422, { message: 'bad from address', api_key: 'k' }) as typeof fetch }, 'https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: 'Bearer re_live' },
        body: JSON.stringify({ to: ['a@b.c'], password: 'nope' }),
      }),
    );
    const [row] = await rows((r) => r.requestId === id);
    expect(row.outcome).toBe('http_error');
    expect(row.status).toBe(422);
    expect(row.error).toContain('bad from address');
    expect(JSON.parse(row.requestBody!)).toEqual({ to: ['a@b.c'], password: '[redacted]' });
    expect(JSON.parse(row.responseBody!)).toEqual({ message: 'bad from address', api_key: '[redacted]' });
    expect(row.responseHeaders).toMatchObject({ 'set-cookie': '[redacted]' });
    expect(JSON.stringify(row)).not.toMatch(/re_live|nope/);
  });

  it('keeps bodies for sandbox calls even when they work', async () => {
    const id = randomUUID();
    await outboundContext.run({ source: 'job', jobKind: 'gstr2b.fetch', requestId: id }, () =>
      trackedFetch({ service: 'whitebooks', environment: 'sandbox', operation: 'GSTR-2B', fetchImpl: answer(200, { status_cd: '1' }) as typeof fetch }, 'https://api.whitebooks.in/x', { method: 'GET' }),
    );
    const [row] = await rows((r) => r.requestId === id);
    expect(row).toMatchObject({ outcome: 'ok', source: 'job', jobKind: 'gstr2b.fetch' });
    expect(row.responseBody).toBe('{"status_cd":"1"}');
  });

  it('records a call nothing answered, and rethrows what fetch threw', async () => {
    const id = randomUUID();
    const refused = async () => {
      throw Object.assign(new Error('connect ECONNREFUSED'), { name: 'TypeError' });
    };
    await expect(outboundContext.run({ source: 'request', requestId: id }, () => trackedFetch({ service: 'msg91', operation: 'Send SMS', fetchImpl: refused as typeof fetch }, 'https://control.msg91.com/x', {}))).rejects.toThrow('ECONNREFUSED');
    const timedOut = async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    };
    await expect(outboundContext.run({ source: 'request', requestId: id }, () => trackedFetch({ service: 'msg91', operation: 'Send SMS', fetchImpl: timedOut as typeof fetch }, 'https://control.msg91.com/x', {}))).rejects.toThrow('timeout');
    const found = await rows((r) => r.requestId === id, 2);
    expect(found.map((r) => r.outcome).sort()).toEqual(['network_error', 'timeout']);
    expect(found[0].status).toBeNull();
  });

  it('calls a 200 the gateway refused an envelope error, from a real GSP transport', async () => {
    const id = randomUUID();
    const gateway = new FetchGspTransport(answer(200, { success: false, message: '2150: Duplicate IRN' }) as typeof fetch, { gateway: 'adaequare', environment: 'sandbox' });
    await expect(outboundContext.run({ source: 'request', requestId: id, route: 'POST /v1/einvoice' }, () => gateway.post({ baseUrl: 'https://gsp.adaequare.com/test', path: '/enriched/ei/api/invoice', token: 't', body: { Irn: 'x' } }))).rejects.toThrow(/Duplicate IRN/);
    const [row] = await rows((r) => r.requestId === id);
    expect(row).toMatchObject({ service: 'adaequare', environment: 'sandbox', operation: 'Generate e-invoice (IRN)', status: 200, outcome: 'envelope_error' });
    expect(row.error).toContain('Duplicate IRN');
    expect(row.requestHeaders).toMatchObject({ Authorization: 'Bearer [redacted]' });
  });

  it('records an SDK call it cannot see inside', async () => {
    const id = randomUUID();
    await outboundContext.run({ source: 'system', requestId: id }, () => trackOperation({ service: 'ses', operation: 'Send email', host: 'email.ap-south-1.amazonaws.com', path: '/v2/email/outbound-emails' }, async () => 'sent'));
    await expect(outboundContext.run({ source: 'system', requestId: id }, () => trackOperation({ service: 'ses', operation: 'Send email', host: 'email.ap-south-1.amazonaws.com', path: '/v2/email/outbound-emails' }, async () => Promise.reject(Object.assign(new Error('Throttled'), { $metadata: { httpStatusCode: 429 } }))))).rejects.toThrow('Throttled');
    const found = await rows((r) => r.requestId === id, 2);
    expect(found.map((r) => [r.outcome, r.status])).toEqual([['ok', null], ['http_error', 429]]);
  });

  it('drops calls older than the retention', async () => {
    const id = randomUUID();
    await t.deps.db.insert(schema.outboundCalls).values({ id: `oc_old_${id.slice(0, 8)}`, createdAt: new Date('2020-01-01'), service: 'razorpay', operation: 'x', method: 'GET', host: 'h', path: '/', url: 'https://h/', outcome: 'ok', durationMs: 1, source: 'system', requestId: id });
    await purgeOutboundCalls(t.deps.db, new Date(), 30);
    expect(await t.deps.db.select().from(O).where(eq(O.requestId, id))).toHaveLength(0);
  });
});

describe('the third-party call log API', () => {
  it('is for platform operators only, and support may read', async () => {
    const { token } = await ownerWithCompany(t);
    for (const url of ['/admin/outbound-calls', '/admin/outbound-calls/summary', '/admin/outbound-calls/oc_x']) {
      const res = await t.get(url, { token });
      expect(res.status, url).toBe(403);
      expect(res.body.code).toBe('PLATFORM_FORBIDDEN');
    }
    const support = await operator(t, 'support');
    expect((await t.get('/admin/outbound-calls', { token: support.token })).status).toBe(200);
  });

  it('lists, filters, summarises and shows one call with the others of its request', async () => {
    const op = await operator(t, 'superadmin');
    const { user, company } = await ownerWithCompany(t);
    const request = randomUUID();
    const base = { host: 'gsp.test', method: 'POST', durationMs: 120, source: 'request', requestId: request, userRef: user.id!, accountRef: user.accountId!, companyRef: company.id, url: 'https://gsp.test/x' };
    await t.deps.db.insert(schema.outboundCalls).values([
      { ...base, id: `oc_a_${request.slice(0, 8)}`, createdAt: new Date(Date.now() - 2000), service: 'adaequare', environment: 'production', operation: 'Authenticate with the gateway', path: '/gsp/authenticate', status: 200, outcome: 'ok' },
      { ...base, id: `oc_b_${request.slice(0, 8)}`, createdAt: new Date(Date.now() - 1000), service: 'adaequare', environment: 'production', operation: 'Generate e-invoice (IRN)', path: '/enriched/ei/api/invoice', status: 200, outcome: 'envelope_error', error: '2150 Duplicate IRN', requestBody: '{"a":1}', responseBody: '{"success":false}', route: 'POST /v1/x', durationMs: 900 },
    ]);

    const failures = await t.get('/admin/outbound-calls', { token: op.token, query: { outcome: 'failed', requestId: request } });
    expect(failures.status).toBe(200);
    expect(failures.body.data).toHaveLength(1);
    expect(failures.body.data[0]).toMatchObject({ service: 'adaequare', environment: 'production', operation: 'Generate e-invoice (IRN)', outcome: 'envelope_error', userName: user.name, companyName: company.name });

    const search = await t.get('/admin/outbound-calls', { token: op.token, query: { q: 'duplicate irn', companyId: company.id } });
    expect(search.body.data.map((c: { operation: string }) => c.operation)).toEqual(['Generate e-invoice (IRN)']);

    const detail = await t.get(`/admin/outbound-calls/${failures.body.data[0].id}`, { token: op.token });
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ requestBody: '{"a":1}', responseBody: '{"success":false}', truncated: false });
    expect(detail.body.related.map((c: { operation: string }) => c.operation)).toEqual(['Authenticate with the gateway']);
    // The company follows the deployment default (Adaequare in production unless the test config says otherwise); either way the check is made.
    expect(detail.body.gsp).toMatchObject({ went: { gateway: 'adaequare', environment: 'production' } });
    expect(typeof detail.body.gsp.matches).toBe('boolean');

    // A company set to Whitebooks sandbox, with a call that went to Adaequare production: the mismatch is shown.
    await t.deps.db.update(schema.companies).set({ gspProvider: 'whitebooks', gspEnvironment: 'sandbox' }).where(eq(schema.companies.id, company.id));
    const mismatch = await t.get(`/admin/outbound-calls/${failures.body.data[0].id}`, { token: op.token });
    expect(mismatch.body.gsp).toMatchObject({ went: { gateway: 'adaequare', environment: 'production' }, configured: { gateway: 'whitebooks', environment: 'sandbox' }, matches: false });

    const summary = await t.get('/admin/outbound-calls/summary', { token: op.token });
    expect(summary.status).toBe(200);
    const mine = summary.body.targets.find((s: { service: string; environment?: string }) => s.service === 'adaequare' && s.environment === 'production');
    expect(mine).toMatchObject({ calls: 2, failures: 1 });
    expect(summary.body).toMatchObject({ hours: 24, recording: 'failures' });

    expect((await t.get('/admin/outbound-calls/oc_missing', { token: op.token })).status).toBe(404);
  });
});
