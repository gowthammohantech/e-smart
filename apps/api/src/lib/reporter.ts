import type { FastifyBaseLogger } from 'fastify';

/** What is known about where an error happened. */
export type ErrorContext = { requestId?: string; userId?: string; companyId?: string; route?: string; fatal?: boolean };

type Reporter = (err: unknown, ctx: ErrorContext) => void;

let send: Reporter | null = null;

/**
 * Where crashes and 500s go besides the log. Nothing is plugged in yet: an error-tracking service
 * registers itself here at startup (`setErrorReporter`) and every caller below reaches it.
 */
export function setErrorReporter(reporter: Reporter | null) {
  send = reporter;
}

/** Logs the error and hands it to the error-tracking service, if one is set. Never throws. */
export function reportError(log: Pick<FastifyBaseLogger, 'error' | 'fatal'>, err: unknown, ctx: ErrorContext = {}) {
  (ctx.fatal ? log.fatal : log.error).call(log, { err, ...ctx }, ctx.fatal ? 'fatal error' : 'unhandled error');
  try {
    send?.(err, ctx);
  } catch {
    // A broken reporter must not take the request or the process down with it.
  }
}
