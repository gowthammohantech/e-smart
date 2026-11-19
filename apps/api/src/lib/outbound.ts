import { AsyncLocalStorage } from 'node:async_hooks';
import { lt } from 'drizzle-orm';
import { schema, type Db } from '@esmart/db';
import { newId } from './ids';
import { redactBody, redactHeaders, redactUrl, truncate } from './redact';

/**
 * Every call this API makes to a third party goes through `trackedFetch`, which is `fetch` plus one row
 * in `outbound_calls` (the platform console's Third-Party Call Logs page). The row says who we called, which of
 * their endpoints, what set it off (an API route and its user, or a job), and what came back.
 *
 * Recording never gets in the way: it happens after the response is in hand, a failure to record is
 * logged and swallowed, and the caller gets the very `Response` `fetch` returned.
 *
 * Bodies are kept for failures, for sandbox targets (that is test traffic, and what you are debugging)
 * and when `OUTBOUND_LOG=all`. A successful production call keeps its metadata only: what was called,
 * the status and how long it took, which is how you see that a call really did go where it should.
 */

export type OutboundOutcome = 'ok' | 'http_error' | 'envelope_error' | 'timeout' | 'network_error';
export type OutboundMode = 'failures' | 'all' | 'off';

export type OutboundContext = {
  /** A request an API route is handling, a background job, or neither. */
  source: 'request' | 'job' | 'system';
  requestId?: string;
  /** `POST /v1/companies/{companyId}/documents/{documentId}/einvoice` */
  route?: string;
  jobKind?: string;
  userId?: string;
  accountId?: string;
  companyId?: string;
};

const store = new AsyncLocalStorage<OutboundContext>();

/** What is running, so a call made deep inside a provider can still say who it was for. */
export const outboundContext = {
  /** Runs `fn` (and everything it awaits) with `ctx` as the caller. */
  run: <T>(ctx: OutboundContext, fn: () => T): T => store.run(ctx, fn),
  current: (): OutboundContext | undefined => store.getStore(),
  /** Adds what became known after the context was opened (the signed-in user, the company). */
  patch(fields: Partial<OutboundContext>) {
    const ctx = store.getStore();
    if (ctx) Object.assign(ctx, fields);
  },
};

type Sink = {
  db: Db;
  mode: OutboundMode;
  log: { warn: (o: object, m?: string) => void; info?: (o: object, m?: string) => void; debug?: (o: object, m?: string) => void };
};

let sink: Sink | null = null;

/** Where rows go. Set once at start-up (`buildApp`); with nothing set, calls are made and not recorded. */
export function configureOutbound(next: Sink | null): () => void {
  sink = next;
  // Stops recording for this sink only: a newer app's sink (another in the same process) is left alone.
  return () => {
    if (sink === next) sink = null;
  };
}

export type TrackMeta = {
  /** Who is being called: `adaequare`, `whitebooks`, `razorpay`, `msg91`, `resend`, `whatsapp`, `expo`, `pay4sms`, `ai`, `fx`. */
  service: string;
  /** For a service that has both. Sandbox calls keep their bodies even when they succeed. */
  environment?: 'sandbox' | 'production' | null;
  /** In plain words: "Create payment link". */
  operation: string;
  /** Query parameters or body fields to scrub beyond the usual secrets (lower case). */
  redact?: readonly string[];
  /**
   * Reads an answer the status line calls fine and decides it was not (a gateway's `success: false`
   * inside a 200). Returns the message to show.
   */
  classify?: (response: { status: number; text: string }) => { error: string } | undefined;
  /** For tests, and for callers that already hold their own `fetch`. */
  fetchImpl?: typeof fetch;
};

const BODY_LIMIT = 16_384;
const ERROR_LIMIT = 600;

type Init = RequestInit;

/** `fetch`, recorded. Throws exactly what `fetch` throws. */
export async function trackedFetch(meta: TrackMeta, url: string, init: Init = {}): Promise<Response> {
  const run = meta.fetchImpl ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const method = (init.method ?? 'GET').toUpperCase();
  const caller = { ...outboundContext.current() };
  const startedAt = new Date();
  const t0 = performance.now();

  let response: Response;
  try {
    response = await run(url, init);
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    record(meta, { url, method, init, caller, startedAt, durationMs: performance.now() - t0, outcome: timedOut ? 'timeout' : 'network_error', error: describe(error) });
    throw error;
  }

  const durationMs = performance.now() - t0;
  if (!sink || sink.mode === 'off') return response;
  // Read a copy: the caller reads the original, in its own time.
  const copy = typeof response.clone === 'function' ? safeClone(response) : null;
  if (copy) {
    void copy.text().then(
      (text) => record(meta, { url, method, init, caller, startedAt, durationMs, response, text }),
      () => record(meta, { url, method, init, caller, startedAt, durationMs, response }),
    );
  } else {
    record(meta, { url, method, init, caller, startedAt, durationMs, response });
  }
  return response;
}

/**
 * A call made through an SDK that hides its HTTP (SES, Azure Communication Services): the same record, with the
 * endpoint named by hand and no bodies. Throws what `call` throws.
 */
