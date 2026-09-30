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
  online: boolean;
  syncing: boolean;
  lastSyncAt?: string;
  lastError?: string;
  setVersion: (id: string, version: number | undefined) => void;
  forget: (id: string) => void;
  patch: (p: Partial<Omit<RemoteMeta, 'setVersion' | 'forget' | 'patch' | 'reset'>>) => void;
  reset: () => void;
};

export const useRemoteMeta = create<RemoteMeta>()(
  persist(
    (set, get) => ({
      cursor: null,
      versions: {},
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
      patch: (p) => set(p),
      reset: () => set({ cursor: null, versions: {}, syncing: false, lastSyncAt: undefined, lastError: undefined }),
    }),
    {
      name: 'ebs.remote.meta.v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Connectivity and an in-flight sync are facts about this run, not state to restore.
      partialize: ({ cursor, versions, lastSyncAt }) => ({ cursor, versions, lastSyncAt }) as RemoteMeta,
    },
  ),
);

export const knownToServer = (id: string) => useRemoteMeta.getState().versions[id] !== undefined;
