import type { FastifyInstance } from 'fastify';
import { ApiError } from './errors';

/** The header the native apps send with their version, e.g. `1.0.5`. */
export const APP_VERSION_HEADER = 'x-app-version';

/** `1.0.5` → [1, 0, 5]; anything that isn't a dotted number sorts as 0. */
function parts(v: string): number[] {
  return v.split('.').map((p) => Number.parseInt(p, 10) || 0);
}

/** Negative when `a` is older than `b`. */
export function compareVersions(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Refuses apps older than MIN_APP_VERSION with 426 APP_UPDATE_REQUIRED, so a phone still running the
 * offline-first build can't keep writing through an API that no longer works the way it expects.
 * Requests without the header (the web app, scripts, webhooks) pass, and so does `/sync/push` while it
 * still exists, so an old build can send what it kept on the phone before the person updates.
 */
export function registerAppVersionGate(app: FastifyInstance, minVersion: string | undefined) {
  if (!minVersion) return;
  app.addHook('onRequest', async (req) => {
    const raw = req.headers[APP_VERSION_HEADER];
    const version = Array.isArray(raw) ? raw[0] : raw;
    if (!version) return;
    if (req.url.startsWith('/v1/sync/push')) return;
    if (compareVersions(version, minVersion) >= 0) return;
    throw new ApiError(426, 'APP_UPDATE_REQUIRED', `This version of the app (${version}) is no longer supported. Update to ${minVersion} or later.`, {
      minVersion,
    });
  });
}
