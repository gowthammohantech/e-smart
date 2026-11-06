import { create } from 'zustand';

type Waiter = { resolve: () => void; reject: (err: Error) => void };

/**
 * Raised when the server holds this session for an authenticator code (403 MFA_REQUIRED), from any
 * request; the gate at the root asks for it, then lets everything through again. Signing in waits on
 * it too (`passed`), so a held session finishes signing in once the code is in.
 */
export const useMfaGate = create<{
  required: boolean;
  waiters: Waiter[];
  require: () => void;
  /** The code passed: everything waiting carries on. */
  clear: () => void;
  /** Gave up (signed out): everything waiting fails. */
  cancel: () => void;
  /** Resolves once the code passes, rejects if the person gives up. Raises the gate. */
  passed: () => Promise<void>;
}>((set, get) => ({
  required: false,
  waiters: [],
  require: () => set({ required: true }),
  clear: () => {
    const { waiters } = get();
    set({ required: false, waiters: [] });
    waiters.forEach((w) => w.resolve());
  },
  cancel: () => {
    const { waiters } = get();
    set({ required: false, waiters: [] });
    waiters.forEach((w) => w.reject(new MfaCancelled()));
  },
  passed: () =>
    new Promise<void>((resolve, reject) => {
      set((s) => ({ required: true, waiters: [...s.waiters, { resolve, reject }] }));
    }),
}));

/** Signing in stopped at the authenticator code because the person chose to sign out instead. */
export class MfaCancelled extends Error {
  constructor() {
    super('Sign-in cancelled at the authenticator code');
    this.name = 'MfaCancelled';
  }
}
