/**
 * The app as a client of the API. Every save goes straight to the server (send.ts); the store holds
 * the books in memory only, loaded at sign-in and kept current by refresh.ts.
 */
export { API_BASE_URL, API_CONFIGURED, DEMO_LOGIN } from './config';
export { installRemote } from './install';
export { useRemoteSync } from './useRemoteSync';
export { useRemoteMeta } from './meta';
export { useLatency, summarise, latencyTone, type LatencySummary } from './latency';
export { refreshNow } from './refresh';
export { useCanWrite } from './connectivity';
export { onUnconfirmed, saveOnline, useSaveOnline, type SaveResult } from './save';
export * as remoteSession from './session';
export * as compliance from './compliance';
export * as remoteUsers from './users';
