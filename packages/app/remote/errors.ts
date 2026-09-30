import { ApiError } from '@esmart/api-client';
import { isNetworkError } from './api';

type Translate = (key: any) => string;

const BY_CODE: Record<string, string> = {
  INVALID_CREDENTIALS: 'auth:remote.invalidCredentials',
  EMAIL_TAKEN: 'auth:remote.emailTaken',
  PHONE_TAKEN: 'auth:remote.phoneTaken',
  PHONE_NOT_REGISTERED: 'auth:remote.phoneNotRegistered',
  OTP_INVALID: 'auth:remote.codeInvalid',
  OTP_LOCKED: 'auth:remote.codeExpired',
  OTP_EXPIRED: 'auth:remote.codeExpired',
  RATE_LIMITED: 'auth:remote.tooMany',
};

/**
 * A message for a failed API call, in the user's language where the code is
 * one we know, otherwise the server's own explanation.
 */
export function describeError(err: unknown, tr: Translate): string {
  if (isNetworkError(err)) return tr('auth:remote.offline');
  if (err instanceof ApiError) {
    const key = err.code ? BY_CODE[err.code] : undefined;
    if (key) return tr(key);
    if (err.message) return err.message;
  }
  return tr('auth:remote.failed');
}
