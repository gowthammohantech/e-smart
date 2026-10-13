/**
 * Everything about Pay4SMS that is not secret.
 *
 * Only the account token comes from the environment (`PAY4SMS_TOKEN`). The base
 * URL, sender id, template id and message body are committed because they are
 * not credentials — and because they are a **DLT-registered matched set**: the
 * operator drops any message whose text does not match the template registered
 * against that sender and template id, silently and with a 200 response.
 * Changing any one of these strings without re-registering means every SMS stops
 * arriving and nothing reports an error.
 */
export const PAY4SMS_BASE_URL = 'http://pay4sms.in/sendsms/';
export const PAY4SMS_SENDER_ID = 'ELIXRB';
export const PAY4SMS_TEMPLATE_ID = '1707172527595886510';
export const PAY4SMS_CREDIT = '2';
export const PAY4SMS_TIMEOUT_MS = 10_000;

/** The DLT-approved body. `{name}` and `{otp}` are substituted at send time. */
export const PAY4SMS_TEMPLATE = `Dear {name}, Your OTP is : {otp} to login to the Mobile app of Elixr Books.
The business aligned accounting software.
Best Regards,
Team Elixr Books.`;

/** We hold no name at OTP time, and the template requires the token to be present. */
export const PAY4SMS_DEFAULT_NAME = 'Customer';

/**
 * Substitutes `{token}` placeholders, leaving unknown ones intact, so a typo
 * shows up as a literal `{nmae}` in the message instead of silently vanishing.
 */
export function renderTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (token, key: string) => values[key] ?? token);
}

/**
 * Sends one OTP through the DLT template.
 *
 * The response is not parsed: Pay4SMS answers HTTP 200 with account-specific
 * plain text for success and failure alike, so only a transport failure
 * (timeout, DNS, connection refused) throws. Resolving does not mean the SMS
 * arrived. The OTP code is never logged.
 */
export async function sendPay4smsOtp(
  token: string,
  otp: { phone: string; code: string; name?: string },
  debug: (msg: string) => void = () => {},
): Promise<void> {
  const url = new URL(PAY4SMS_BASE_URL);
  url.searchParams.set('token', token);
  url.searchParams.set('credit', PAY4SMS_CREDIT);
  url.searchParams.set('sender', PAY4SMS_SENDER_ID);
  url.searchParams.set('templateid', PAY4SMS_TEMPLATE_ID);
  // Ten bare digits — the provider does not take E.164.
  url.searchParams.set('number', otp.phone.replace(/^\+91/, ''));
  url.searchParams.set('message', renderTemplate(PAY4SMS_TEMPLATE, { name: otp.name ?? PAY4SMS_DEFAULT_NAME, otp: otp.code }));

  const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(PAY4SMS_TIMEOUT_MS) });
  const body = await res.text();
  debug(`pay4sms response: ${body.slice(0, 200)}`);
}
