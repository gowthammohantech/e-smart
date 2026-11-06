import { Platform } from 'react-native';

/**
 * A picked file waiting to upload, kept where a reload can't take it. The web
 * image picker hands back a `blob:` link that lives only as long as the page,
 * and the upload queues persist to localStorage, which the whole book shares
 * and a photo would fill. So in a browser the file goes into IndexedDB and the
 * queue holds `kept:<id>`. A phone's file uri already outlives the app, so it
 * is kept as it is.
 */
const PREFIX = 'kept:';
const DB = 'ebs.files';
const STORE = 'files';

const web = () => Platform.OS === 'web' && typeof indexedDB !== 'undefined';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = act(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Stores a browser's `blob:` file and returns the uri to queue; anything else comes back unchanged. */
export async function keepFile(uri: string): Promise<string> {
  if (!web() || !uri.startsWith('blob:')) return uri;
  try {
    const blob = await (await fetch(uri)).blob();
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await run('readwrite', (s) => s.put(blob, id));
    return PREFIX + id;
  } catch {
    // No IndexedDB (a private window, say): the page's link is all there is.
    return uri;
  }
}

/** The file's bytes, from IndexedDB or the uri itself. Throws when it is gone. */
export async function fileBlob(uri: string): Promise<Blob> {
  if (!uri.startsWith(PREFIX)) return (await fetch(uri)).blob();
  const blob = await run<Blob | undefined>('readonly', (s) => s.get(uri.slice(PREFIX.length)) as IDBRequest<Blob | undefined>);
  if (!blob) throw new Error('The kept file is gone');
  return blob;
}

/** Drops a kept file once it has uploaded or been given up on. */
export async function forgetFile(uri: string | undefined): Promise<void> {
  if (!uri?.startsWith(PREFIX) || !web()) return;
  await run('readwrite', (s) => s.delete(uri.slice(PREFIX.length))).catch(() => undefined);
}

/**
 * Keeps a just-queued file and points the queue at the kept copy. The queue is
 * written first, with the page's link, so a sync straight away still finds it;
 * `swap` returns false when the entry has already gone (uploaded meanwhile),
 * and the kept copy is dropped.
 */
export function keepQueued(uri: string, swap: (from: string, to: string) => boolean) {
  void keepFile(uri).then((kept) => {
    if (kept !== uri && !swap(uri, kept)) void forgetFile(kept);
  });
}
