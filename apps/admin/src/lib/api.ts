import { ApiError, createApiClient, type Schema, type Tokens } from '@esmart/api-client';

export { ApiError };
export type { Schema };

const KEY = 'esmart.admin.tokens';
export const API_URL = `${(import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')}/v1`;

/**
 * Operator tokens live in sessionStorage: they are cleared with the tab, so
 * a forgotten admin session doesn't outlive the browser window.
 */
export const tokenStore = {
  get(): Tokens | null {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  },
  set(tokens: Tokens | null) {
    try {
      if (tokens) sessionStorage.setItem(KEY, JSON.stringify(tokens));
      else sessionStorage.removeItem(KEY);
    } catch {
      // Storage blocked: the session lasts for this page only.
    }
    listeners.forEach((l) => l(tokens));
  },
};

const listeners = new Set<(tokens: Tokens | null) => void>();
/** Called when tokens change, including when a failed refresh clears them. */
export function onTokensChange(listener: (tokens: Tokens | null) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const api = createApiClient({
  baseUrl: API_URL,
  getTokens: () => tokenStore.get(),
  setTokens: (tokens) => tokenStore.set(tokens),
});

/** The message to show for a failed call. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

/** openapi-fetch's `data`, which the client's middleware guarantees on success. */
export function need<T>(res: { data?: T }): T {
  if (res.data === undefined) throw new Error('Empty response');
  return res.data;
}
