import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useRemoteMeta } from '../remote/meta';
import { DetailSkeleton } from './ScreenSkeleton';

/**
 * While another business's setup loads (remote/refresh `switchCompany`), the page shows its shape
 * rather than the old books or a half-empty new one. Drawn over the page by each shell.
 */
export function SwitchingOverlay() {
  const t = useTheme();
  const switching = useRemoteMeta((m) => !!m.switchingTo);
  if (!switching) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: t.c.bg, padding: t.spacing.lg, paddingTop: t.spacing.xxl }]} accessibilityRole="progressbar">
      <DetailSkeleton lines={4} tiles={4} />
    </View>
  );
}
