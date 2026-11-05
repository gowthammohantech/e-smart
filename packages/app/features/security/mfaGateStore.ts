import { create } from 'zustand';

/**
 * Raised when the server holds this session for an authenticator code (403 MFA_REQUIRED), from any
 * request; the gate in the signed-in layout asks for it, then lets everything through again.
 */
export const useMfaGate = create<{ required: boolean; require: () => void; clear: () => void }>((set) => ({
  required: false,
  require: () => set({ required: true }),
  clear: () => set({ required: false }),
}));
