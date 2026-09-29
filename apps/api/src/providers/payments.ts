import type { Config } from '../config';

/**
 * Razorpay payment links and subscriptions, plus webhook signature checks. The simulator mints links locally.
 *
 * Owned by the Billing module; shape it to what its handlers need.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PaymentsProvider {}

export function createPaymentsProvider(_config: Config): PaymentsProvider {
  return {};
}
