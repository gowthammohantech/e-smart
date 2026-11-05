import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import type { KvBackend } from './bookStorage';

const DB_NAME = 'ebs-book.db';
/** The database key, in the Keychain / Keystore: only this app on this phone can read the book. */
const KEY_NAME = 'ebs.book.key';

async function databaseKey(): Promise<{ key: string; fresh: boolean }> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing) return { key: existing, fresh: false };
  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_NAME, key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  return { key, fresh: true };
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const { key, fresh } = await databaseKey();
  // A new key and a database already there: the key was lost (a restored phone, a cleared keychain),
  // so the old file can't be read. It goes; the book downloads again from the server on sync.
  if (fresh) await SQLite.deleteDatabaseAsync(DB_NAME).catch(() => {});
  let db = await SQLite.openDatabaseAsync(DB_NAME);
  try {
    // A raw 256-bit key: SQLCipher skips its key derivation.
    await db.execAsync(`PRAGMA key = "x'${key}'"`);
    await db.execAsync('CREATE TABLE IF NOT EXISTS book (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)');
  } catch {
    await db.closeAsync().catch(() => {});
    await SQLite.deleteDatabaseAsync(DB_NAME).catch(() => {});
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`PRAGMA key = "x'${key}'"`);
    await db.execAsync('CREATE TABLE IF NOT EXISTS book (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)');
  }
  return db;
}

/** The book in SQLite, encrypted with SQLCipher (`useSQLCipher` in app.json). One row per collection. */
export function bookBackend(): KvBackend {
  let ready: Promise<SQLite.SQLiteDatabase> | null = null;
  const db = () => (ready ??= open());
  return {
    async readAll() {
      const rows = await (await db()).getAllAsync<{ key: string; value: string }>('SELECT key, value FROM book');
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
    async write(rows, removed) {
      const d = await db();
      await d.withTransactionAsync(async () => {
        for (const [key, value] of Object.entries(rows)) await d.runAsync('INSERT INTO book (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
        for (const key of removed) await d.runAsync('DELETE FROM book WHERE key = ?', key);
      });
    },
    async clear() {
      await (await db()).runAsync('DELETE FROM book');
    },
  };
}
