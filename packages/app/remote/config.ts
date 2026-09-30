/**
 * Where the app's data lives, fixed at build time:
 *
 *   EXPO_PUBLIC_DATA_SOURCE=local   the seeded demo, no server (default)
 *   EXPO_PUBLIC_DATA_SOURCE=remote  the API at EXPO_PUBLIC_API_URL
 *
 * Metro inlines `process.env.EXPO_PUBLIC_*` when it is written out in full,
 * so these reads stay literal.
 */
declare const process: { env: Record<string, string | undefined> };

export type DataSource = 'local' | 'remote';

export const DATA_SOURCE: DataSource = process.env.EXPO_PUBLIC_DATA_SOURCE === 'remote' ? 'remote' : 'local';

/** The API's /v1 base, without a trailing slash. */
export const API_BASE_URL = `${(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '')}/v1`;

export function isRemote(): boolean {
  return DATA_SOURCE === 'remote';
}
