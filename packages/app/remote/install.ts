import { Linking } from 'react-native';
import type { PlanTier } from '@esmart/core/types';
import { useAppStore, type AppState, type ComplianceResult } from '../store/appStore';
import { api } from './api';
import { isRemote } from './config';
import { MUTATIONS } from './mutations';
import * as outbox from './outbox';
import { resync, signOut, watchSessionEnd } from './session';
import { syncSoon } from './sync';

let installed = false;

const ONLINE_ONLY: ComplianceResult = {
  ok: false,
  issues: [{ code: 'ONLINE_ONLY', message: 'This needs the GST portal; use the e-invoice or e-way bill screen while online.', severity: 'blocking' } as never],
};

/**
 * Turns the store into the local half of an offline-first client. Every
 * action still updates the store at once; the wrapper then queues what the
 * action means to the API, and the sync engine sends it when it can.
 *
 * Only the outermost action queues: `duplicateDocument` calls
 * `createDocument` internally, and the server has its own duplicate.
 */
export function installRemote() {
  if (installed || !isRemote()) return;
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
    // The session lives on the server now; the auth screens call remote/session.
    signIn: () => {},
    signInWithOtp: () => {},
    signUp: () => {},
    signOut: () => void signOut(),
    // Plans change through billing: checkout, then the webhook, then a pull.
    setPlan: (companyId: string, plan: PlanTier) => {
      void api
        .POST('/companies/{companyId}/subscription/checkout', { params: { path: { companyId } }, body: { plan, cycle: 'yearly' } })
        .then(({ data }) => (data?.checkoutUrl ? Linking.openURL(data.checkoutUrl) : undefined))
        .catch(() => {});
    },
    // Demo reset becomes "reload everything from the server".
    resetDemoData: () => void resync(),
    retrySync: (id: string) => {
      outbox.update(id, { status: 'pending', lastError: undefined, conflict: undefined });
      syncSoon(0);
    },
    clearSyncQueue: () => {
      for (const e of outbox.entries()) if (e.status === 'failed') outbox.update(e.id, { status: 'pending', lastError: undefined, conflict: undefined });
      syncSoon(0);
    },
    // Local fallbacks the store calls internally (auto-report on finalise):
    // the server reports to the portal itself, so the simulator must not run.
    generateEInvoice: () => ONLINE_ONLY,
    cancelEInvoice: () => ONLINE_ONLY,
    generateEwayBill: () => ONLINE_ONLY,
    updateEwayBillPartB: () => ONLINE_ONLY,
    extendEwayBill: () => ONLINE_ONLY,
    cancelEwayBill: () => ONLINE_ONLY,
  } satisfies Partial<AppState>);

  store.setState(patch);
  outbox.onEnqueue.add(() => syncSoon());
  watchSessionEnd();
}
