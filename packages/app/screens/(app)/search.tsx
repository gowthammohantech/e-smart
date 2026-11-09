import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useGlobalSearch } from '../../features/search/useGlobalSearch';
import { matchPages, useAppPages } from '../../navigation/pages';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import type { WebPressState } from '@esmart/ui/theme/interaction';
import type { IconName } from '@esmart/ui/components/Icon';
import { ListSkeleton } from '../../components/ScreenSkeleton';

/** A desktop keeps results in a readable column rather than across the whole page. */
const DESKTOP_RESULTS_WIDTH = 880;

type Row = { key: string; title: string; subtitle?: string; trailing?: string; icon: IconName; route: string };

/**
 * One result. A phone stacks the subtitle under the title; a desktop lays the row out
 * like a table (name, detail, value) so the value isn't a page-width away from its name.
 */
function ResultRow({ row, last, desktop, onPress }: { row: Row; last: boolean; desktop: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[row.title, row.subtitle, row.trailing].filter(Boolean).join(', ')}
      style={(state) => {
        const { pressed, hovered } = state as WebPressState;
        return {
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
          paddingHorizontal: t.spacing.lg,
          paddingVertical: desktop ? t.spacing.md : t.spacing.lg,
          borderBottomWidth: last ? 0 : 0.5,
          borderBottomColor: t.c.line,
          backgroundColor: pressed || (desktop && hovered) ? t.c.card2 : 'transparent',
        };
      }}
    >
      <Icon name={row.icon} size={desktop ? 17 : 19} color={t.c.primary} />
      {desktop ? (
        <>
          <Text variant="body" weight="600" numberOfLines={1} style={{ width: 280 }}>
            {row.title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {row.subtitle ?? ''}
          </Text>
        </>
      ) : (
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" weight="600" numberOfLines={1}>
            {row.title}
          </Text>
          {row.subtitle ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {row.subtitle}
            </Text>
          ) : null}
        </View>
      )}
      {row.trailing ? (
        <Text variant="caption" weight="600" numberOfLines={desktop ? 1 : undefined} style={desktop ? { minWidth: 120, textAlign: 'right' } : undefined}>
          {row.trailing}
        </Text>
      ) : desktop ? (
        <View style={{ minWidth: 120 }} />
      ) : null}
      <Icon name="chevron-right" size={18} color={t.c.muted} />
    </Pressable>
  );
}

/** Global search across every record the active company owns. */
export default function GlobalSearch() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'domain', 'nav']);
  const router = useRouter();
  const desktop = useIsDesktop();
  const column = desktop ? { width: '100%' as const, maxWidth: DESKTOP_RESULTS_WIDTH } : undefined;

  const [query, setQuery] = useState('');

  const { results, grouped, pending, isError, refetch } = useGlobalSearch(query);
  // Screens match too, so "invoices" can open the Invoices list itself.
  const pages = matchPages(useAppPages(), query);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.search') }} />

      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md }}>
        <SearchBar
          compact
          value={query}
          onChangeText={setQuery}
          placeholder={tr('common:search.placeholder')}
          autoFocus
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <View style={column}>
        {query.trim().length < 2 ? (
          <EmptyState illustration="search-idle" icon="magnify" title={tr('common:search.title')} message={tr('common:search.subtitleFull')} />
        ) : results.length === 0 && pages.length === 0 && pending ? (
          // Still asking the server (or waiting for typing to pause): shapes, not "no matches".
          <ListSkeleton rows={4} kind="list" />
        ) : isError && results.length === 0 ? (
          <EmptyState
            illustration="error"
            icon="cloud-off-outline"
            title={tr('common:search.failedTitle')}
            message={tr('common:search.failedMessage')}
            actionLabel={tr('common:search.retry')}
            onAction={refetch}
          />
        ) : results.length === 0 && pages.length === 0 ? (
          <EmptyState illustration="search-empty" icon="magnify-close" title={tr('common:search.noMatches')} message={tr('nav:shell.noMatchesInBusiness', { query })} />
        ) : (
          <>
          {pages.length > 0 ? (
            <View style={{ marginBottom: t.spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, marginBottom: t.spacing.sm }}>
                <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  {tr('nav:shell.pages')}
                </Text>
                <Badge label={String(pages.length)} tone="neutral" size="sm" />
              </View>
              <Card padded={false}>
                {pages.map((p, i) => (
                  <ResultRow
                    key={p.key}
                    row={{ key: p.key, title: p.title, subtitle: p.subtitle, icon: p.icon, route: p.route }}
                    last={i === pages.length - 1}
                    desktop={desktop}
                    onPress={() => router.push(p.route as never)}
                  />
                ))}
              </Card>
            </View>
          ) : null}
          {grouped.map(([group, rows]) => (
            <View key={group} style={{ marginBottom: t.spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, marginBottom: t.spacing.sm }}>
                <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  {group}
                </Text>
                <Badge label={String(rows.length)} tone="neutral" size="sm" />
              </View>
              <Card padded={false}>
                {/* Every row the badge counts is listed: the server already caps each kind. */}
                {rows.map((r, i) => (
                  <ResultRow
                    key={`${r.group}-${r.id}`}
                    row={{ key: r.id, title: r.title, subtitle: r.subtitle, trailing: r.trailing, icon: r.icon, route: r.route }}
                    last={i === rows.length - 1}
                    desktop={desktop}
                    onPress={() => router.push(r.route as never)}
                  />
                ))}
              </Card>
            </View>
          ))}
          </>
        )}
        </View>
      </ScrollView>
    </View>
  );
}
