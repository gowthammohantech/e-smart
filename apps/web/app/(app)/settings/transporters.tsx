import Transporters from '@esmart/app/screens/(app)/settings/transporters';
import { TransportersDesktop } from '../../../src/screens/TransportersDesktop';
import { useIsDesktop } from '../../../src/layout';

/** A desktop gets its own add / edit dialog; narrower windows get the phone screen. */
export default function WebTransporters() {
  return useIsDesktop() ? <TransportersDesktop /> : <Transporters />;
}
