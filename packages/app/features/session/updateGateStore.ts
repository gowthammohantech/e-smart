import { create } from 'zustand';

/**
 * Raised when the server no longer serves this build (426 APP_UPDATE_REQUIRED). The gate at the root
 * covers the app until the person updates; nothing else can work against this server meanwhile.
 */
export const useUpdateGate = create<{ minVersion: string | null; require: (minVersion: string) => void }>((set) => ({
  minVersion: null,
  require: (minVersion) => set({ minVersion }),
}));
