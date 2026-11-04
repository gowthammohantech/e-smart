import { ApiError } from '@esmart/api-client';
import { isNetworkError } from './api';

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
};

/**
 * A message for a failed API call, in the user's language where the code is
 * one we know, otherwise the server's own explanation.
 */
export function describeError(err: unknown, tr: Translate): string {
  if (isNetworkError(err)) return tr('auth:remote.offline');
  if (err instanceof RemoteError) return tr(`errors:remote.${err.code}`, { status: err.status ?? '' });
  if (err instanceof ApiError) {
    const key = err.code ? BY_CODE[err.code] : undefined;
    if (key) return tr(key);
    if (err.message) return err.message;
  }
  return tr('auth:remote.failed');
}
