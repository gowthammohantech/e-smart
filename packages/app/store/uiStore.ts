import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ThemeMode } from '@esmart/ui/theme/ThemeProvider';
import { AppLanguage } from '@esmart/i18n/config';

export type RecentEntry = { id: string; kind: string; label: string; at: string };

/** The gestures that open Lixi, each switchable in Settings → Appearance. */
export type LixiAccess = { holdTab: boolean; swipeUp: boolean; floatingOrb: boolean; pullDown: boolean };

/** The tab gestures that get a periodic tip: the two that open Lixi, and swiping between tabs. */
export type LixiHintKey = 'swipeTabs' | 'swipeUp' | 'holdTab';
export type LixiHintsLearned = Record<LixiHintKey, boolean>;

/** Where the floating Lixi orb was last parked: an edge, and its top as a fraction of the screen. */
export type LixiOrbSpot = { side: 'left' | 'right'; y: number };

/** The period every dashboard tab shows, as the period bar sets it. `from`/`to` only with `custom`. */
export type DashboardPeriod = {
  range: 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
  from?: string;
  to?: string;
  grain: 'day' | 'week' | 'month';
  compare: boolean;
};
export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriod = { range: 'month', grain: 'month', compare: false };

type UiState = {
  themeMode: ThemeMode;
  setThemeMode: (m: ThemeMode) => void;

  /** The chosen language. `system` follows the device, falling back to English. */
  language: AppLanguage;
  setLanguage: (l: AppLanguage) => void;

  /**
   * Whether the persisted preferences have been read back. The theme and the
   * language are both decided here, so the first paint has to wait for it or
   * it flashes the defaults.
   */
  hydrated: boolean;
  setHydrated: (v: boolean) => void;

  recents: RecentEntry[];
  pushRecent: (e: Omit<RecentEntry, 'at'>) => void;

  hasSeenTour: boolean;
  setHasSeenTour: (v: boolean) => void;

  /** Businesses whose setup checklist the person has hidden on Home. */
  setupDismissed: string[];
  dismissSetup: (companyId: string) => void;

  lixiAccess: LixiAccess;
  setLixiAccess: (key: keyof LixiAccess, on: boolean) => void;

  lixiOrbSpot: LixiOrbSpot;
  setLixiOrbSpot: (spot: LixiOrbSpot) => void;

  /** Gesture tips the person has acted on or dismissed; learned tips stop showing. */
  lixiHintsLearned: LixiHintsLearned;
  markLixiHintLearned: (key: LixiHintKey) => void;
  resetLixiHints: () => void;

  /** Shared by Home, Sales, Purchases and Accounts, so switching tabs keeps the same period. */
  dashboardPeriod: DashboardPeriod;
  setDashboardPeriod: (p: DashboardPeriod) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      themeMode: 'light',
      setThemeMode: (themeMode) => set({ themeMode }),

      // `system` for a fresh install, but the v2 migration pins existing
      // installs to English so nobody's app changes language on update.
      // Anything the device asks for that we don't ship resolves to English.
      language: 'system',
      setLanguage: (language) => set({ language }),

      hydrated: false,
      setHydrated: (hydrated) => set({ hydrated }),

      recents: [],
      pushRecent: (e) =>
        set({
          recents: [
            { ...e, at: new Date().toISOString() },
            ...get().recents.filter((r) => !(r.id === e.id && r.kind === e.kind)),
          ].slice(0, 20),
        }),

      hasSeenTour: false,
      setHasSeenTour: (hasSeenTour) => set({ hasSeenTour }),

      setupDismissed: [],
      dismissSetup: (companyId) => {
        if (!get().setupDismissed.includes(companyId)) set({ setupDismissed: [...get().setupDismissed, companyId] });
      },

      lixiAccess: { holdTab: true, swipeUp: true, floatingOrb: false, pullDown: true },
      setLixiAccess: (key, on) => set({ lixiAccess: { ...get().lixiAccess, [key]: on } }),

      lixiOrbSpot: { side: 'right', y: 0.62 },
      setLixiOrbSpot: (lixiOrbSpot) => set({ lixiOrbSpot }),

      lixiHintsLearned: { swipeTabs: false, swipeUp: false, holdTab: false },
      markLixiHintLearned: (key) => {
        if (get().lixiHintsLearned[key]) return;
        set({ lixiHintsLearned: { ...get().lixiHintsLearned, [key]: true } });
      },
      resetLixiHints: () => set({ lixiHintsLearned: { swipeTabs: false, swipeUp: false, holdTab: false } }),

      dashboardPeriod: DEFAULT_DASHBOARD_PERIOD,
      setDashboardPeriod: (dashboardPeriod) => set({ dashboardPeriod }),
    }),
    {
      name: 'ebs.ui.v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      // `hydrated` is a runtime flag, not a preference. Persisting it would
      // write back `true` and defeat the gate on the next cold start.
      partialize: (s) => {
        const { hydrated, ...rest } = s;
        void hydrated;
        return rest as UiState;
      },
      migrate: (persisted, version) => {
        const state = persisted as Partial<UiState>;
        // v0 defaulted to 'system'; move existing installs onto the new light default.
        if (version < 1 && state.themeMode === 'system') state.themeMode = 'light';
        // v2 added language. Anyone already using the app was using it in
        // English, so pin them there rather than switching under them.
        if (version < 2 && state.language === undefined) state.language = 'en';
        // v3 dropped recent searches: the history kept on the device goes with it.
        if (version < 3) delete (state as { searchHistory?: unknown }).searchHistory;
        return state as UiState;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
