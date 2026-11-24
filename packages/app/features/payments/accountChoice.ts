import type { Translate } from '@esmart/core/labels';
import type { PaymentAccount } from '@esmart/core/types';

export const isInactiveAccount = (a: Pick<PaymentAccount, 'status'>) => a.status === 'inactive';

/**
 * An inactive account in a picker: still listed, greyed out and marked Inactive, and tapping it says
 * why it can't be picked. The account an entry already uses (`keepId`) stays pickable, as the server
 * lets an entry keep the account it is in.
 */
export function inactiveChoice(tr: Translate, a: PaymentAccount, keepId?: string) {
  if (!isInactiveAccount(a) || a.id === keepId) return {};
  return { note: { text: tr('common:accountStatus.inactive'), tone: 'muted' as const }, blocked: tr('common:accountStatus.inactiveHint', { name: a.name }) };
}