export async function trackOperation<T>(meta: Omit<TrackMeta, 'classify' | 'fetchImpl'> & { host: string; path: string; method?: string }, call: () => Promise<T>): Promise<T> {
  const caller = { ...outboundContext.current() };
  const startedAt = new Date();
  const t0 = performance.now();
  const base = { url: `https://${meta.host}${meta.path}`, method: meta.method ?? 'POST', init: {}, caller, startedAt };
  try {
    const result = await call();
    record(meta, { ...base, durationMs: performance.now() - t0 });
    return result;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number }; statusCode?: number }).$metadata?.httpStatusCode ?? (error as { statusCode?: number }).statusCode;
    record(meta, { ...base, durationMs: performance.now() - t0, status, outcome: status ? 'http_error' : 'network_error', error: describe(error) });
    throw error;
  }
}

function safeClone(response: Response): Response | null {
  try {
    return response.clone();
  } catch {
    return null;
  }
}

const describe = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, ERROR_LIMIT);

type Finished = {
  url: string;
  method: string;
  init: Init;
  caller: Partial<OutboundContext>;
  startedAt: Date;
  durationMs: number;
  response?: Response;
  /** When there is no `Response` to read it from (an SDK call). */
  status?: number;
  text?: string;
  outcome?: OutboundOutcome;
  error?: string;
};

function record(meta: TrackMeta, done: Finished) {
  const target = sink;
  if (!target || target.mode === 'off') return;
  try {
    const extra = meta.redact ?? [];
    const status = done.status ?? done.response?.status;
    let outcome: OutboundOutcome = done.outcome ?? (done.response ? (done.response.ok ? 'ok' : 'http_error') : 'ok');
    let error = done.error;
    if (outcome === 'http_error' && !error) error = describeBody(done.text === undefined ? undefined : redactBody(done.text, extra), status);
    if (outcome === 'ok' && done.text !== undefined && meta.classify && status !== undefined) {
      const verdict = meta.classify({ status, text: done.text });
      if (verdict) {
        outcome = 'envelope_error';
        error = verdict.error.slice(0, ERROR_LIMIT);
      }
    }

    const where = redactUrl(done.url, extra);
    const failed = outcome !== 'ok';
    const keepBodies = failed || target.mode === 'all' || meta.environment === 'sandbox';
    const sent = typeof done.init.body === 'string' ? done.init.body : undefined;
    const request = keepBodies && sent !== undefined ? truncate(redactBody(sent, extra), BODY_LIMIT) : undefined;
    const answer = keepBodies && done.text !== undefined ? truncate(redactBody(done.text, extra), BODY_LIMIT) : undefined;

    const row: typeof schema.outboundCalls.$inferInsert = {
      id: newId('oc', done.startedAt.getTime()),
      createdAt: done.startedAt,
      service: meta.service,
      environment: meta.environment ?? null,
      operation: meta.operation,
      method: done.method,
      host: where.host.slice(0, 255),
      path: where.path.slice(0, 500),
      url: where.url,
      status: status ?? null,
      outcome,
      durationMs: Math.round(done.durationMs),
      error: error ?? null,
      requestHeaders: redactHeaders(done.init.headers as HeadersInit | undefined, extra),
      requestBody: request?.text ?? null,
      requestBytes: sent === undefined ? null : Buffer.byteLength(sent),
      // The answer's headers are only worth keeping when something went wrong.
      responseHeaders: failed && done.response ? redactHeaders(done.response.headers, extra) : null,
      responseBody: answer?.text ?? null,
      responseBytes: done.text === undefined ? null : Buffer.byteLength(done.text),
      truncated: Boolean(request?.cut || answer?.cut),
      source: done.caller.source ?? 'system',
      route: done.caller.route?.slice(0, 300) ?? null,
      requestId: done.caller.requestId?.slice(0, 64) ?? null,
      jobKind: done.caller.jobKind?.slice(0, 80) ?? null,
      userRef: done.caller.userId ?? null,
      accountRef: done.caller.accountId ?? null,
      companyRef: done.caller.companyId ?? null,
    };

    const line = { service: meta.service, environment: meta.environment, operation: meta.operation, status, outcome, ms: row.durationMs, requestId: row.requestId, route: row.route, error };
    if (failed) target.log.warn(line, 'third-party call failed');
    else target.log.debug?.(line, 'third-party call');

    void target.db
      .insert(schema.outboundCalls)
      .values(row)
      .then(
        () => undefined,
        (err: unknown) => target.log.warn({ err: String(err) }, 'could not record a third-party call'),
      );
  } catch (err) {
    target.log.warn({ err: String(err) }, 'could not record a third-party call');
  }
}

/** The gateway's own wording is the best evidence; raw text, collapsed and cut, is the fallback. */
function describeBody(text: string | undefined, status: number | undefined): string {
  const collapsed = (text ?? '').replace(/\s+/g, ' ').trim();
  const head = `HTTP ${status ?? '?'}`;
  return collapsed ? `${head}: ${collapsed.slice(0, 300)}` : head;
}

/** Drops rows older than `days`. Returns nothing: it is housekeeping. */
export async function purgeOutboundCalls(db: Db, now: Date, days: number): Promise<void> {
  await db.delete(schema.outboundCalls).where(lt(schema.outboundCalls.createdAt, new Date(now.getTime() - days * 86_400_000)));
}
