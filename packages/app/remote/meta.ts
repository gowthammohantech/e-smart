import { create } from 'zustand';

/**
 * What this run knows about the server's copy: each record's version (for If-Match), where a record
 * made here went once the server named it, and whether the server answers. In memory only.
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
  /**
   * The plan each business was last pulled under. A plan opens more of a
   * business (expenses on Pro), and what it couldn't read came through empty.
   */
  plans: Record<string, string>;
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

export const useRemoteMeta = create<RemoteMeta>()((set, get) => ({
      cursor: null,
      versions: {},
      idAliases: {},
      plans: {},
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
      reset: () => set({ cursor: null, versions: {}, idAliases: {}, plans: {}, syncing: false, lastSyncAt: undefined, lastError: undefined }),
}));

export const knownToServer = (id: string) => useRemoteMeta.getState().versions[id] !== undefined;

/** The id a record is stored under now, following any renames by the server. */
export function resolveId(id: string, aliases: Record<string, string>): string {
  let current = id;
  // A record is renamed once; the bound only guards against a cycle.
  for (let i = 0; i < 5 && aliases[current]; i++) current = aliases[current];
  return current;
}
