import EwayBillScreen from '@esmart/app/screens/(app)/compliance/eway/[id]/index';
import { EwayBillDetailDesktop } from '../../../../../src/screens/EwayBillDetailDesktop';
import { useIsDesktop } from '../../../../../src/layout';

/** A desktop gets its own two-column layout; narrower windows get the phone screen. */
export default function WebEwayBill() {
  return useIsDesktop() ? <EwayBillDetailDesktop /> : <EwayBillScreen />;
}
