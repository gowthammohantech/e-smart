import { ApiError, createApiClient, type Schema, type Tokens } from '@esmart/api-client';

export { ApiError };
export type { Schema };

const TOKENS = 'esmart.migrator.tokens';
const SERVER = 'esmart.migrator.server';
/** The live server a build talks to unless told otherwise. People can change it on the first screen. */
const PRODUCTION_SERVER = 'https://api-production-4abd.up.railway.app';

/** A server address as people write it: with or without the trailing slash or `/v1` (the app adds `/v1` itself). */
export const cleanServerUrl = (url: string) => url.trim().replace(/\/+$/, '').replace(/\/v1$/i, '').replace(/\/+$/, '');

// `VITE_API_URL` at build time wins. Otherwise the live server, except in development (`npm run migrator`),
// which talks to the local one so trying things out never reaches live data. `env` is missing under tsx.
const DEFAULT_SERVER = cleanServerUrl((import.meta.env?.VITE_API_URL as string | undefined) || (import.meta.env?.DEV ? 'http://localhost:4000' : PRODUCTION_SERVER));

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the session lasts until the window closes.
  }
}

let memoryTokens: Tokens | null = null;
/** Tokens for the signed-in user. Kept in the app's own storage; the OS keychain is a later step. */
export const tokenStore = {
  get(): Tokens | null {
    if (memoryTokens) return memoryTokens;
    try {
      const raw = read(TOKENS);
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  },
  set(tokens: Tokens | null) {
    memoryTokens = tokens;
    write(TOKENS, tokens ? JSON.stringify(tokens) : null);
  },
};

export const serverUrl = () => cleanServerUrl(read(SERVER) || DEFAULT_SERVER);

function build() {
  return createApiClient({
    baseUrl: `${serverUrl()}/v1`,
    getTokens: () => tokenStore.get(),
    setTokens: (tokens) => tokenStore.set(tokens),
  });
}

let client = build();
/** The typed client for the server chosen on the first screen. */
export const api = () => client;

/** Points the app at another server (a local one, staging, production) and signs out of the old one. */
export function setServerUrl(url: string) {
  write(SERVER, cleanServerUrl(url) || null);
  tokenStore.set(null);
  client = build();
}

/** The message to show for a failed call, in words a person can act on. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    // A refused row says what is wrong with it, field by field.
    const issues = ((err.problem as { issues?: { message?: string }[] }).issues ?? []).map((i) => i.message).filter(Boolean);
    if (issues.length) return issues.join(' · ');
    const text = err.message.trim();
    const bare = !text || text === err.code || text === err.problem.title || /^[A-Z0-9_]+$/.test(text) || /^HTTP \d{3}/.test(text);
    return bare ? 'That didn’t work. Check the details and try again.' : text;
  }
  if (err instanceof TypeError) return `Can’t reach the server at ${serverUrl()}. Check your internet connection or the server address.`;
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Try again.';
}
