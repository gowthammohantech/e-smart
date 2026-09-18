import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { useUiStore } from '@/store/uiStore';
import { useDocuments, useItems, useParties, usePayments } from '@/store/selectors';
import { DOCUMENT_LABELS } from '@/domain/documentStates';
import { detailRouteFor } from '@/features/documents/DocumentEditor';
import { formatMoney } from '@/lib/format';
import { formatDate } from '@/lib/date';

type Result = {
  id: string;
  group: string;
  title: string;
  subtitle: string;
  trailing?: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: string;
};

/** Global search across every record the active company owns. */
export default function GlobalSearch() {
  const t = useTheme();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const history = useUiStore((s) => s.searchHistory);
  const pushSearch = useUiStore((s) => s.pushSearch);
  const clearHistory = useUiStore((s) => s.clearSearchHistory);

  const parties = useParties();
  const items = useItems();
  const documents = useDocuments();
  const payments = usePayments();

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: Result[] = [];

    parties.forEach((p) => {
      if (`${p.name} ${p.displayName ?? ''} ${p.code} ${p.phone ?? ''} ${p.email ?? ''} ${p.taxId ?? ''}`.toLowerCase().includes(q)) {
        out.push({
          id: p.id,
          group: 'Customers',
          title: p.name,
          subtitle: `${p.code}${p.taxId ? ` · ${p.taxId}` : p.phone ? ` · ${p.phone}` : ''}`,
          icon: 'account-outline',
          route: `/(app)/contacts/customers/${p.id}`,
        });
      }
    });

    items.forEach((i) => {
      if (`${i.name} ${i.sku} ${i.hsnCode ?? ''}`.toLowerCase().includes(q)) {
        out.push({
          id: i.id,
          group: 'Items',
          title: i.name,
          subtitle: `${i.sku} · ${formatMoney(i.salePrice)}`,
          trailing: i.hsnCode ? `${i.type === 'goods' ? 'HSN' : 'SAC'} ${i.hsnCode}` : undefined,
          icon: i.type === 'goods' ? 'package-variant-closed' : 'hammer-wrench',
          route: `/(app)/catalog/items/${i.id}`,
        });
      }
    });

    documents.forEach((d) => {
      const partyName = parties.find((p) => p.id === d.partyId)?.name ?? '';
      const irn = d.compliance?.eInvoice?.irn ?? '';
      const ewb = d.compliance?.eWayBill?.ewbNo ?? '';
      if (`${d.number} ${partyName} ${d.reference ?? ''} ${irn} ${ewb}`.toLowerCase().includes(q)) {
        out.push({
          id: d.id,
          group: DOCUMENT_LABELS[d.kind].plural,
          title: d.number,
          subtitle: irn && q.length >= 6 && irn.includes(q)
            ? `IRN ${irn.slice(0, 20)}…`
            : ewb && ewb.includes(q)
              ? `E-way bill ${ewb}`
              : `${partyName} · ${formatDate(d.date, 'dd MMM')}`,
          trailing: formatMoney(d.totals.grandTotal),
          icon: 'file-document-outline',
          route: detailRouteFor(d.kind, d.id),
        });
      }
    });

    payments.forEach((p) => {
      const partyName = parties.find((x) => x.id === p.partyId)?.name ?? '';
      if (`${p.number} ${partyName} ${p.reference ?? ''}`.toLowerCase().includes(q)) {
        out.push({
          id: p.id,
          group: 'Payments',
          title: p.number,
          subtitle: `${partyName} · ${formatDate(p.date, 'dd MMM')}`,
          trailing: formatMoney(p.amount),
          icon: 'cash-plus',
          route: `/(app)/payments/${p.id}`,
        });
      }
    });

    return out.slice(0, 60);
  }, [query, parties, items, documents, payments]);

  const grouped = useMemo(() => {
    const map = new Map<string, Result[]>();
    results.forEach((r) => map.set(r.group, [...(map.get(r.group) ?? []), r]));
    return Array.from(map.entries());
  }, [results]);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Search' }} />

      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md }}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Invoices, contacts, items, payments…"
          autoFocus
          onSubmitEditing={() => pushSearch(query)}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {query.trim().length < 2 ? (
          history.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: t.spacing.sm }}>
                <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  Recent searches
                </Text>
                <Pressable onPress={clearHistory} hitSlop={6} accessibilityRole="button" accessibilityLabel="Clear history">
                  <Text variant="caption" tone="primary" weight="600">
                    Clear
                  </Text>
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
              title="Search everything"
              message="Find an invoice number, a customer, an item's SKU, a payment reference or an expense — results respect the business you're in."
            />
          )
        ) : results.length === 0 ? (
          <EmptyState illustration="search-empty" icon="magnify-close" title="No matches" message={`Nothing in ${'this business'} matches "${query}".`} />
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
