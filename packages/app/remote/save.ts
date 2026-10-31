import { useCallback, useState } from 'react';
import { useAppStore, type AppState } from '../store/appStore';
import { COLLECTIONS } from './collections';
import { resolveId, useRemoteMeta } from './meta';
import * as outbox from './outbox';
import { syncSoon, waitForOutcome } from './sync';

/** How long a save waits for the server before it counts as saved on the device. */
export const ONLINE_WAIT_MS = 8_000;

export type SaveResult<T> = {
  result: T;
  /** `saved`: the server has it. `queued`: kept on this device, sent when it can be. `refused`: the server said no, and the change was undone. */
  outcome: 'saved' | 'queued' | 'refused';
  error?: string;
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

/**
 * Runs a store action and, when online, waits for the server's answer before
 * returning: the user sees its number, totals and refusals at once. Offline, or
 * when the answer doesn't come in time, the change stays on the device and the
 * sync engine sends it later, in order behind anything already queued.
 */
export async function saveOnline<T>(run: () => T, opts: { waitMs?: number } = {}): Promise<SaveResult<T>> {
  const known = new Set(useAppStore.getState().syncQueue.map((e) => e.id));
  const before = useAppStore.getState();
  const result = run();
  const after = useAppStore.getState();
  const fresh = outbox.entries().filter((e) => !known.has(e.id));
  const localId = typeof result === 'string' && result ? result : undefined;
  if (!fresh.length) return { result, outcome: 'saved', id: localId };
  if (!useRemoteMeta.getState().online) return { result, outcome: 'queued', id: localId };

  const done = waitForOutcome(fresh.map((e) => e.id), opts.waitMs ?? ONLINE_WAIT_MS);
  syncSoon(0);
  const outcomes = [...(await done).entries()];

  const refused = outcomes.filter(([, o]) => o.kind === 'rejected' || o.kind === 'conflict');
  if (refused.length) {
    const ids = new Set(refused.map(([id]) => fresh.find((e) => e.id === id)!.entityId));
    // A conflict already brought in the server's copy; only a refusal leaves our change to undo.
    const undo = refused.filter(([, o]) => o.kind === 'rejected');
    if (undo.length) rollback(before, after, refused.length === outcomes.length ? undefined : ids);
    for (const [id] of refused) outbox.drop(id);
    const first = refused[0][1] as { error: string };
    return { result, outcome: 'refused', error: first.error, id: localId };
  }
  const id = localId && resolveId(localId, useRemoteMeta.getState().idAliases);
  return { result, outcome: outcomes.every(([, o]) => o.kind === 'applied') ? 'saved' : 'queued', id };
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
