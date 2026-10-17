import PlanBilling from '@esmart/app/screens/(app)/settings/plan';
import { PlanBillingDesktop } from '../../../src/screens/PlanBillingDesktop';
import { useIsDesktop } from '../../../src/layout';

/** A desktop gets its own side-by-side layout; narrower windows get the phone screen. */
export default function WebPlanBilling() {
  return useIsDesktop() ? <PlanBillingDesktop /> : <PlanBilling />;
}
