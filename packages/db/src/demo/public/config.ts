/**
 * The public "Give it a try" account: its ids, its sign-in and the switch that
 * turns it on. Shared by the seeder (which builds it) and the API (which hands
 * the sign-in to the app and keeps the account read-only).
 *
 *   DEMO_ENABLED    on unless `false` / `0` / `off`
 *   DEMO_EMAIL      default demo@elixir-books.com
 *   DEMO_PASSWORD   default below; public on purpose, since the account only reads
 */
export const PUBLIC_DEMO_ACCOUNT_ID = 'acct_public_demo';
export const PUBLIC_DEMO_OWNER_ID = 'dmo_usr_owner';

/** Bump when the dataset changes: every environment rebuilds the demo on its next check. */
export const PUBLIC_DEMO_SEED_VERSION = 1;

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
