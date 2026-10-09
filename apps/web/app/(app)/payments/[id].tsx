import PaymentDetail from '@esmart/app/screens/(app)/payments/[id]';
import { PaymentDetailDesktop } from '../../../src/screens/PaymentDetailDesktop';
import { useIsDesktop } from '../../../src/layout';

/** A desktop gets its own two-column layout; narrower windows get the phone screen. */
export default function WebPaymentDetail() {
  return useIsDesktop() ? <PaymentDetailDesktop /> : <PaymentDetail />;
}
