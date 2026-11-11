/**
 * The public "Give it a try" account's switch and sign-in. Shared by the API's demo seeder
 * (apps/api/src/demo), which builds it, and the auth handlers, which hand the sign-in to the app.
 *
 *   DEMO_ENABLED    on unless `false` / `0` / `off` / `no`
 *   DEMO_EMAIL      default demo@elixir-books.com
 *   DEMO_PASSWORD   default below; public on purpose, since the account only reads
 */

/** Bump when the dataset changes: every environment rebuilds the demo on its next check. */
export const PUBLIC_DEMO_SEED_VERSION = 2;

/** Rebuilt at least this often, so "overdue", "this month" and the period pickers stay current. */
export const PUBLIC_DEMO_REFRESH_DAYS = 7;

export const DEFAULT_PUBLIC_DEMO_EMAIL = 'demo@elixir-books.com';
export const DEFAULT_PUBLIC_DEMO_PASSWORD = 'TryElixirBooks@2026';

export interface PublicDemoConfig {
  enabled: boolean;
  email: string;
  password: string;
}

const OFF = new Set(['false', '0', 'off', 'no']);

export function publicDemoConfig(env: Record<string, string | undefined> = process.env): PublicDemoConfig {
  const enabled = !OFF.has((env.DEMO_ENABLED ?? '').trim().toLowerCase());
  const email = ((env.DEMO_EMAIL ?? '').trim() || DEFAULT_PUBLIC_DEMO_EMAIL).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`DEMO_EMAIL is not an email address: ${email}`);
  const password = env.DEMO_PASSWORD || DEFAULT_PUBLIC_DEMO_PASSWORD;
  if (password.length < 12) throw new Error('DEMO_PASSWORD must be at least 12 characters.');
  return { enabled, email, password };
}
