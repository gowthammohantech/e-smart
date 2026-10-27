/**
 * Build-time settings. The apps always talk to the API; there is no local
 * demo mode.
 *
 *   EXPO_PUBLIC_API_URL               the API, without /v1 (default http://localhost:4000)
 *   EXPO_PUBLIC_DEMO_LOGIN_EMAIL      prefill for the sign-in form (demo and sandbox builds only)
 *   EXPO_PUBLIC_DEMO_LOGIN_PASSWORD   prefill for the sign-in form (demo and sandbox builds only)
 *

 *   EXPO_PUBLIC_TAXATION_GSTIN_ALLOW_SANDBOX
 *                                     `true` admits NIC's sandbox GSTIN shape (29AAGCB1286Q000) in the app's own
 *                                     checks, which run in the client (the e-invoice sheet validates before
 *                                     calling the API). Match the API's TAXATION_GSTIN_ALLOW_SANDBOX; sandbox only.
 *
 * Metro inlines `process.env.EXPO_PUBLIC_*` when it is written out in full,
 * so these reads stay literal. Whatever they hold is compiled into the client
 * bundle and readable by anyone who loads it: set the demo login only on a
 * deployment whose account is a throwaway demo.
 */
import { setSandboxGstinsAllowed } from '@esmart/core/domain/gstin';

declare const process: { env: Record<string, string | undefined> };

setSandboxGstinsAllowed(process.env.EXPO_PUBLIC_TAXATION_GSTIN_ALLOW_SANDBOX === 'true');

/** The API's /v1 base, without a trailing slash. */
export const API_BASE_URL = `${(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '')}/v1`;

/** Credentials to prefill on the sign-in screen; empty unless the build sets them. */
export const DEMO_LOGIN = {
  email: process.env.EXPO_PUBLIC_DEMO_LOGIN_EMAIL ?? '',
  password: process.env.EXPO_PUBLIC_DEMO_LOGIN_PASSWORD ?? '',
};
