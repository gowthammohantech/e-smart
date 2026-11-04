import { memoryBackend, type KvBackend } from './bookStorage';

/** Where neither SQLite nor IndexedDB exists (tests): the book in memory. */
export function bookBackend(): KvBackend {
  return memoryBackend();
}
