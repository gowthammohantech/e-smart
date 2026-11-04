import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { Badge } from '@esmart/ui/components/Badge';
import { countLabel } from '@esmart/core/lib/format';
import { useAppStore } from '../store/appStore';
import { askToWorkOffline, useConnectivity, useRemoteMeta, type Mode } from '../remote';

/** Offline and while sending, this badge carries the queued count; the header's own "N queued" steps aside. */
export const carriesQueue = (mode: Mode) => mode === 'offline' || mode === 'draining';

/**
 * The connection, in the header: view-only while there's no internet and
 * offline mode hasn't been agreed to (pressing it asks), "Offline · N waiting"
 * once it has, "Syncing N…" while what was kept is sent, and "Loading your books…"
 * while the first download after signing in is still coming. Otherwise it shows nothing.
 */
export function ConnectionBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t: tr } = useTranslation(['common']);
  const mode = useConnectivity((s) => s.mode);
  const pending = useAppStore((s) => s.syncQueue.filter((q) => q.status === 'pending').length);
  // Signing in no longer waits for the books: until the first sync lands, say they are on their way.
  const firstLoad = useRemoteMeta((s) => s.syncing && !s.lastSyncAt);

  if (mode === 'readonly') {
    return (
      <Pressable
        onPress={askToWorkOffline}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={tr('common:component.workOffline')}
        style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }, style]}
      >
        <Badge label={tr('common:component.viewOnly')} tone="warning" icon="cloud-off-outline" size="sm" style={{ flexShrink: 1 }} />
      </Pressable>
    );
  }
  if (mode === 'offline') {
    const label = pending > 0 ? tr('common:component.offlineWaiting', { count: countLabel(pending) }) : tr('common:component.offline');
    return <Badge label={label} tone="warning" icon="cloud-off-outline" size="sm" style={style} />;
  }
  if (mode === 'draining' && pending > 0) return <Badge label={tr('common:component.draining', { count: countLabel(pending) })} tone="info" icon="sync" size="sm" style={style} />;
  if (firstLoad) return <Badge label={tr('common:component.loadingBooks')} tone="info" icon="sync" size="sm" style={style} />;
  return null;
}
