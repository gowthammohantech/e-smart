import { requireOptionalNativeModule } from 'expo';

/**
 * JS side of the iOS App Intents bridge (`native/ios/IntentsBridge`). The
 * native module only exists in iOS builds, so on Android and the web every
 * call here quietly does nothing.
 */

export type IntentCustomer = { id: string; name: string; code: string };
export type IntentItem = { id: string; name: string; unit: string };

/** An action Siri or Shortcuts left for the app to finish. */
export type PendingIntentAction = {
  action: 'createInvoice';
  partyId: string;
  itemId?: string;
  quantity: number;
};

type IntentsBridgeModule = {
  syncEntities(customersJson: string, itemsJson: string): void;
  consumePendingAction(): string | null;
  addListener(event: 'onPendingAction', listener: () => void): { remove(): void };
};

const native = requireOptionalNativeModule<IntentsBridgeModule>('IntentsBridge');

export function syncIntentEntities(customers: IntentCustomer[], items: IntentItem[]) {
  native?.syncEntities(JSON.stringify(customers), JSON.stringify(items));
}

/** Takes the waiting action, if any; it is cleared so it runs only once. */
export function consumePendingAction(): PendingIntentAction | null {
  return parsePendingAction(native?.consumePendingAction() ?? null);
}

export function addPendingActionListener(listener: () => void): { remove(): void } {
  return native?.addListener('onPendingAction', listener) ?? { remove: () => {} };
}

export function parsePendingAction(json: string | null): PendingIntentAction | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const { action, partyId, itemId, quantity } = raw as Record<string, unknown>;
  if (action !== 'createInvoice' || typeof partyId !== 'string' || !partyId) return null;
  return {
    action,
    partyId,
    itemId: typeof itemId === 'string' && itemId ? itemId : undefined,
    quantity: typeof quantity === 'number' && quantity > 0 ? quantity : 1,
  };
}
