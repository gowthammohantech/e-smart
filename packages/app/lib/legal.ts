declare const process: { env: Record<string, string | undefined> };

/**
 * The marketing site (apps/site), where the legal and support pages live. EXPO_PUBLIC_SITE_URL is
 * inlined at build time; set it when the site's address is not the default.
 */
const SITE = (process.env.EXPO_PUBLIC_SITE_URL?.trim() || 'https://elixirbooks.smart').replace(/\/+$/, '');

export const LEGAL = {
  privacy: `${SITE}/privacy`,
  terms: `${SITE}/terms`,
  refund: `${SITE}/refund`,
  deleteAccount: `${SITE}/delete-account`,
  support: `${SITE}/support`,
  supportEmail: 'contact@elixir-books.com',
  /**
   * The version of the terms and privacy policy shown at sign-up: the "last updated" date on the pages
   * (apps/site/content/legal.ts). Change both together; the server stores it with each acceptance.
   */
  termsVersion: '2026-11-02',
} as const;
