import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * What the sync engine remembers between launches. The outbox itself is the
 * app store's `syncQueue`, so it persists with the data it describes.
 */
export type RemoteMeta = {
  /** /sync/pull cursor; null means the next pull is a full snapshot. */
  cursor: string | null;
  /** Server version of every entity the server has confirmed, by id. Doubles as "the server knows this id". */
  versions: Record<string, number>;
  /**
   * The server's id for a record first saved under an id made on this device.
   * A screen opened with the device's id (the URL right after creating it)
   * still finds the record once the server has renamed it.
   */
  idAliases: Record<string, string>;
  online: boolean;
  syncing: boolean;
  lastSyncAt?: string;
  lastError?: string;
  setVersion: (id: string, version: number | undefined) => void;
  forget: (id: string) => void;
  addAliases: (map: Record<string, string>) => void;
  patch: (p: Partial<Omit<RemoteMeta, 'setVersion' | 'forget' | 'addAliases' | 'patch' | 'reset'>>) => void;
  reset: () => void;
};

export const useRemoteMeta = create<RemoteMeta>()(
  persist(
    (set, get) => ({
      cursor: null,
      versions: {},
      idAliases: {},
      online: true,
      syncing: false,
      setVersion: (id, version) => {
        if (version === undefined) return;
        set({ versions: { ...get().versions, [id]: version } });
      },
      forget: (id) => {
        const { [id]: _gone, ...rest } = get().versions;
        void _gone;
        set({ versions: rest });
      },
      addAliases: (map) => set({ idAliases: { ...get().idAliases, ...map } }),
      patch: (p) => set(p),
      reset: () => set({ cursor: null, versions: {}, idAliases: {}, syncing: false, lastSyncAt: undefined, lastError: undefined }),
    }),
    {
      name: 'ebs.remote.meta.v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Connectivity and an in-flight sync are facts about this run, not state to restore.
      partialize: ({ cursor, versions, idAliases, lastSyncAt }) => ({ cursor, versions, idAliases, lastSyncAt }) as RemoteMeta,
    },
  ),
);

export const knownToServer = (id: string) => useRemoteMeta.getState().versions[id] !== undefined;

/** The id a record is stored under now, following any renames by the server. */
export function resolveId(id: string, aliases: Record<string, string>): string {
  let current = id;
  // A record is renamed once; the bound only guards against a cycle.
  for (let i = 0; i < 5 && aliases[current]; i++) current = aliases[current];
  return current;
}
