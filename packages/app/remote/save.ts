import { useCallback, useState } from 'react';
import { useAppStore, type AppState } from '../store/appStore';
import { COLLECTIONS } from './collections';
import { askToWorkOffline, canWrite, useConnectivity } from './connectivity';
import { resolveId, useRemoteMeta } from './meta';
import * as outbox from './outbox';
import { syncSoon, waitForOutcome, type Outcome } from './sync';

/** How long a save waits for the server's first answer. */
export const ONLINE_WAIT_MS = 8_000;
/** A change sent but not answered is asked about again this many times, this far apart. */
const RECHECKS = 2;
const RECHECK_GAP_MS = 1_000;

export type SaveResult<T> = {
  result: T;
  /**
   * `saved`: the server has it. `queued`: kept on this device (offline mode), sent when it can be.
   * `refused`: the server said no, and the change was undone. `unreachable`: no connection, so
   * nothing was kept (undone, or not run at all while view-only). `unconfirmed`: sent, but no
   * answer even after asking again; undone here, and back with the next pull if the server has it.
   */
  outcome: 'saved' | 'queued' | 'refused' | 'unreachable' | 'unconfirmed';
  error?: string;
  /** The server's code for a refusal, e.g. PAYMENT_HELD. */
  errorCode?: string;
  /** The id the server gave something created here; else what the action returned. */
  id?: string;
};

type Row = Record<string, unknown>;

/**
 * Undoes what an action did to the store: every row it added, changed or
 * removed goes back to how it was. Rows are replaced, never mutated, so a
 * changed row is one that is no longer the same object.
 */
function rollback(before: AppState, after: AppState, onlyIds?: Set<string>) {
  const now = useAppStore.getState();
  const next: Row = {};
  // Stock movements aren't synced entities, but an adjustment writes one here.
  const sets = [...new Set(Object.values(COLLECTIONS)), { collection: 'stockMovements' as const, key: 'id' as const }];
  for (const { collection, key } of sets) {
    const was = before[collection] as unknown as Row[];
    const did = after[collection] as unknown as Row[];
    if (was === did) continue;
    const wasByKey = new Map(was.map((r) => [r[key] as string, r]));
    const didByKey = new Map(did.map((r) => [r[key] as string, r]));
    const touched = new Set<string>();
    for (const [k, r] of didByKey) if (wasByKey.get(k) !== r) touched.add(k);
    for (const k of wasByKey.keys()) if (!didByKey.has(k)) touched.add(k);
    const undo = [...touched].filter((k) => !onlyIds || onlyIds.has(k));
    if (!undo.length) continue;
    // In place, so lists keep their order.
    const current = now[collection] as unknown as Row[];
    const list = current.flatMap((r) => {
      const k = r[key] as string;
      if (!undo.includes(k)) return [r];
      return wasByKey.has(k) ? [wasByKey.get(k)!] : [];
    });
    for (const k of undo) if (wasByKey.has(k) && !current.some((r) => r[key] === k)) list.push(wasByKey.get(k)!);
    next[collection] = list;
  }
  if (Object.keys(next).length) useAppStore.setState(next as never);
}

/** Told when a change made outside `saveOnline` was refused or couldn't reach the server, and was undone. */
export const onUnconfirmed = new Set<(r: SaveResult<unknown>) => void>();

let inSave = 0;
/** A `saveOnline` is running its action: the store wrapper leaves the waiting to it. */
export const savingOnline = () => inSave > 0;

/**
 * Waits for the server's answer to what an action queued. Online, a change
 * counts only once the server has it: one it refuses, or that gets no answer
 * in time, is undone and dropped from the outbox. Offline (the person agreed
 * to it), the change stays on the device and the sync engine sends it later.
 */
