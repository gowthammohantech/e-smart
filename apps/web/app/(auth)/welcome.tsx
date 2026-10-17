import { Redirect } from 'expo-router';
import Welcome from '@esmart/app/screens/(auth)/welcome';
import { useIsDesktop } from '../../src/layout';

/**
 * A desktop's sign-in screen already carries the welcome pitch in its brand
 * panel, so the phone's landing page would only be an extra click.
 */
export default function WebWelcome() {
  return useIsDesktop() ? <Redirect href="/(auth)/sign-in" /> : <Welcome />;
}
