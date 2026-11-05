/**
 * Build-time settings. The apps always talk to the API; there is no local
 * demo mode.
 *
 *   EXPO_PUBLIC_API_URL               the API, without /v1. Required in a release build; a development
 *                                     build falls back to http://localhost:4000
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
declare const __DEV__: boolean;

setSandboxGstinsAllowed(process.env.EXPO_PUBLIC_TAXATION_GSTIN_ALLOW_SANDBOX === 'true');

const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || (__DEV__ ? 'http://localhost:4000' : '');

/**
 * False for a release build made without EXPO_PUBLIC_API_URL. It would otherwise talk to localhost,
 * which on someone's phone is nothing: the root layout shows a "misconfigured" screen instead.
 */
export const API_CONFIGURED = API_URL !== '';

/** The API's /v1 base, without a trailing slash. */
export const API_BASE_URL = `${API_URL.replace(/\/+$/, '')}/v1`;

/** Credentials to prefill on the sign-in screen; empty unless the build sets them. */
export const DEMO_LOGIN = {
  email: process.env.EXPO_PUBLIC_DEMO_LOGIN_EMAIL ?? '',
  password: process.env.EXPO_PUBLIC_DEMO_LOGIN_PASSWORD ?? '',
};
