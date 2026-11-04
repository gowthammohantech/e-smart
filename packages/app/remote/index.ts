/**
 * The app as a client of the API: server-driven while online, offline-first
 * only once the person agrees to it (connectivity.ts). See install.ts for how
 * store actions become mutations, and sync.ts for the engine that sends them.
 */
export { API_BASE_URL, API_CONFIGURED, DEMO_LOGIN } from './config';
export { installRemote } from './install';
export { useRemoteSync } from './useRemoteSync';
export { useRemoteMeta } from './meta';
export { onRefusedLater, syncNow } from './sync';
export { acceptOffline, askToWorkOffline, declineOffline, useCanWrite, useConnectivity, type Mode } from './connectivity';
export { onUnconfirmed, saveOnline, useSaveOnline, type SaveResult } from './save';
export { retrySync, retryFailed, syncAll } from './retry';
export * as remoteSession from './session';
export * as compliance from './compliance';
export * as remoteUsers from './users';
