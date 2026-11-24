import { ApiError } from '@esmart/api-client';
import { isNetworkError } from './api';
import { MfaCancelled } from '../features/security/mfaGateStore';

type Translate = (key: any, options?: any) => string;

/**
 * Why a remote call went wrong on our side of the wire: the server answered,
 * but not with what the app needs. The message is for logs; `describeError`
 * shows the user the translation for `code`.
 */
export type RemoteErrorCode = 'noUploadUrl' | 'uploadFailed' | 'incompleteSession' | 'noPdf' | 'noLink' | 'exportSlow' | 'exportFailed';

export class RemoteError extends Error {
  constructor(
    readonly code: RemoteErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}

const BY_CODE: Record<string, string> = {
  INVALID_CREDENTIALS: 'auth:remote.invalidCredentials',
  EMAIL_TAKEN: 'auth:remote.emailTaken',
  PHONE_TAKEN: 'auth:remote.phoneTaken',
  PHONE_NOT_REGISTERED: 'auth:remote.phoneNotRegistered',
  OTP_INVALID: 'auth:remote.codeInvalid',
  OTP_LOCKED: 'auth:remote.codeExpired',
  OTP_EXPIRED: 'auth:remote.codeExpired',
  RATE_LIMITED: 'auth:remote.tooMany',
  ACCOUNT_LOCKED: 'auth:remote.accountLocked',
  DEMO_READ_ONLY: 'auth:remote.demoReadOnly',
};

/** What a person is told for each kind of refusal when the server gave no wording of its own. */
const BY_STATUS: Record<number, string> = {
  400: 'errors:remote.checkDetails',
  401: 'errors:remote.sessionEnded',
  403: 'errors:remote.noPermission',
  404: 'errors:remote.notFound',
  409: 'errors:remote.conflict',
  412: 'errors:remote.changedElsewhere',
  413: 'errors:remote.tooLarge',
  422: 'errors:remote.checkDetails',
  429: 'auth:remote.tooMany',
};

/**
 * Whether the server's own wording can be shown as it is. Its sentences are written for people;
 * what must never reach the screen is an error code ("TOKEN_EXPIRED"), an HTTP title ("Bad
 * Request", "HTTP 502") or schema vocabulary ("must match pattern").
 */
function readable(text: string, err: ApiError): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t === err.code || t === err.problem.title) return false;
  if (/^[A-Z0-9_]+$/.test(t) || /^HTTP \d{3}/.test(t)) return false;
  if (/must match|must NOT|must have required|must be (equal|<|>)|\^\[|\[A-Z|\[0-9|body\/|params\/|querystring/.test(t)) return false;
  return true;
}

/**
 * A message for a failed API call, in the user's language: a sentence the server wrote for people,
 * otherwise one for the kind of failure. Never a code, an HTTP title or a developer's wording.
 */
export function describeError(err: unknown, tr: Translate): string {
  // The person chose to sign out at the authenticator code: nothing went wrong.
  if (err instanceof MfaCancelled) return '';
  if (isNetworkError(err)) return tr('auth:remote.offline');
  if (err instanceof RemoteError) return tr(`errors:remote.${err.code}`, { status: err.status ?? '' });
  if (err instanceof ApiError) {
    const key = err.code ? BY_CODE[err.code] : undefined;
    if (key) return tr(key);
    if (err.message && readable(err.message, err)) return err.message;
    const byStatus = BY_STATUS[err.status];
    if (byStatus) return tr(byStatus);
    if (err.status >= 500) return tr('errors:remote.tryLater');
  }
  return tr('auth:remote.failed');
}
