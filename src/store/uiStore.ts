import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ThemeMode } from '@/theme/ThemeProvider';

export type RecentEntry = { id: string; kind: string; label: string; at: string };

type UiState = {
  themeMode: ThemeMode;
  setThemeMode: (m: ThemeMode) => void;

  /** Simulated connectivity used by the offline/sync demo. */
  offlineMode: boolean;
  setOfflineMode: (v: boolean) => void;

  /** Adds artificial latency + skeletons so loading states are demonstrable. */
  simulateLatency: boolean;
  setSimulateLatency: (v: boolean) => void;

  recents: RecentEntry[];
  pushRecent: (e: Omit<RecentEntry, 'at'>) => void;

  searchHistory: string[];
  pushSearch: (q: string) => void;
  clearSearchHistory: () => void;

  hasSeenTour: boolean;
  setHasSeenTour: (v: boolean) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      themeMode: 'system',
      setThemeMode: (themeMode) => set({ themeMode }),

      offlineMode: false,
      setOfflineMode: (offlineMode) => set({ offlineMode }),

      simulateLatency: true,
      setSimulateLatency: (simulateLatency) => set({ simulateLatency }),

      recents: [],
      pushRecent: (e) =>
        set({
          recents: [
            { ...e, at: new Date().toISOString() },
            ...get().recents.filter((r) => !(r.id === e.id && r.kind === e.kind)),
          ].slice(0, 20),
        }),

      searchHistory: [],
      pushSearch: (q) => {
        const query = q.trim();
        if (!query) return;
        set({ searchHistory: [query, ...get().searchHistory.filter((s) => s !== query)].slice(0, 8) });
      },
      clearSearchHistory: () => set({ searchHistory: [] }),

      hasSeenTour: false,
      setHasSeenTour: (hasSeenTour) => set({ hasSeenTour }),
    }),
    {
      name: 'ebs.ui.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
