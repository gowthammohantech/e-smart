import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { forgetFile } from './keptFiles';

/** A receipt picked while offline, waiting for its expense to reach the server. */
export type PendingReceipt = {
  companyId: string;
  /** Where the picked image is on this device. */
  uri: string;
  /** Failed uploads with the server reachable. */
  tries: number;
};

type ReceiptQueue = {
  /** By expense id. */
  pending: Record<string, PendingReceipt>;
  add: (expenseId: string, companyId: string, uri: string) => void;
  clear: (expenseId: string) => void;
  tried: (expenseId: string) => void;
  /** An expense first saved under an id made on this device is renamed by the server. */
  remap: (ids: Map<string, string>) => void;
  /** Points an entry at the kept copy of its file; false when no entry has it any more. */
  swapUri: (from: string, to: string) => boolean;
  reset: () => void;
};

/** Persisted, so a receipt is still uploaded if the app is closed before the connection returns. */
export const useReceiptQueue = create<ReceiptQueue>()(
  persist(
    (set, get) => ({
      pending: {},
      add: (expenseId, companyId, uri) => set({ pending: { ...get().pending, [expenseId]: { companyId, uri, tries: 0 } } }),
      clear: (expenseId) => {
        const { [expenseId]: gone, ...rest } = get().pending;
        void forgetFile(gone?.uri);
        set({ pending: rest });
      },
      tried: (expenseId) => {
        const p = get().pending[expenseId];
        if (p) set({ pending: { ...get().pending, [expenseId]: { ...p, tries: p.tries + 1 } } });
      },
      remap: (ids) => {
        const next: Record<string, PendingReceipt> = {};
        for (const [id, p] of Object.entries(get().pending)) {
          const to = ids.get(id) ?? id;
          next[to] = { ...p, companyId: ids.get(p.companyId) ?? p.companyId };
        }
        set({ pending: next });
      },
      swapUri: (from, to) => {
        const entry = Object.entries(get().pending).find(([, p]) => p.uri === from);
        if (!entry) return false;
        set({ pending: { ...get().pending, [entry[0]]: { ...entry[1], uri: to } } });
        return true;
      },
      reset: () => {
        for (const p of Object.values(get().pending)) void forgetFile(p.uri);
        set({ pending: {} });
      },
    }),
    {
      name: 'ebs.receipt.queue.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ pending: s.pending }) as ReceiptQueue,
    },
  ),
);
