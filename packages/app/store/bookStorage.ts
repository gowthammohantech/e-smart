import type { PersistStorage, StorageValue } from 'zustand/middleware';

/**
 * Where the book lives on the device, one row per collection. Phones: SQLite, encrypted
 * (bookBackend.native.ts). Browsers: IndexedDB (bookBackend.web.ts). Tests: memory.
 */
export type KvBackend = {
  readAll(): Promise<Record<string, string>>;
  /** One transaction: these rows written, those removed. */
  write(rows: Record<string, string>, removed: string[]): Promise<void>;
  clear(): Promise<void>;
};

/** The single-entry store older builds wrote (AsyncStorage, or localStorage on the web). */
export type LegacyStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };

const VERSION_ROW = '__version';

/** The store's actions sit beside its data; only data is saved (as JSON.stringify of the whole would). */
const isData = (v: unknown) => typeof v !== 'function' && v !== undefined;

/** A row that won't parse (written by a broken build, cut short) is left out, not allowed to stop the load. */
function parseRow(json: unknown): { ok: true; value: unknown } | { ok: false } {
  if (typeof json !== 'string') return { ok: false };
  try {
    return { ok: true, value: JSON.parse(json) };
  } catch {
    return { ok: false };
  }
}

/**
 * A zustand `persist` storage that writes only the collections that changed since the last save
 * (compared by reference, as zustand keeps unchanged ones), instead of the whole book on every edit.
 *
 * On the first read after an update it moves the old single-entry book over: every collection is
 * written, read back and checked, and only then is the old entry removed. If any of that fails the
 * old entry stays, this run keeps using it, and the move is tried again next launch.
 */
export function createBookStorage<S extends object>(opts: {
  backend: () => KvBackend;
  legacy: LegacyStorage;
  legacyKey: string;
  onError: (err: unknown, during: 'read' | 'write' | 'migrate') => void;
  /** After a write: which collections changed, for other tabs. */
  onWritten?: (keys: string[]) => void;
}): PersistStorage<S> {
  let backend: KvBackend | null = null;
  const kv = () => (backend ??= opts.backend());
  /** What the last write (or read) held, per collection, by reference. */
  let last: Record<string, unknown> = {};
  let lastVersion: number | undefined;
  /** This run stays on the old storage: the move failed. */
  let legacyMode = false;
  /** Writes go one after another, so an older one never lands after a newer one. */
  let queue: Promise<void> = Promise.resolve();

  async function migrate(): Promise<StorageValue<S> | null> {
    const raw = await opts.legacy.getItem(opts.legacyKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as StorageValue<S>;
    try {
      const rows: Record<string, string> = { [VERSION_ROW]: String(value.version ?? 0) };
      for (const [key, v] of Object.entries(value.state as Record<string, unknown>)) if (isData(v)) rows[key] = JSON.stringify(v);
      await kv().write(rows, []);
      const back = await kv().readAll();
      const missing = Object.keys(rows).filter((k) => back[k] !== rows[k]);
      if (missing.length) throw new Error(`The new storage didn't keep: ${missing.join(', ')}`);
      await opts.legacy.removeItem(opts.legacyKey);
    } catch (err) {
      opts.onError(err, 'migrate');
      legacyMode = true;
    }
    last = { ...(value.state as Record<string, unknown>) };
    lastVersion = value.version;
    return value;
  }

  return {
    async getItem() {
      if (legacyMode) {
        const raw = await opts.legacy.getItem(opts.legacyKey);
        return raw ? (JSON.parse(raw) as StorageValue<S>) : null;
      }
      let rows: Record<string, string>;
      try {
        rows = await kv().readAll();
      } catch (err) {
        opts.onError(err, 'read');
        throw err;
      }
      if (!Object.keys(rows).length) return migrate();
      const state: Record<string, unknown> = {};
      const unreadable: string[] = [];
      for (const [key, json] of Object.entries(rows)) {
        if (key === VERSION_ROW) continue;
        const parsed = parseRow(json);
        if (parsed.ok) state[key] = parsed.value;
        else unreadable.push(key);
      }
      // Drop them, so the next save writes those collections afresh.
      if (unreadable.length) void kv().write({}, unreadable).catch(() => {});
      last = { ...state };
      lastVersion = rows[VERSION_ROW] === undefined ? undefined : Number(rows[VERSION_ROW]);
      return { state: state as S, version: lastVersion };
    },

    setItem(_name, value) {
      const state = Object.fromEntries(Object.entries(value.state as Record<string, unknown>).filter(([, v]) => isData(v)));
      if (legacyMode) {
        queue = queue.then(() => opts.legacy.setItem(opts.legacyKey, JSON.stringify(value))).catch((err) => opts.onError(err, 'write'));
        return queue;
      }
      const rows: Record<string, string> = {};
      for (const [key, v] of Object.entries(state)) if (last[key] !== v) rows[key] = JSON.stringify(v);
      const removed = Object.keys(last).filter((k) => !(k in state));
      if (value.version !== lastVersion) rows[VERSION_ROW] = String(value.version ?? 0);
      if (!Object.keys(rows).length && !removed.length) return;
      last = { ...state };
      lastVersion = value.version;
      const changed = [...Object.keys(rows), ...removed];
      queue = queue
        .then(() => kv().write(rows, removed))
        .then(() => opts.onWritten?.(changed))
        .catch((err) => {
          // Next save writes everything again rather than trust what may not have landed.
          last = {};
          lastVersion = undefined;
          opts.onError(err, 'write');
        });
      return queue;
    },

    async removeItem() {
      last = {};
      lastVersion = undefined;
      await kv().clear();
    },
  };
}

/** For tests, and anywhere a real backend can't open. */
export function memoryBackend(seed: Record<string, string> = {}): KvBackend & { rows: Map<string, string>; writes: Record<string, string>[] } {
  const rows = new Map(Object.entries(seed));
  const writes: Record<string, string>[] = [];
  return {
    rows,
    writes,
    async readAll() {
      return Object.fromEntries(rows);
    },
    async write(changes, removed) {
      writes.push(changes);
      for (const [k, v] of Object.entries(changes)) rows.set(k, v);
      for (const k of removed) rows.delete(k);
    },
    async clear() {
      rows.clear();
    },
  };
}
