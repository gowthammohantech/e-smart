import { useSyncExternalStore } from 'react';

/**
 * Whether a save is on its way to the server and its answer not back yet: a document created,
 * edited, issued or cancelled, a payment, a party, a setting, an e-invoice or e-way bill call.
 * While it is, the app stays where it is (NavigationLock, the leave guard and the sidebar read
 * this), so the answer lands on the screen that asked and nothing is left half done behind it.
 */
let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const isBusy = () => count > 0;

/** Runs `work`, counting it as a save in flight until it settles, whether it succeeds or not. */
export async function whileBusy<T>(work: () => Promise<T>): Promise<T> {
  count++;
  emit();
  try {
    return await work();
  } finally {
    count--;
    emit();
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useBusy(): boolean {
  return useSyncExternalStore(subscribe, isBusy, isBusy);
}
