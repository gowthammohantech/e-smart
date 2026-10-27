/**
 * Reading what a GSP sends back.
 *
 * The one rule that governs this file: **HTTP 200 does not mean success.** A bad
 * GSTIN, a duplicate IRN, a schema violation, an expired portal session and a
 * quota breach all arrive as a 200 carrying `{ success: false, message }`.
 * Check the envelope, never the status code alone.
 */

export interface GspEnvelope<TResult = unknown> {
  /** May be the boolean `false` or the string `"false"`; both have been seen. */
  success?: boolean | string;
  message?: string;
  errorCode?: string | number;
  result?: TResult | null;
  /** Gateway-level refusals (bad token, disabled account). A 401/403 sets only these. */
  error_description?: string;
  errorDesc?: string;
  error?: string;
}

export function envelopeFailed(data: GspEnvelope | null | undefined): boolean {
  return data?.success === false || data?.success === 'false';
}

const ENVELOPE_KEYS = ['success', 'message', 'errorCode', 'result', 'error_description', 'errorDesc', 'error'] as const;

/**
 * The payload out of the envelope, whichever way the gateway wrapped it:
 * `{ success, message, result }` from Adaequare, or the NIC record bare from a
 * stand-in gateway. The test is the envelope's vocabulary, not the payload's.
 * `result` present and `null` still means "not found".
 */
export function unwrapResult<TResult>(envelope: GspEnvelope<TResult> | null | undefined): TResult | null {
  if (envelope === null || envelope === undefined || typeof envelope !== 'object') return null;
  if ('result' in envelope) return readResult<TResult>(envelope.result);
  if (ENVELOPE_KEYS.some((key) => key in envelope)) return null;
  return envelope as unknown as TResult;
}

/**
 * Whether the payload carries any of `keys` at all, whatever the value. For a
 * cancellation, presence is the test: an unparseable `CancelDate` still says the
 * portal withdrew something, an absent one says the body is not an
 * acknowledgement.
 */
export function carriesField(payload: unknown, ...keys: readonly string[]): boolean {
  if (typeof payload !== 'object' || payload === null) return false;
  return keys.some((key) => key in payload);
}

/** Adaequare forwards some NIC payloads as a string of JSON; parsed so no caller wonders. */
function readResult<TResult>(result: unknown): TResult | null {
  if (result === null || result === undefined) return null;
  if (typeof result !== 'string') return result as TResult;
  try {
    const parsed: unknown = JSON.parse(result);
    return parsed === null ? null : (parsed as TResult);
  } catch {
    return result as unknown as TResult;
  }
}

/** `message` is the portal's verdict on the document; the rest are the GSP's on the wrapping request. */
const MESSAGE_KEYS = ['message', 'error_description', 'errorDesc', 'error'] as const;

/** NIC types `ErrorCode` as a string, but it has been seen as a number. */
export function asCode(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export type NicError = { code: string | null; text: string };

/**
 * NIC returns its errors as a JSON array, which the GSP forwards as a *string*.
 * `'[{"ErrorCode":"2150","ErrorMessage":"Duplicate IRN"}]'` → one entry.
 */
export function nicErrorsOf(data: GspEnvelope | null | undefined): NicError[] {
  const errors: NicError[] = [];
  const top = asCode(data?.errorCode);
  for (const key of MESSAGE_KEYS) {
    const value = data?.[key];
    if (typeof value !== 'string') continue;
    try {
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed)) continue;
      for (const entry of parsed) {
        if (typeof entry !== 'object' || entry === null) continue;
        const record = entry as Record<string, unknown>;
        const text = typeof record.ErrorMessage === 'string' ? record.ErrorMessage.trim() : '';
        const code = asCode(record.ErrorCode);
        if (text || code) errors.push({ code, text });
      }
    } catch {
      // Not a JSON array of NIC errors.
    }
  }
  if (!errors.length && top) errors.push({ code: top, text: '' });
  return errors;
}

