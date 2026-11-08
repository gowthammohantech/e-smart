import type { KvBackend } from './bookStorage';

const DB_NAME = 'ebs-book';
const STORE = 'book';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/**
 * The book in IndexedDB, one record per collection: far more room than localStorage's 5 MB, and a
 * save writes only what changed. Not encrypted: a browser can't keep a key away from the page itself.
 */
export function bookBackend(): KvBackend {
  let ready: Promise<IDBDatabase> | null = null;
  const openAt = (version?: number) =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, version);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE);
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  // A database of that name without the store (made by something else, or an interrupted first open)
  // gets it by moving the version on.
  const db = () =>
    (ready ??= openAt().then((d) => {
      if (d.objectStoreNames.contains(STORE)) return d;
      const next = d.version + 1;
      d.close();
      return openAt(next);
    }));
  return {
    async readAll() {
      const store = (await db()).transaction(STORE, 'readonly').objectStore(STORE);
      const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
      return Object.fromEntries(keys.map((k, i) => [String(k), values[i] as string]));
    },
    async write(rows, removed) {
      const tx = (await db()).transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const [key, value] of Object.entries(rows)) store.put(value, key);
      for (const key of removed) store.delete(key);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        // QuotaExceededError lands here: the caller reports it and keeps the change in memory.
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('The browser refused to save'));
      });
    },
    async clear() {
      await request((await db()).transaction(STORE, 'readwrite').objectStore(STORE).clear());
    },
  };
}

/** Removes the book, and the files kept beside it, for good. */
export async function destroyBook(): Promise<void> {
  for (const name of [DB_NAME, 'ebs.files']) globalThis.indexedDB?.deleteDatabase(name);
}

/** Whether this browser ever made a book. One that can't list its databases is looked in. */
export async function hasBook(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  const list = (indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> }).databases;
  if (!list) return true;
  return (await list.call(indexedDB).catch(() => [])).some((d) => d.name === DB_NAME);
}
