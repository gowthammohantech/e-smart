/**
 * What this computer has already imported, per business, so running the same file twice does not
 * create everything twice. Where the server can tell a duplicate itself (contacts, items, opening
 * balances, journals, a supplier's own bill number) it does; this covers the rest.
 */
const KEY = 'esmart.migrator.imported';
const CAP = 50_000;

type Store = Record<string, string[]>;

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
}

const slot = (companyId: string, entity: string) => `${companyId}|${entity}`;

export function importedBefore(companyId: string, entity: string): Set<string> {
  return new Set(read()[slot(companyId, entity)] ?? []);
}

export function remember(companyId: string, entity: string, keys: string[]) {
  if (!keys.length) return;
  try {
    const store = read();
    const s = slot(companyId, entity);
    store[s] = [...(store[s] ?? []), ...keys].slice(-CAP);
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage blocked: the server still refuses what it can tell is a duplicate.
  }
}
