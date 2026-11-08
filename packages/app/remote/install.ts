import { Linking, Platform } from 'react-native';
import type { PlanTier } from '@esmart/core/types';
import { useAppStore, type AppState } from '../store/appStore';
import { api } from './api';
import { canWrite } from './connectivity';
import { useRemoteMeta } from './meta';
import { MUTATIONS } from './mutations';
import * as outbox from './outbox';
import { confirm, onUnconfirmed, savingOnline } from './save';
import { rememberActive, signOut, watchSessionEnd } from './session';
import { reportError } from '../lib/reporter';

let installed = false;

/**
 * Turns the store into a cache of the server's books. Every action still
 * updates the store at once and describes what it means to the API; that is
 * sent straight away, and the change is undone unless the server takes it
 * (see save.ts `confirm`).
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
      const outer = depth === 0;
      // No connection: nothing changes until it is back.
      if (outer && !canWrite()) return undefined;
      const before = store.getState();
      depth++;
      let result: unknown;
      try {
        result = fn(...args);
      } finally {
        depth--;
      }
      if (outer) {
        const after = store.getState();
        const known = new Set(before.syncQueue.map((e) => e.id));
        build!({ args, result, before, after });
        // Online, a change made outside saveOnline (a toggle, a delete, marking a notification read) still
        // has to reach the server straight away, or it's undone.
        if (!savingOnline()) {
          const fresh = outbox.entries().filter((e) => !known.has(e.id));
          void confirm(result, before, after, fresh)
            .then((r) => {
              if (r.outcome === 'refused' || r.outcome === 'unreachable') onUnconfirmed.forEach((l) => l(r));
            })
            .catch((err: unknown) => reportError(err, { source: 'confirm', action: name }));
        }
      }
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

  // Not setState: these are actions, not data, and nothing needs to hear about them.
  Object.assign(store.getState(), patch);
  watchSessionEnd();
  rememberActive();
}
