import { Linking, Platform } from 'react-native';
import type { PlanTier } from '@esmart/core/types';
import { bookChannel, useAppStore, type AppState } from '../store/appStore';
import { api } from './api';
import { useRemoteMeta } from './meta';
import { MUTATIONS } from './mutations';
import * as outbox from './outbox';
import { signOut, watchSessionEnd } from './session';
import { syncSoon } from './sync';
import { reportError } from '../lib/reporter';

let installed = false;

/**
 * Turns the store into the local half of an offline-first client. Every
 * action still updates the store at once; the wrapper then queues what the
 * action means to the API, and the sync engine sends it when it can.
 *
 * Only the outermost action queues: `duplicateDocument` calls
 * `createDocument` internally, and the server has its own duplicate.
 */
export function installRemote() {
  if (installed) return;
  installed = true;
  const store = useAppStore;
  const original = store.getState();
  let depth = 0;
  const patch: Partial<AppState> = {};

  for (const [name, build] of Object.entries(MUTATIONS)) {
    const fn = original[name as keyof AppState] as (...args: unknown[]) => unknown;
    (patch as Record<string, unknown>)[name] = (...args: unknown[]) => {
      const before = store.getState();
      depth++;
      let result: unknown;
      try {
        result = fn(...args);
      } finally {
        depth--;
      }
      if (depth === 0) build!({ args, result, before, after: store.getState() });
      return result;
    };
  }

  Object.assign(patch, {
    // The session lives on the server; signing out tells it so.
    signOut: () => void signOut(),
    // Plans change through billing: checkout, then the webhook, then a pull. Nothing calls this while
    // the apps are Free-only (745f284); a failure is reported rather than lost when something does.
    setPlan: (companyId: string, plan: PlanTier) => {
      void api
        .POST('/companies/{companyId}/subscription/checkout', { params: { path: { companyId } }, body: { plan, cycle: 'yearly' } })
        .then(({ data }) => (data?.checkoutUrl ? Linking.openURL(data.checkoutUrl) : undefined))
        .catch((err: unknown) => reportError(err, { source: 'checkout' }));
    },
  } satisfies Partial<AppState>);

  // Not setState: that also saves, and the saved book hasn't been read back yet,
  // so it would overwrite it with this empty store. Hydration merges over these.
  Object.assign(store.getState(), patch);
  outbox.onEnqueue.add(() => syncSoon());
  watchSessionEnd();
  followOtherTabs();
}

/** On the web another tab may have changed the saved book: take its copy, or the next save here undoes its work. */
function followOtherTabs() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  bookChannel()?.addEventListener('message', () => void useAppStore.persist.rehydrate());
  window.addEventListener('storage', (e) => {
    if (e.key === useRemoteMeta.persist.getOptions().name) void useRemoteMeta.persist.rehydrate();
  });
}
