import SyncStatus from '@esmart/app/screens/(app)/settings/sync';
import { SyncStatusDesktop } from '../../../src/screens/SyncStatusDesktop';
import { useIsDesktop } from '../../../src/layout';

/** A desktop gets its own dashboard layout; narrower windows get the phone screen. */
export default function WebSyncStatus() {
  return useIsDesktop() ? <SyncStatusDesktop /> : <SyncStatus />;
}