/** One line a human can act on. */
export function describeGspError(data: GspEnvelope | null | undefined, fallback: string): string {
  const described = nicErrorsOf(data)
    .map((e) => (e.text === '' ? (e.code ?? '') : e.code === null ? e.text : `${e.text} (${e.code})`))
    .filter(Boolean)
    .join('; ');
  if (described) return described;
  for (const key of MESSAGE_KEYS) {
    const value = data?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

/** Every NIC error code the gateway mentioned. Callers match codes, never wording. */
export function gspErrorCodes(data: GspEnvelope | null | undefined): string[] {
  const codes = nicErrorsOf(data).flatMap((e) => (e.code === null ? [] : [e.code]));
  const top = asCode(data?.errorCode);
  if (top !== null && !codes.includes(top)) codes.unshift(top);
  return codes;
}

/** Word-bounded: a bare `includes('2150')` would fire on an amount of 2150.00. */
export function hasErrorCode(data: GspEnvelope | null | undefined, code: string): boolean {
  if (gspErrorCodes(data).includes(code)) return true;
  return new RegExp(String.raw`\b${code}\b`).test(describeGspError(data, ''));
}

// ---------------------------------------------------------------------------
// Dates. The portal sends timestamps with no timezone, on IST. A bare
// `new Date()` would resolve them against the server clock, which is 5½ hours
// out on a UTC host. There are several formats and each gets its own parser:
// the day/month orderings are indistinguishable for the first twelve days of a
// month, so one clever regex would put a validity window in the wrong month.
// ---------------------------------------------------------------------------

const IST_OFFSET = '+05:30';
const IST_OFFSET_MS = 330 * 60_000;

function toDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `yyyy-MM-dd HH:mm:ss` — the IRN acknowledgement date (`AckDt`). */
export function parsePortalDateTime(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [, year, month, day, hour, minute, second = '00'] = m;
  return toDate(`${year}-${month}-${day}T${hour}:${minute}:${second}${IST_OFFSET}`);
}

/** `DD/MM/YYYY HH:mm:ss` — the e-way bill dates (`EwbDt`, `EwbValidTill`). */
export function parsePortalSlashDateTime(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim());
  if (!m) return null;
  const [, day, month, year, hour = '00', minute = '00', second = '00'] = m;
  return toDate(`${year}-${month}-${day}T${hour}:${minute}:${second}${IST_OFFSET}`);
}

/** `DD/MM/YYYY hh:mm:ss AM|PM` — the standalone e-way bill API's dates. */
export function parsePortalSlashMeridiemDateTime(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) ?(AM|PM)$/i.exec(value.trim());
  if (!m) return null;
  const [, day, month, year, rawHour, minute, second, meridiem] = m;
  let hour = Number(rawHour);
  const half = meridiem.toUpperCase();
  if (half === 'PM' && hour !== 12) hour += 12;
  if (half === 'AM' && hour === 12) hour = 0;
  return toDate(`${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${minute}:${second}${IST_OFFSET}`);
}

/**
 * Whichever of the three the portal used. Safe to try in turn: the patterns are
 * mutually exclusive at the character level (`/` against `-`, and the meridiem).
 */
export function parsePortalDateAny(value: unknown): Date | null {
  return parsePortalSlashMeridiemDateTime(value) ?? parsePortalSlashDateTime(value) ?? parsePortalDateTime(value);
}

const two = (n: number) => String(n).padStart(2, '0');

/** An instant as the IRP spells it: `yyyy-MM-dd HH:mm:ss`, IST (varchar(19) in `e_invoices`). */
export function toPortalDateTime(value: Date): string {
  const ist = new Date(value.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${two(ist.getUTCMonth() + 1)}-${two(ist.getUTCDate())} ${two(ist.getUTCHours())}:${two(ist.getUTCMinutes())}:${two(ist.getUTCSeconds())}`;
}
