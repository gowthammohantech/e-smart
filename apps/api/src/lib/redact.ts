/**
 * Taking secrets out of what the third-party call log stores. Everything written to `outbound_calls` goes
 * through here first: headers, the query string and the bodies. The test for "is this a secret" is the
 * name, not the value, because a value (a token, an OTP, a password) has no shape to recognise.
 */

export const REDACTED = '[redacted]';

/** Names whose values are never stored: passwords, secrets, tokens, keys, OTPs, signatures. */
const SECRET_NAME = /pass(word|wd)?|secret|token|authorization|api[-_]?key|authkey|otp|signature|credential|\bsek\b|app[-_]?key|cookie|^x-esmart-/i;

/** Names whose value only identifies the application: shown as its first characters, enough to tell two apart. */
const IDENTIFIER_NAME = /^(client[-_]?id|gspappid|app[-_]?id)$/i;

export const isSecretName = (name: string): boolean => SECRET_NAME.test(name);

const maskIdentifier = (value: string) => (value.length <= 4 ? '****' : `${value.slice(0, 4)}…`);

function redactValue(name: string, value: unknown, extra: readonly string[]): unknown {
  if (typeof value === 'string') {
    if (IDENTIFIER_NAME.test(name)) return maskIdentifier(value);
    if (/^authorization$/i.test(name)) return value.replace(/^(\w+)\s+.+$/, `$1 ${REDACTED}`);
  }
  return isSecretName(name) || extra.includes(name.toLowerCase()) ? REDACTED : value;
}

function headerPairs(headers: HeadersInit): [string, string][] {
  if (Array.isArray(headers)) return headers as [string, string][];
  if (typeof (headers as Headers).forEach === 'function') {
    const collected: [string, string][] = [];
    (headers as Headers).forEach((value, key) => collected.push([key, value]));
    return collected;
  }
  return Object.entries(headers as Record<string, string>);
}

/** A header map with secrets removed. Accepts what `fetch` accepts (a plain object, `Headers` or pairs). */
export function redactHeaders(headers: HeadersInit | undefined | null, extra: readonly string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [name, value] of headerPairs(headers)) out[name] = String(redactValue(name, String(value), extra));
  return out;
}

/** The URL split into host and endpoint (no query), plus the full form with secret parameters removed. */
export function redactUrl(raw: string, extra: readonly string[] = []): { host: string; path: string; url: string } {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      url.searchParams.set(key, String(redactValue(key, url.searchParams.get(key) ?? '', extra)));
    }
    return { host: url.host, path: url.pathname, url: url.toString().replace(/%5Bredacted%5D/gi, REDACTED) };
  } catch {
    return { host: 'unknown', path: raw.slice(0, 500), url: raw.slice(0, 2000) };
  }
}

function redactTree(node: unknown, extra: readonly string[], depth = 0): unknown {
  if (depth > 12) return node;
  if (Array.isArray(node)) return node.map((item) => redactTree(item, extra, depth + 1));
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([key, value]) => [key, typeof value === 'object' && value !== null ? redactTree(value, extra, depth + 1) : redactValue(key, value, extra)]),
    );
  }
  return node;
}

/** Past this a body is not parsed: only the pattern scrub below is applied. */
const PARSE_LIMIT = 1_000_000;

/**
 * A body as text with secrets removed. JSON is read and its sensitive fields replaced; anything else
 * (a form post, plain text) has `name=value` pairs for sensitive names scrubbed.
 */
export function redactBody(text: string, extra: readonly string[] = []): string {
  if (!text) return text;
  const trimmed = text.trimStart();
  if (text.length <= PARSE_LIMIT && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
    try {
      return JSON.stringify(redactTree(JSON.parse(text), extra));
    } catch {
      // Not JSON after all: scrub it as text.
    }
  }
  return text.replace(/([A-Za-z0-9_.-]+)=([^&\s"']*)/g, (_whole, key: string, value: string) => (isSecretName(key) || extra.includes(key.toLowerCase()) ? `${key}=${REDACTED}` : `${key}=${value}`));
}

/** Cuts `text` to `limit` characters; `cut` says whether anything was lost. */
export function truncate(text: string, limit: number): { text: string; cut: boolean } {
  return text.length > limit ? { text: `${text.slice(0, limit)}… [${text.length - limit} more characters not kept]`, cut: true } : { text, cut: false };
}
