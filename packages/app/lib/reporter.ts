import { Platform } from 'react-native';

/** What is known about where an error happened. */
export type ErrorContext = { source?: string; fatal?: boolean; [key: string]: unknown };

type Reporter = (err: unknown, ctx: ErrorContext) => void;

let send: Reporter | null = null;

/**
 * Where crashes go besides the console. Nothing is plugged in yet: an error-tracking service registers
 * itself here at startup and every caller below reaches it. The API has the same seam (apps/api/src/lib/reporter.ts).
 */
export function setErrorReporter(reporter: Reporter | null) {
  send = reporter;
}

/** Logs the error and hands it to the error-tracking service, if one is set. Never throws. */
export function reportError(err: unknown, ctx: ErrorContext = {}) {
  console.error(`[${ctx.source ?? 'app'}]`, err);
  try {
    send?.(err, ctx);
  } catch {
    // A broken reporter must not cause the crash it was meant to record.
  }
}

let installed = false;

/** Catches what nothing else did: uncaught JS errors on the phone, and errors and rejected promises in a browser. */
export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (e) => reportError(e.error ?? e.message, { source: 'window.onerror' }));
    window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { source: 'unhandledrejection' }));
    return;
  }
  const g = globalThis as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } };
  const utils = g.ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((e, fatal) => {
    reportError(e, { source: 'global', fatal });
    previous(e, fatal);
  });
}
