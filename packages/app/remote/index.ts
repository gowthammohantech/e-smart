/**
 * Remote mode: the app as an offline-first client of the API. See
 * install.ts for how store actions become queued mutations, and sync.ts for
 * the engine that sends them.
 */
export { API_BASE_URL, DATA_SOURCE, isRemote } from './config';
export { installRemote } from './install';
export { useRemoteSync } from './useRemoteSync';
export { useRemoteMeta } from './meta';
export { syncNow } from './sync';
export * as remoteSession from './session';
export * as compliance from './compliance';
