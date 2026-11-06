import NewEwayBill from '@esmart/app/screens/(app)/compliance/eway/new';
import { NewEwayBillDesktop } from '../../../../src/screens/EwayBillFormDesktop';
import { useIsDesktop } from '../../../../src/layout';

/** A desktop gets its own two-column form; narrower windows get the phone screen. */
export default function WebNewEwayBill() {
  return useIsDesktop() ? <NewEwayBillDesktop /> : <NewEwayBill />;
}
