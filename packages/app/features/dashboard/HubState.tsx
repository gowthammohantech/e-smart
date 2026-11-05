import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState, Skeleton } from '@esmart/ui/components/EmptyState';

type HubQuery<T> = { data: T | undefined; isError: boolean; refetch: () => unknown };

/**
 * A dashboard hub's three states: placeholders shaped like its cards while the first answer is on
 * its way, a way to try again when it fails, and the hub itself once there's data. A refresh that
 * fails behind figures already showing keeps them.
 */
export function HubState<T>({ query, children, tiles = 4 }: { query: HubQuery<T>; children: (data: T) => React.ReactNode; tiles?: number }) {
  const { t: tr } = useTranslation(['reports']);
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isError) {
    return (
      <Card>
        <EmptyState
          icon="cloud-off-outline"
          title={tr('reports:dash.state.failedTitle')}
          message={tr('reports:dash.state.failedBody')}
          actionLabel={tr('reports:dash.state.retry')}
          onAction={() => void query.refetch()}
        />
      </Card>
    );
  }
  return <HubSkeleton tiles={tiles} />;
}

/** Grey shapes where the tiles and cards will be. */
export function HubSkeleton({ tiles = 4, cards = 2 }: { tiles?: number; cards?: number }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['reports']);
  const desktop = useIsDesktop();
  const tile = (i: number) => (
    <View key={i} style={{ flex: 1, minHeight: 96, padding: t.spacing.lg, gap: t.spacing.md, borderRadius: t.radius.lg, backgroundColor: t.c.card }}>
      <Skeleton height={11} width="55%" />
      <Skeleton height={22} width="70%" />
      <Skeleton height={9} width="40%" />
    </View>
  );
  const rows = desktop ? [Array.from({ length: tiles }, (_, i) => i)] : Array.from({ length: Math.ceil(tiles / 2) }, (_, r) => [r * 2, r * 2 + 1].filter((i) => i < tiles));
  return (
    <View accessibilityLabel={tr('reports:dash.state.loading')} style={{ gap: t.spacing.md, paddingTop: t.spacing.lg }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: t.spacing.md }}>
          {r.map(tile)}
        </View>
      ))}
      {Array.from({ length: cards }, (_, i) => (
        <View key={`c${i}`} style={{ marginTop: t.spacing.lg, padding: t.spacing.lg, gap: t.spacing.md, borderRadius: t.radius.lg, backgroundColor: t.c.card }}>
          <Skeleton height={13} width="35%" />
          <Skeleton height={110} radius={10} />
        </View>
      ))}
    </View>
  );
}

