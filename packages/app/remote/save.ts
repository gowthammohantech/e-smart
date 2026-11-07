import { useCallback, useRef, useState } from 'react';
import { useAppStore, type AppState } from '../store/appStore';
import { COLLECTIONS } from './collections';
import { canWrite } from './connectivity';
import { resolveId, useRemoteMeta } from './meta';
import * as outbox from './outbox';
import { sendEntries } from './send';

export type SaveResult<T> = {
  result: T;
  /**
   * `saved`: the server has it. `refused`: the server said no, and the change was undone.
   * `unreachable`: no connection, so nothing was kept (undone, or not run at all).
   */
  outcome: 'saved' | 'refused' | 'unreachable';
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
 * Sends what an action queued straight to the server and waits for its answer. A change counts only
 * once the server has it: one it refuses, or that can't reach it, is undone here and nothing is kept.
 */
export async function confirm<T>(result: T, before: AppState, after: AppState, fresh: outbox.Entry[]): Promise<SaveResult<T>> {
  const localId = typeof result === 'string' && result ? result : undefined;
  if (!fresh.length) return { result, outcome: 'saved', id: localId };

  const answers = await sendEntries(fresh.map((e) => e.id));
  const outcomes = [...answers.entries()];
  const failing = outcomes.filter(([, o]) => o.kind !== 'applied');
  if (failing.length) {
    const ids = new Set(failing.map(([id]) => fresh.find((e) => e.id === id)!.entityId));
    // A conflict already brought in the server's copy; only a refusal, or no answer, leaves our change to undo.
    const undo = failing.filter(([, o]) => o.kind !== 'conflict');
    if (undo.length) rollback(before, after, failing.length === outcomes.length ? undefined : ids);
    outbox.dropAll(failing.map(([id]) => id));
    const refused = failing.find(([, o]) => o.kind === 'rejected' || o.kind === 'conflict');
    if (refused) {
      const first = refused[1] as { error: string; code?: string };
      return { result, outcome: 'refused', error: first.error, ...(first.code && { errorCode: first.code }), id: localId };
    }
    return { result, outcome: 'unreachable', id: localId };
  }
  const id = localId && resolveId(localId, useRemoteMeta.getState().idAliases);
  return { result, outcome: 'saved', id };
}

/**
 * Runs a store action and waits for the server's answer before returning: the
 * user sees its number, totals and refusals at once. With no connection the
 * action doesn't run.
 */
export async function saveOnline<T>(run: () => T): Promise<SaveResult<T>> {
  if (!canWrite()) return { result: undefined as T, outcome: 'unreachable' };
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
  return confirm(result, before, after, fresh);
}

/**
 * `saveOnline` for a screen: `saving` while it waits, so the button can show it.
 *
 * One save at a time: a call while another is running resolves with `null`
 * and does nothing, so a double tap (which can land before the re-render
 * that disables the button) can't create the record twice. With `hold`, a
 * save the server took keeps the lock until the screen goes away: a form
 * that navigates off after creating something stays shut while it leaves.
 */
export function useSaveOnline() {
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const save = useCallback(async <T>(run: () => T, opts?: { hold?: boolean }): Promise<SaveResult<T> | null> => {
    if (lock.current) return null;
    lock.current = true;
    setSaving(true);
    let keep = false;
    try {
      const res = await saveOnline(run);
      keep = !!opts?.hold && res.outcome === 'saved';
      return res;
    } finally {
      if (!keep) {
        lock.current = false;
        setSaving(false);
      }
    }
  }, []);
  /** Lets a held save go: the screen stayed after all. */
  const release = useCallback(() => {
    lock.current = false;
    setSaving(false);
  }, []);
  return { save, saving, release };
}
