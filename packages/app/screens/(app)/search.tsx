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
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { ListSkeleton } from '../../components/ScreenSkeleton';

/** Global search across every record the active company owns. */
export default function GlobalSearch() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'domain', 'nav']);
  const router = useRouter();

  const [query, setQuery] = useState('');

  const { results, grouped, isFetching } = useGlobalSearch(query);
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
        {query.trim().length < 2 ? (
          <EmptyState illustration="search-idle" icon="magnify" title={tr('common:search.title')} message={tr('common:search.subtitleFull')} />
        ) : results.length === 0 && pages.length === 0 && isFetching ? (
          // Still asking the server: shapes, not "no matches".
          <ListSkeleton rows={4} kind="list" />
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
                  <Pressable
                    key={p.key}
                    onPress={() => router.push(p.route as never)}
                    accessibilityRole="button"
                    accessibilityLabel={p.title}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.spacing.md,
                      padding: t.spacing.lg,
                      borderBottomWidth: i < pages.length - 1 ? 0.5 : 0,
                      borderBottomColor: t.c.line,
                      backgroundColor: pressed ? t.c.card2 : 'transparent',
                    })}
                  >
                    <Icon name={p.icon} size={19} color={t.c.primary} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="body" weight="600" numberOfLines={1}>
                        {p.title}
                      </Text>
                      {p.subtitle ? (
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {p.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    <Icon name="chevron-right" size={18} color={t.c.muted} />
                  </Pressable>
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
                {rows.slice(0, 8).map((r, i) => (
                  <Pressable
                    key={`${r.group}-${r.id}`}
                    onPress={() => router.push(r.route as never)}
                    accessibilityRole="button"
                    accessibilityLabel={r.title}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.spacing.md,
                      padding: t.spacing.lg,
                      borderBottomWidth: i < Math.min(rows.length, 8) - 1 ? 0.5 : 0,
                      borderBottomColor: t.c.line,
                      backgroundColor: pressed ? t.c.card2 : 'transparent',
                    })}
                  >
                    <Icon name={r.icon} size={19} color={t.c.primary} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="body" weight="600" numberOfLines={1}>
                        {r.title}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {r.subtitle}
                      </Text>
                    </View>
                    {r.trailing ? (
                      <Text variant="caption" weight="600">
                        {r.trailing}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </Card>
            </View>
          ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