export async function confirm<T>(result: T, before: AppState, after: AppState, fresh: outbox.Entry[], waitMs = ONLINE_WAIT_MS): Promise<SaveResult<T>> {
  const localId = typeof result === 'string' && result ? result : undefined;
  if (!fresh.length) return { result, outcome: 'saved', id: localId };
  if (useConnectivity.getState().mode !== 'online') return { result, outcome: 'queued', id: localId };

  const all = fresh.map((e) => e.id);
  const answers = new Map<string, Outcome>();
  const keepQueued = () => ['offline', 'draining'].includes(useConnectivity.getState().mode);
  // Sent but unanswered: the server may have it. It keeps its answer per change id, so asking
  // again under the same id finds out without any risk of saving it twice.
  const sentUnanswered = () => all.filter((id) => answers.get(id)?.kind === 'queued' && outbox.entries().some((e) => e.id === id && e.sentAt));
  let ask = all;
  for (let round = 0; ; round++) {
    const done = waitForOutcome(ask, round === 0 ? waitMs : RECHECK_GAP_MS + waitMs / 2);
    syncSoon(round === 0 ? 0 : RECHECK_GAP_MS);
    for (const [id, o] of await done) answers.set(id, o);
    ask = sentUnanswered();
    if (!ask.length || round >= RECHECKS || keepQueued()) break;
  }
  const unconfirmed = new Set(sentUnanswered());
  const outcomes = [...answers.entries()];

  const refused = outcomes.filter(([, o]) => o.kind === 'rejected' || o.kind === 'conflict');
  // Gone offline while it waited, and the person chose to keep working: it stays queued.
  const unanswered = keepQueued() ? [] : outcomes.filter(([, o]) => o.kind === 'queued');
  const failing = [...refused, ...unanswered];
  if (failing.length) {
    const ids = new Set(failing.map(([id]) => fresh.find((e) => e.id === id)!.entityId));
    // A conflict already brought in the server's copy; only a refusal, or no answer, leaves our change to undo.
    const undo = failing.filter(([, o]) => o.kind !== 'conflict');
    if (undo.length) rollback(before, after, failing.length === outcomes.length ? undefined : ids);
    outbox.dropAll(failing.map(([id]) => id));
    if (refused.length) {
      const first = refused[0][1] as { error: string; code?: string };
      return { result, outcome: 'refused', error: first.error, ...(first.code && { errorCode: first.code }), id: localId };
    }
    // Sent and never answered: it may yet show up from the server, so don't say it wasn't saved.
    const maybe = unanswered.some(([id]) => unconfirmed.has(id));
    return { result, outcome: maybe ? 'unconfirmed' : 'unreachable', id: localId };
  }
  const id = localId && resolveId(localId, useRemoteMeta.getState().idAliases);
  return { result, outcome: outcomes.every(([, o]) => o.kind === 'applied') ? 'saved' : 'queued', id };
}

/**
 * Runs a store action and waits for the server's answer before returning: the
 * user sees its number, totals and refusals at once. View-only (no connection,
 * offline not agreed to) the action doesn't run, and the person is asked.
 */
export async function saveOnline<T>(run: () => T, opts: { waitMs?: number } = {}): Promise<SaveResult<T>> {
  if (!canWrite()) {
    askToWorkOffline();
    return { result: undefined as T, outcome: 'unreachable' };
  }
  const known = new Set(useAppStore.getState().syncQueue.map((e) => e.id));
  const before = useAppStore.getState();
  let result: T;
  inSave++;
  try {
    result = run();
  } finally {
    inSave--;
  }
  const after = useAppStore.getState();
  const fresh = outbox.entries().filter((e) => !known.has(e.id));
  return confirm(result, before, after, fresh, opts.waitMs);
}

/** `saveOnline` for a screen: `saving` while it waits, so the button can show it. */
export function useSaveOnline() {
  const [saving, setSaving] = useState(false);
  const save = useCallback(async <T>(run: () => T, opts?: { waitMs?: number }) => {
    setSaving(true);
    try {
      return await saveOnline(run, opts);
    } finally {
      setSaving(false);
    }
  }, []);
  return { save, saving };
}
