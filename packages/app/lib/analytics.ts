import { AppState, Platform } from 'react-native';
import { sanitize, sanitizeCommon, type AnalyticsEvent, type AnalyticsProps } from '@esmart/core/analytics/events';
import { appVersion } from './appVersion';
import { setErrorReporter } from './reporter';

/**
 * Product analytics from the apps: PostHog Cloud (EU), over its plain /batch endpoint, so the same
 * code runs on iOS, Android, the web and the desktop with no native SDK and nothing collected that
 * isn't written here (no device ids, no autocapture, no replay, no location).
 *
 * The API sends the business events (invoice created, return filed…); the app sends only what the
 * server can't see: which screens are used, onboarding steps, the demo being opened, and crashes.
 * Every property goes through the shared catalog (`@esmart/core/analytics/events`).
 *
 *   EXPO_PUBLIC_POSTHOG_KEY    the project's phc_ key. Unset: nothing is sent.
 *   EXPO_PUBLIC_POSTHOG_HOST   defaults to https://eu.i.posthog.com
 */

declare const process: { env: Record<string, string | undefined> };

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim() ?? '';
const HOST = (process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || 'https://eu.i.posthog.com').replace(/\/+$/, '');

type Queued = { event: string; distinct_id: string; properties: Record<string, unknown>; timestamp: string };

const state = {
  /** The signed-in person; null before sign-in and for the demo. */
  userId: null as string | null,
  companyId: '' as string,
  /** "Share usage data" is off: nothing about them is sent. */
  optedOut: false,
  queue: [] as Queued[],
  timer: null as ReturnType<typeof setTimeout> | null,
  installed: false,
};

const randomId = () => `anon_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

function base(): Record<string, unknown> {
  const v = appVersion();
  return {
    platform: Platform.OS === 'web' ? 'web' : Platform.OS,
    appVersion: v.version || undefined,
    build: v.build ?? undefined,
    source: 'app',
  };
}

/** Properties PostHog itself reads: never a location, and the person's business as the group. */
function system(identified: boolean): Record<string, unknown> {
  return {
    $lib: 'esmart-app',
    $geoip_disable: true,
    ...(identified ? {} : { $process_person_profile: false }),
    ...(identified && state.companyId ? { $groups: { company: state.companyId } } : {}),
  };
}

function enqueue(event: string, distinctId: string, properties: Record<string, unknown>) {
  if (!KEY) return;
  state.queue.push({ event, distinct_id: distinctId, properties, timestamp: new Date().toISOString() });
  if (state.queue.length >= 20) void flush();
  else state.timer ??= setTimeout(() => void flush(), 10_000);
}

/** Sends what is queued. Lost events are dropped, never retried into a growing pile. */
export async function flush(opts: { keepalive?: boolean } = {}) {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  if (!KEY || !state.queue.length) return;
  const batch = state.queue.splice(0, state.queue.length);
  try {
    await fetch(`${HOST}/batch/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: KEY, batch }),
      ...(opts.keepalive ? { keepalive: true } : {}),
    });
  } catch {
    // Analytics never bothers the person.
  }
}

/** One event about the signed-in person (nothing for the demo, or once they opted out). */
export function track<E extends AnalyticsEvent>(event: E, props: AnalyticsProps<E> = {}) {
  if (!state.userId || state.optedOut) return;
  enqueue(event, state.userId, { ...sanitize(event, { ...base(), ...props }), ...system(true) });
}

/** The demo being opened: anonymous, with no person profile, as nobody has signed in. */
export function trackAnonymous<E extends AnalyticsEvent>(event: E, props: AnalyticsProps<E> = {}) {
  enqueue(event, randomId(), { ...sanitize(event, { ...base(), ...props }), ...system(false) });
}

/** A screen by its route pattern (`/documents/[id]`), never a real id. */
export function screen(pattern: string) {
  if (!state.userId || state.optedOut || !/^[A-Za-z0-9_\-/[\]().]{1,120}$/.test(pattern)) return;
  enqueue('$screen', state.userId, { $screen_name: pattern, ...sanitizeCommon(base()), ...system(true) });
}

/**
 * Who is signed in, from /me. The demo and anyone with "Share usage data" off are never identified,
 * so nothing after this is sent for them.
 */
export function identify(user: { id: string; demo?: boolean; shareUsageData?: boolean }) {
  if (user.demo || user.shareUsageData === false) {
    state.userId = null;
    state.optedOut = true;
    state.queue.length = 0;
    return;
  }
  state.optedOut = false;
  state.userId = user.id;
}

/** The business now open; later events are grouped under it. */
export function setCompany(companyId: string) {
  state.companyId = companyId;
}

/** "Share usage data" switched in Settings. */
export function setOptedOut(optedOut: boolean, userId?: string) {
  state.optedOut = optedOut;
  if (optedOut) state.queue.length = 0;
  else if (userId) state.userId = userId;
}

/** Signed out: forget who it was. */
export function reset() {
  void flush();
  state.userId = null;
  state.companyId = '';
  state.optedOut = false;
}

function exceptionProps(err: unknown, ctx: { source?: string; fatal?: boolean }) {
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Unknown error');
  return {
    $exception_list: [{ type: e.name || 'Error', value: e.message.slice(0, 500), mechanism: { handled: !ctx.fatal, type: ctx.source ?? 'app' }, stacktrace: { type: 'raw', frames: [] } }],
    $exception_source: ctx.source ?? 'app',
    $exception_stack_trace_raw: e.stack?.slice(0, 4000),
  };
}

/** Once, at launch: crashes go to PostHog error tracking too, and queued events go out as the app is left. */
export function installAnalytics() {
  if (state.installed || !KEY) return;
  state.installed = true;
  setErrorReporter((err, ctx) => {
    const identified = !!state.userId && !state.optedOut;
    if (!identified && state.optedOut) return;
    enqueue('$exception', identified ? state.userId! : randomId(), { ...exceptionProps(err, ctx), ...sanitizeCommon(base()), ...system(identified) });
    if (ctx.fatal) void flush({ keepalive: true });
  });
  AppState.addEventListener('change', (s) => {
    if (s !== 'active') void flush({ keepalive: true });
  });
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush({ keepalive: true });
    });
  }
}
