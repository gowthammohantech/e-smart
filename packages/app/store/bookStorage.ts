/**
 * Where offline-first builds kept the book, one row per collection. Phones: SQLite, encrypted
 * (bookBackend.native.ts). Browsers: IndexedDB (bookBackend.web.ts). Tests: memory. Read once and
 * removed by legacyBook.ts; goes with it.
 */
export type KvBackend = {
  readAll(): Promise<Record<string, string>>;
  /** One transaction: these rows written, those removed. */
  write(rows: Record<string, string>, removed: string[]): Promise<void>;
  clear(): Promise<void>;
};

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
