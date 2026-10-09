import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useUiStore } from '../../store/uiStore';
import { useGlobalSearch } from '../../features/search/useGlobalSearch';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

/** Global search across every record the active company owns. */
export default function GlobalSearch() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'domain', 'nav']);
  const router = useRouter();

  const [query, setQuery] = useState('');
  const history = useUiStore((s) => s.searchHistory);
  const pushSearch = useUiStore((s) => s.pushSearch);
  const clearHistory = useUiStore((s) => s.clearSearchHistory);

  const { results, grouped } = useGlobalSearch(query);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.search') }} />

      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md }}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={tr('common:search.placeholder')}
          autoFocus
          onSubmitEditing={() => pushSearch(query)}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        {query.trim().length < 2 ? (
          history.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: t.spacing.sm }}>
                <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('common:search.recent')}</Text>
                <Pressable onPress={clearHistory} hitSlop={6} accessibilityRole="button" accessibilityLabel={tr('common:search.clearHistory')}>
                  <Text variant="caption" tone="primary" weight="600">{tr('common:search.clear')}</Text>
                </Pressable>
              </View>
              <Card padded={false}>
                {history.map((h, i) => (
                  <Pressable
                    key={h}
                    onPress={() => setQuery(h)}
                    accessibilityRole="button"
                    accessibilityLabel={`Search ${h}`}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.spacing.md,
                      padding: t.spacing.lg,
                      borderBottomWidth: i < history.length - 1 ? 0.5 : 0,
                      borderBottomColor: t.c.line,
                      backgroundColor: pressed ? t.c.card2 : 'transparent',
                    })}
                  >
                    <MaterialCommunityIcons name="history" size={18} color={t.c.muted} />
                    <Text variant="body" style={{ flex: 1 }}>
                      {h}
                    </Text>
                  </Pressable>
                ))}
              </Card>
            </>
          ) : (
            <EmptyState
              illustration="search-idle"
              icon="magnify"
              title={tr('common:search.title')}
              message={tr('common:search.subtitleFull')}
            />
          )
        ) : results.length === 0 ? (
          <EmptyState illustration="search-empty" icon="magnify-close" title={tr('common:search.noMatches')} message={`Nothing in ${'this business'} matches "${query}".`} />
        ) : (
          grouped.map(([group, rows]) => (
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
                    onPress={() => {
                      pushSearch(query);
                      router.push(r.route as never);
                    }}
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
                    <MaterialCommunityIcons name={r.icon} size={19} color={t.c.primary} />
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
          ))
        )}
      </ScrollView>
    </View>
  );
}
