import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { Avatar } from '@/components/Avatar';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { Badge } from '@/components/Badge';
import { useBaseCurrency, useDocuments, useParties, usePayments } from '@/store/selectors';
import { formatGstin } from '@/domain/gst/gstin';
import { buildOutstanding } from '@/domain/receivables';
import { money } from '@/lib/money';
import { formatMoney } from '@/lib/format';

export default function CustomersScreen() {
  const t = useTheme();
  const router = useRouter();

  const baseCurrency = useBaseCurrency();
  const [query, setQuery] = useState('');

  const parties = useParties();
  const documents = useDocuments('invoice');
  const payments = usePayments();

  const outstandingByParty = useMemo(() => {
    const rows = buildOutstanding(documents, payments);
    const map: Record<string, number> = {};
    rows.forEach((r) => {
      map[r.document.partyId] = (map[r.document.partyId] ?? 0) + r.outstanding.minor;
    });
    return map;
  }, [documents, payments]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter((p) =>
      `${p.name} ${p.displayName ?? ''} ${p.code} ${p.phone ?? ''} ${p.email ?? ''} ${p.taxId ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [parties, query]);

  const sections = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach((p) => {
      const letter = p.name[0]?.toUpperCase() ?? '#';
      map.set(letter, [...(map.get(letter) ?? []), p]);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, data]) => ({ title, data }));
  }, [filtered]);

  const totalOutstanding = useMemo(
    () => money(Object.values(outstandingByParty).reduce((a, b) => a + b, 0), baseCurrency),
    [outstandingByParty, baseCurrency],
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Customers' }} />

      <View style={{ paddingHorizontal: t.spacing.lg, gap: t.spacing.md, paddingBottom: t.spacing.md }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search customers or GSTIN" />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" tone="muted">
            {filtered.length} customers
          </Text>
          <Text variant="caption" weight="600" tone="warn">
            {formatMoney(totalOutstanding)} receivable
          </Text>
        </View>
      </View>

      {sections.length === 0 ? (
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg }}>
          <Card padded={false}>
            <EmptyState
              illustration="no-contacts" icon="account-group-outline"
              title={parties.length === 0 ? 'No customers yet' : 'No matches'}
              message={
                parties.length === 0
                  ? 'Add one now, or they get created as you invoice.'
                  : 'Try a different search term.'
              }
              actionLabel={parties.length === 0 ? 'Add a customer' : undefined}
              onAction={parties.length === 0 ? () => router.push('/(app)/contacts/customers/new' as never) : undefined}
              compact
            />
          </Card>
        </ScrollView>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: 120 }}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          renderSectionHeader={({ section }) => (
            <Text variant="caption" tone="muted" weight="700" style={{ paddingVertical: t.spacing.sm }}>
              {section.title}
            </Text>
          )}
          renderItem={({ item: p }) => {
            const outstanding = outstandingByParty[p.id] ?? 0;
            return (
              <Pressable
                onPress={() => router.push(`/(app)/contacts/customers/${p.id}` as never)}
                accessibilityRole="button"
                accessibilityLabel={p.name}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.md,
                  padding: t.spacing.md,
                  borderRadius: t.radius.md,
                  backgroundColor: pressed ? t.c.card2 : t.c.card,
                  borderWidth: t.scheme === 'dark' ? 1 : 0,
                  borderColor: t.c.line,
                  marginBottom: t.spacing.sm,
                })}
              >
                <Avatar name={p.name} size={42} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text variant="body" weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {p.name}
                    </Text>
                    {p.status === 'inactive' ? <Badge label="Inactive" tone="neutral" size="sm" /> : null}
                    {p.taxId ? null : <Badge label="B2C" tone="warning" size="sm" />}
                  </View>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {p.taxId ? formatGstin(p.taxId) : p.phone ?? p.email ?? p.code}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  {outstanding > 0 ? (
                    <>
                      <Text variant="small" weight="700" tone="warn">
                        {formatMoney(money(outstanding, baseCurrency))}
                      </Text>
                      <Text variant="micro" tone="muted">
                        owes you
                      </Text>
                    </>
                  ) : (
                    <Text variant="micro" tone="muted">
                      Settled
                    </Text>
                  )}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
              </Pressable>
            );
          }}
        />
      )}

      <Fab icon="account-plus" onPress={() => router.push('/(app)/contacts/customers/new' as never)} />
    </View>
  );
}
