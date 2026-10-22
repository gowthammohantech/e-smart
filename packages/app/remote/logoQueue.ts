import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** A logo chosen on this device that the server doesn't have yet. */
export type PendingLogo = {
  /** Where the picked image is on this device. */
  uri: string;
  /** Uploads that failed to reach the server after the business had synced. */
  tries: number;
  /** Set when the server refused it or the file is gone; shown once, then cleared. */
  failed?: string;
};

type LogoQueue = {
  /** By company id. */
  pending: Record<string, PendingLogo>;
  set: (companyId: string, uri: string) => void;
  clear: (companyId: string) => void;
  tried: (companyId: string) => void;
  fail: (companyId: string, message: string) => void;
  /** A company first saved under an id made on this device is renamed by the server. */
  remap: (ids: Map<string, string>) => void;
  reset: () => void;
};

/**
 * Persisted, so a logo picked during setup is still uploaded if the app is
 * closed before the business reaches the server.
 */
export const useLogoQueue = create<LogoQueue>()(
  persist(
    (set, get) => ({
      pending: {},
      set: (companyId, uri) => set({ pending: { ...get().pending, [companyId]: { uri, tries: 0 } } }),
      clear: (companyId) => {
        const { [companyId]: _gone, ...rest } = get().pending;
        void _gone;
        set({ pending: rest });
      },
      tried: (companyId) => {
        const p = get().pending[companyId];
        if (p) set({ pending: { ...get().pending, [companyId]: { ...p, tries: p.tries + 1 } } });
      },
      fail: (companyId, message) => {
        const p = get().pending[companyId];
        if (p) set({ pending: { ...get().pending, [companyId]: { ...p, failed: message } } });
      },
      remap: (ids) => {
        const next: Record<string, PendingLogo> = {};
        for (const [id, p] of Object.entries(get().pending)) next[ids.get(id) ?? id] = p;
        set({ pending: next });
      },
      reset: () => set({ pending: {} }),
    }),
    {
      name: 'ebs.logo.queue.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ pending: s.pending }) as LogoQueue,
    },
  ),
);
