import { create } from 'zustand';
import { useAppStore } from '../store/appStore';
import { useRemoteMeta } from './meta';
import * as outbox from './outbox';

/**
 * Whether the app works against the server or on this device.
 *
 * - `online`: the server is the authority. A save counts once it has answered; nothing waits in the outbox.
 * - `readonly`: the connection is gone and the person hasn't agreed to work offline. Nothing can be changed.
 * - `offline`: they agreed. Changes are kept here and queued, as the offline-first client always did.
 * - `draining`: the connection has been back long enough; what was queued is being sent before going `online`.
 *
 * Kept in memory only: each launch, and each lost connection, asks again.
 */
export type Mode = 'online' | 'readonly' | 'offline' | 'draining';

/** Without a connection this long, the person is asked whether to work offline. */
export const PROMPT_AFTER_MS = 10_000;
/** With the connection back this long, what was queued offline is sent and the app goes online. */
export const STABLE_FOR_MS = 15_000;

type Connectivity = { mode: Mode; promptOpen: boolean };

export const useConnectivity = create<Connectivity>()(() => ({ mode: 'online', promptOpen: false }));

/** Saves are allowed: confirmed by the server, or kept here because the person said so. */
export const canWrite = (mode: Mode = useConnectivity.getState().mode) => mode !== 'readonly';
export const useCanWrite = () => useConnectivity((s) => canWrite(s.mode));

/**
 * Something still to send. One held back by a failed change can't go until the
 * person sorts that out, and one the server asked to have sent again later goes
 * out with every sync, so neither holds the app back from being online.
 */
const hasPending = () => {
  const all = outbox.entries();
  return all.some((e) => e.status === 'pending' && !e.attempts && !outbox.blockerOf(e, all));
};
const set = (p: Partial<Connectivity>) => useConnectivity.setState(p);

let promptTimer: ReturnType<typeof setTimeout> | null = null;
let stableTimer: ReturnType<typeof setTimeout> | null = null;
function clearTimers() {
  if (promptTimer) clearTimeout(promptTimer);
  if (stableTimer) clearTimeout(stableTimer);
  promptTimer = stableTimer = null;
}

/** Sends the outbox; set by `startConnectivity`, so this file doesn't import the sync engine. */
let drain: () => Promise<void> = async () => {};

function lost() {
  const { mode } = useConnectivity.getState();
  if (stableTimer) clearTimeout(stableTimer);
  stableTimer = null;
  if (mode === 'draining') return set({ mode: 'offline' });
  if (mode !== 'online') return;
  set({ mode: 'readonly' });
  promptTimer = setTimeout(() => {
    promptTimer = null;
    if (useConnectivity.getState().mode === 'readonly') set({ promptOpen: true });
  }, PROMPT_AFTER_MS);
}

function back() {
  const { mode } = useConnectivity.getState();
  if (mode === 'readonly') {
    clearTimers();
    return set({ mode: 'online', promptOpen: false });
  }
  if (mode !== 'offline' || stableTimer) return;
  stableTimer = setTimeout(() => {
    stableTimer = null;
    if (useConnectivity.getState().mode !== 'offline') return;
    set({ mode: 'draining' });
    void drain().finally(settleDrain);
  }, STABLE_FOR_MS);
}

/** Online once nothing is left to send. Failed and conflicted changes stay in Settings → Sync and don't hold it back. */
function settleDrain() {
  if (useConnectivity.getState().mode === 'draining' && !hasPending() && useRemoteMeta.getState().online) set({ mode: 'online' });
}

/** The person agreed to keep working on this device. */
export function acceptOffline() {
  if (promptTimer) clearTimeout(promptTimer);
  promptTimer = null;
  set({ mode: 'offline', promptOpen: false });
  // The connection may have come back while the question was open.
  if (useRemoteMeta.getState().online) back();
}

/** "Not now": the app stays view-only; the banner can ask again. */
export function declineOffline() {
  set({ promptOpen: false });
}

/** A change tried while view-only asks the question there and then. */
export function askToWorkOffline() {
  if (useConnectivity.getState().mode === 'readonly') set({ promptOpen: true });
}

let stop: (() => void) | null = null;

/**
 * Follows `useRemoteMeta.online`, which both NetInfo and the sync engine's own
 * requests keep up to date. Changes left in the outbox by an earlier run start
 * the app offline, so they go out under the same "back for 15 seconds" rule.
 */
export function startConnectivity(opts: { drain: () => Promise<void> }) {
  stopConnectivity();
  drain = opts.drain;
  const online = useRemoteMeta.getState().online;
  if (hasPending()) {
    set({ mode: 'offline', promptOpen: false });
    if (online) back();
  } else {
    set({ mode: 'online', promptOpen: false });
    if (!online) lost();
  }
  const offMeta = useRemoteMeta.subscribe((s, prev) => {
    if (s.online === prev.online) return;
    if (s.online) back();
    else lost();
  });
  const offQueue = useAppStore.subscribe((s, prev) => {
    if (s.syncQueue !== prev.syncQueue) settleDrain();
  });
  stop = () => {
    offMeta();
    offQueue();
  };
}

export function stopConnectivity() {
  stop?.();
  stop = null;
  clearTimers();
}
