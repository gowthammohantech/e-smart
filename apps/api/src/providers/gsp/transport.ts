import { GSP_READ_TIMEOUT_MS, GSP_TOKEN_FALLBACK_TTL_SECONDS, GSP_WRITE_TIMEOUT_MS } from './constants';
import { describeGspError, envelopeFailed, type GspEnvelope } from './envelope';

/**
 * Where a failure came from. The status alone cannot say: the transport
 * synthesises one for an envelope failure (502 on a read, 422 on a write), and
 * those overlap the real HTTP ones.
 */
export type GspFailureSource =
  /** Nothing answered: DNS, TLS, connection refused, timeout. */
  | 'transport'
  /** The gateway answered with a non-2xx. */
  | 'http'
  /** A 200 carrying `success: false`. */
  | 'envelope';

/** What the transport raises; the caller decides what it means for a lookup or a filing. */
export class GspRequestError extends Error {
  constructor(
    message: string,
    readonly source: GspFailureSource,
    readonly status: number | undefined,
    /** The parsed envelope, when there was one. Kept for NIC code matching. */
    readonly envelope?: GspEnvelope | null,
  ) {
    super(message);
    this.name = 'GspRequestError';
  }

  /** The gateway could not be reached or was itself broken — not a verdict on the document. */
  get isUnavailable(): boolean {
    return this.source === 'transport' || (this.source === 'http' && (this.status ?? 0) >= 500);
  }
}

/** Our application credentials were refused. 503-class: never the caller's fault. */
export class GspAuthError extends Error {
  constructor(message = 'The GST gateway refused this application’s credentials.') {
    super(message);
    this.name = 'GspAuthError';
  }
}

/** Configuration the gateway needs and the deployment lacks; the message names the variable. */
export class GspConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GspConfigError';
  }
}

export interface GspRequest {
  baseUrl: string;
  path: string;
  /** Bearer token; empty sends no `Authorization` header at all. */
  token: string;
  query?: Readonly<Record<string, string>>;
  headers?: Readonly<Record<string, string>>;
  body?: unknown;
}

export interface GspTransport {
  /** Adaequare: exchanges the application pair for a bearer at the base URL's origin. */
  authenticate(credentials: { baseUrl: string; clientId: string; clientSecret: string }): Promise<{ accessToken: string; expiresInSeconds: number }>;
  /** A read. 20 s; an envelope failure raises with status 502. */
  get<T>(request: GspRequest): Promise<GspEnvelope<T>>;
  /** A write. 45 s, because giving up early cancels nothing at the portal; an envelope failure raises with 422. */
  post<T>(request: GspRequest): Promise<GspEnvelope<T>>;
}

/** Adaequare mints its token above `/test/`, at the origin, so the origin is joined, not the base. */
export const ADAEQUARE_AUTH_PATH = '/gsp/authenticate?action=GSP&grant_type=token';

type FetchLike = typeof fetch;

/**
 * Native `fetch` plus `AbortSignal.timeout`. No retry, on purpose: a filing that
 * timed out may already be registered at the portal, and retrying it blindly is
 * how a duplicate IRN happens. The recovery is the by-document lookup.
 */
export class FetchGspTransport implements GspTransport {
  constructor(private readonly fetchImpl: FetchLike = (...args) => fetch(...args)) {}

  async authenticate(credentials: { baseUrl: string; clientId: string; clientSecret: string }) {
    const response = await this.send(`${new URL(credentials.baseUrl).origin}${ADAEQUARE_AUTH_PATH}`, {
      method: 'POST',
      headers: { gspappid: credentials.clientId, gspappsecret: credentials.clientSecret, Accept: 'application/json' },
      timeoutMs: GSP_READ_TIMEOUT_MS,
    });
    const payload = response.payload as Record<string, unknown> | null;
    if (!response.ok) {
      throw new GspRequestError(describeGspError(payload, 'The GST gateway refused the application credentials.'), 'http', response.status, payload);
    }
    const accessToken = payload?.access_token;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      const shape = payload === null ? 'the body was not JSON, so this gateway may have no /gsp/authenticate route configured' : 'the JSON body carried no access_token';
      throw new GspRequestError(`The GST gateway returned no access token (HTTP ${response.status}): ${shape}.`, 'envelope', response.status, payload);
    }
    return { accessToken, expiresInSeconds: readExpiresIn(payload?.expires_in) };
  }

  get<T>(request: GspRequest) {
    return this.call<T>(request, 'GET', GSP_READ_TIMEOUT_MS, 502);
  }

  post<T>(request: GspRequest) {
    return this.call<T>(request, 'POST', GSP_WRITE_TIMEOUT_MS, 422);
  }

  private async call<T>(request: GspRequest, method: 'GET' | 'POST', timeoutMs: number, envelopeFailureStatus: number): Promise<GspEnvelope<T>> {
    const url = new URL(`${request.baseUrl.replace(/\/+$/, '')}${request.path}`);
    for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, value);

    const response = await this.send(url.toString(), {
      method,
      headers: {
        ...(request.token === '' ? {} : { Authorization: `Bearer ${request.token}` }),
        Accept: 'application/json',
        ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...request.headers,
      },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      timeoutMs,
    });

    const envelope = response.payload as GspEnvelope<T> | null;
    if (!response.ok) {
      // The gateway's own wording names the problem far better than anything generic; raw text is the fallback.
      throw new GspRequestError(describeGspError(envelope, describeRawBody(response.body, response.status)), 'http', response.status, envelope);
    }
    if (envelopeFailed(envelope)) {
      throw new GspRequestError(describeGspError(envelope, 'The GST portal refused the request.'), 'envelope', envelopeFailureStatus, envelope);
    }
    return envelope ?? {};
  }

  private async send(url: string, init: { method: string; headers: Record<string, string>; body?: string; timeoutMs: number }) {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: init.method,
        headers: init.headers,
        ...(init.body === undefined ? {} : { body: init.body }),
        signal: AbortSignal.timeout(init.timeoutMs),
      });
    } catch (error) {
      throw new GspRequestError(error instanceof Error ? error.message : String(error), 'transport', undefined, null);
    }
    const text = await response.text();
    return { ok: response.ok, status: response.status, payload: parseJson(text), body: text };
  }
}

function parseJson(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const RAW_BODY_LIMIT = 300;

/** Whatever stands in front of the portal (a rate limiter, a proxy) answers in its own words; those are the only evidence. */
function describeRawBody(text: string, status: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) return `The GST gateway refused the request (HTTP ${status}).`;
  const shown = collapsed.length > RAW_BODY_LIMIT ? `${collapsed.slice(0, RAW_BODY_LIMIT)}…` : collapsed;
  return `The GST gateway refused the request (HTTP ${status}): ${shown}`;
}

/** `expires_in` is seconds but has been seen as a string. Unusable falls back to ten minutes. */
function readExpiresIn(value: unknown): number {
  const seconds = typeof value === 'string' ? Number(value) : value;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return GSP_TOKEN_FALLBACK_TTL_SECONDS;
  return Math.floor(seconds);
}
