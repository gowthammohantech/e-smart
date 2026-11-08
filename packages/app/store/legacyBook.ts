import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SyncQueueEntry } from '@esmart/core/types';
import { bookBackend, destroyBook, hasBook } from './bookBackend';

/**
 * Offline-first builds kept the whole book on the device: SQLite (encrypted) on a phone, IndexedDB in
 * a browser, and before that one AsyncStorage entry. The app keeps nothing there any more. On the
 * first launch after the update this reads what is useful from it once — changes never sent, and
 * which business was open — and then removes all of it.
 *
 * Kept for one release only, with expo-sqlite; it goes when the server stops taking old builds.
 */
const LEGACY_KEY = 'ebs.remote.v1';
/** Everything else the old builds kept for the book, beside it. */
const OTHER_KEYS = ['ebs.remote.meta.v1', 'ebs.logo.queue.v1', 'ebs.receipt.queue.v1', 'ebs.data.v1'];

export type LegacyBook = { syncQueue: SyncQueueEntry[]; activeCompanyId?: string; activeBranchId?: string; userId?: string | null };

const parse = (json: string | undefined | null): unknown => {
  if (!json) return undefined;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
};

/** Whether this device ever held a book: no point opening a database just to find it empty. */
async function mayHaveBook(): Promise<boolean> {
  if (await AsyncStorage.getItem(LEGACY_KEY).catch(() => null)) return true;
  return hasBook();
}

async function read(): Promise<Record<string, unknown>> {
  const single = parse(await AsyncStorage.getItem(LEGACY_KEY).catch(() => null)) as { state?: Record<string, unknown> } | undefined;
  if (single?.state) return single.state;
  const rows = await bookBackend().readAll();
  return Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, parse(v)]));
}

async function wipe() {
  await bookBackend()
    .clear()
    .catch(() => undefined);
  await Promise.all([LEGACY_KEY, ...OTHER_KEYS].map((k) => AsyncStorage.removeItem(k).catch(() => undefined)));
  const keys = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
  await Promise.all(keys.filter((k) => k.startsWith('ebs.unsynced.')).map((k) => AsyncStorage.removeItem(k).catch(() => undefined)));
  await destroyBook();
}

/** Reads the old book once and removes it. Null when there was none, or it couldn't be read. */
export async function takeLegacyBook(): Promise<LegacyBook | null> {
  try {
    if (!(await mayHaveBook())) return null;
    const state = await read();
    const session = state.session as { userId?: string | null } | undefined;
    const queue = Array.isArray(state.syncQueue) ? (state.syncQueue as SyncQueueEntry[]) : [];
    await wipe();
    return {
      syncQueue: queue.filter((e) => e.status !== 'synced' && e.method && e.path),
      activeCompanyId: typeof state.activeCompanyId === 'string' ? state.activeCompanyId : undefined,
      activeBranchId: typeof state.activeBranchId === 'string' ? state.activeBranchId : undefined,
      userId: session?.userId ?? null,
    };
  } catch {
    await wipe().catch(() => undefined);
    return null;
  }
}
