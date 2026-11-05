import { createBookStorage, memoryBackend, type LegacyStorage } from '../bookStorage';

type Book = { parties: { id: string }[]; documents: { id: string }[]; syncQueue: { id: string }[] };

function legacyStore(seed: Record<string, string> = {}): LegacyStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    async getItem(k) {
      return data.get(k) ?? null;
    },
    async setItem(k, v) {
      data.set(k, v);
    },
    async removeItem(k) {
      data.delete(k);
    },
  };
}

const book: Book = { parties: [{ id: 'p1' }], documents: [{ id: 'd1' }], syncQueue: [{ id: 'q1' }] };

describe('book storage', () => {
  it('writes only the collections that changed', async () => {
    const backend = memoryBackend();
    const storage = createBookStorage<Book>({ backend: () => backend, legacy: legacyStore(), legacyKey: 'old', onError: jest.fn() });
    await storage.setItem('book', { state: book, version: 5 });
    expect(Object.keys(backend.writes[0]).sort()).toEqual(['__version', 'documents', 'parties', 'syncQueue']);

    const next = { ...book, parties: [...book.parties, { id: 'p2' }] };
    await storage.setItem('book', { state: next, version: 5 });
    expect(Object.keys(backend.writes[1])).toEqual(['parties']);
    // Nothing changed: no write at all.
    await storage.setItem('book', { state: next, version: 5 });
    expect(backend.writes).toHaveLength(2);
    expect(await storage.getItem('book')).toEqual({ state: next, version: 5 });
  });

  it('moves the old single-entry book over once, and removes it only after checking', async () => {
    const legacy = legacyStore({ old: JSON.stringify({ state: book, version: 5 }) });
    const backend = memoryBackend();
    const storage = createBookStorage<Book>({ backend: () => backend, legacy, legacyKey: 'old', onError: jest.fn() });
    expect(await storage.getItem('book')).toEqual({ state: book, version: 5 });
    expect(legacy.data.has('old')).toBe(false);
    expect(JSON.parse(backend.rows.get('syncQueue')!)).toEqual([{ id: 'q1' }]);
  });

  it('keeps the old book, and uses it this run, when the move fails', async () => {
    const legacy = legacyStore({ old: JSON.stringify({ state: book, version: 5 }) });
    const broken = { ...memoryBackend(), write: jest.fn(async () => Promise.reject(new Error('disk full'))) };
    const onError = jest.fn();
    const storage = createBookStorage<Book>({ backend: () => broken, legacy, legacyKey: 'old', onError });
    expect(await storage.getItem('book')).toEqual({ state: book, version: 5 });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'migrate');
    expect(legacy.data.has('old')).toBe(true);
    // Saves go to the old entry, so nothing is lost.
    await storage.setItem('book', { state: { ...book, syncQueue: [] }, version: 5 });
    expect(JSON.parse(legacy.data.get('old')!).state.syncQueue).toEqual([]);
  });

  it('after a failed write, writes everything again on the next save', async () => {
    const backend = memoryBackend();
    const failing = { ...backend, write: jest.fn().mockRejectedValueOnce(new Error('quota')).mockImplementation(backend.write) };
    const onError = jest.fn();
    const storage = createBookStorage<Book>({ backend: () => failing, legacy: legacyStore(), legacyKey: 'old', onError });
    await storage.setItem('book', { state: book, version: 5 });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'write');
    await storage.setItem('book', { state: book, version: 5 });
    expect([...backend.rows.keys()].sort()).toEqual(['__version', 'documents', 'parties', 'syncQueue']);
  });
});

describe('book storage and the store itself', () => {
  it('saves data, never the actions beside it, and loads past a row that won’t parse', async () => {
    const backend = memoryBackend();
    const storage = createBookStorage<Record<string, unknown>>({ backend: () => backend, legacy: legacyStore(), legacyKey: 'old', onError: jest.fn() });
    await storage.setItem('book', { state: { parties: [{ id: 'p1' }], saveParty: () => {}, nothing: undefined }, version: 5 });
    expect([...backend.rows.keys()].sort()).toEqual(['__version', 'parties']);

    backend.rows.set('broken', '{not json');
    expect(await storage.getItem('book')).toEqual({ state: { parties: [{ id: 'p1' }] }, version: 5 });
    await new Promise((r) => setTimeout(r, 0));
    expect(backend.rows.has('broken')).toBe(false);
  });
});
