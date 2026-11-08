import React from 'react';
import { useTranslation } from 'react-i18next';
import { type StyleProp, type ViewStyle } from 'react-native';
import { Badge } from '@esmart/ui/components/Badge';
import { useRemoteMeta } from '../remote';

/**
 * The connection, in the header: "No internet connection" while the server can't be reached (saving
 * is off until it can), and "Loading your books…" while the open business's setup is still coming.
 * Otherwise it shows nothing.
 */
export function ConnectionBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t: tr } = useTranslation(['common']);
  const online = useRemoteMeta((s) => s.online);
  const firstLoad = useRemoteMeta((s) => s.syncing && !s.lastSyncAt);

  if (!online) return <Badge label={tr('common:network.offline')} tone="warning" icon="cloud-off-outline" size="sm" style={[{ flexShrink: 1 }, style]} />;
  if (firstLoad) return <Badge label={tr('common:component.loadingBooks')} tone="info" icon="sync" size="sm" style={style} />;
  return null;
}
