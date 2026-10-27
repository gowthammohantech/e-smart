/** Tuning for the GSP calls. Every value here was paid for once already. */

/** Retire a token a minute before it expires: one with four seconds left dies mid-call, and its 401 looks like a revoked account. */
export const GSP_TOKEN_EXPIRY_SKEW_MS = 60_000;

/** If `expires_in` is missing or unusable, assume ten minutes: a wrong guess costs one authenticate, not a run of 401s. */
export const GSP_TOKEN_FALLBACK_TTL_SECONDS = 600;

/** Reads are cheap to retry, so 20 s. Writes get 45 s: giving up early cancels nothing at the portal. */
export const GSP_READ_TIMEOUT_MS = 20_000;
export const GSP_WRITE_TIMEOUT_MS = 45_000;

/** NIC error codes the gateways branch on. Matched as codes, never as wording. */
export const NIC_ERROR_CODES = {
  /** "Duplicate IRN" — recoverable: fetch by document and adopt. */
  DUPLICATE_IRN: '2150',
  /** "Invalid GSTIN / UID" from Adaequare's taxpayer search: the register has no such registration. */
  INVALID_GSTIN: 'SWEB_9035',
} as const;
