import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, SectionList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { Button } from '@esmart/ui/components/Button';
import { AppHeader } from '../../../components/AppHeader';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { Avatar } from '@esmart/ui/components/Avatar';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { Segmented } from '@esmart/ui/components/Field';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { Badge } from '@esmart/ui/components/Badge';
import { useBaseCurrency, useHasModule } from '../../../store/selectors';
import { usePartyPages, usePartySummary } from '../../../remote/queries';
import { useDebounced } from '../../../components/useDebounced';
import type { Party } from '@esmart/core/types';
import { zero, type Money } from '@esmart/core/lib/money';
import { formatMoney } from '@esmart/core/lib/format';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';

type Tab = 'customer' | 'supplier';

export default function ContactsTab() {
  const t = useTheme();
  const { t: tr } = useTranslation(['contacts', 'common']);
  const router = useRouter();

  const baseCurrency = useBaseCurrency();
  const hasSuppliers = useHasModule('purchases');
  const [pickedTab, setTab] = useState<Tab>('customer');
  // Suppliers belong to buying; a Sales-plan company only sees customers.
  const tab: Tab = hasSuppliers ? pickedTab : 'customer';
  const [query, setQuery] = useState('');
  const desktop = useIsDesktop();

  // Read from the server by name, 50 at a time, each with its balance; the count and total cover every page.
  const search = useDebounced(query);
  const pages = usePartyPages({ kind: tab, q: search });
  const summary = usePartySummary({ kind: tab, q: search }).data;
  const filtered = pages.rows as unknown as (Party & { outstanding?: Money })[];
  /** What a party owes (a customer) or is owed (a supplier), in its own currency. */
  const owed = (p: { outstanding?: Money }) => p.outstanding?.minor ?? 0;
  const count = summary?.count ?? filtered.length;
  const loadMore = () => {
    if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
  };
  const moreFooter = pages.hasNextPage ? (
    <View style={{ alignItems: 'center', paddingVertical: t.spacing.md }}>
      {pages.isFetchingNextPage ? <ActivityIndicator color={t.c.muted} /> : <Button title={tr('common:documentList.loadMore')} variant="ghost" size="sm" onPress={loadMore} />}
    </View>
  ) : null;

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

  const totalOutstanding = (summary?.outstanding as Money | undefined) ?? zero(baseCurrency);
  const noneAtAll = !search && summary?.count === 0;

  const emptyTitle =
    !noneAtAll
      ? tr('common:component.noMatches')
      : tab === 'customer'
        ? tr('contacts:hub.noCustomers')
        : tr('contacts:hub.noSuppliers');
  const emptyMessage = noneAtAll ? tr('contacts:hub.emptyBody') : tr('contacts:hub.noMatchesBody');

  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        title={hasSuppliers ? tr('contacts:hub.title') : tr('contacts:hub.titleCustomersOnly')}
        subtitle={hasSuppliers ? tr('contacts:hub.subtitle') : tr('contacts:hub.subtitleCustomersOnly')}
      />

      <View
        style={
          desktop
            ? { paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.md, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }
            : { paddingHorizontal: t.spacing.lg, gap: t.spacing.md, paddingBottom: t.spacing.md }
        }
      >
        {hasSuppliers ? (
          <View style={desktop ? { width: 260 } : undefined}>
          <Segmented
            options={[
              { value: 'customer', label: tr('contacts:hub.customers') },
              { value: 'supplier', label: tr('contacts:hub.suppliers') },
            ]}
            value={tab}
            onChange={(v) => setTab(v as Tab)}
          />
          </View>
        ) : null}
        <View style={desktop ? { width: 300 } : undefined}>
          <SearchBar value={query} onChangeText={setQuery} placeholder={tab === 'customer' ? tr('contacts:hub.searchCustomers') : tr('contacts:hub.searchSuppliers')} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.lg, ...(desktop ? { flex: 1, justifyContent: 'flex-end' } : null) }}>
          <Text variant="caption" tone="muted">
            {tab === 'customer' ? tr('contacts:hub.customerCount', { count }) : tr('contacts:hub.supplierCount', { count })}
          </Text>
          <Text variant="caption" weight="600" tone={tab === 'customer' ? 'warn' : 'bad'}>
            {tab === 'customer'
              ? tr('contacts:hub.receivable', { amount: formatMoney(totalOutstanding) })
              : tr('contacts:hub.payable', { amount: formatMoney(totalOutstanding) })}
          </Text>
        </View>
      </View>

      {desktop ? (
        <View style={{ flex: 1, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg }}>
          <DataTable
            columns={[
              {
                key: 'name',
                header: tr('common:table.name'),
                flex: 2,
                render: (p) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, maxWidth: '100%' }}>
                    <Avatar name={p.name} size={28} />
                    <Cell weight="600">{p.name}</Cell>
                    {p.status === 'inactive' ? <Badge label={tr('contacts:hub.inactive')} tone="neutral" size="sm" /> : null}
                    {p.currency !== baseCurrency ? <Badge label={p.currency} tone="info" size="sm" /> : null}
                  </View>
                ),
              },
              { key: 'code', header: tr('common:table.code'), width: 110, render: (p) => <Cell tone="muted">{p.code}</Cell> },
              { key: 'taxId', secondary: true, header: tr('common:table.taxId'), width: 180, render: (p) => <Cell tone="muted">{p.taxId || '—'}</Cell> },
              { key: 'phone', header: tr('common:table.phone'), width: 150, render: (p) => <Cell tone="muted">{p.phone || '—'}</Cell> },
              { key: 'email', secondary: true, header: tr('common:table.email'), flex: 1.5, render: (p) => <Cell tone="muted">{p.email || '—'}</Cell> },
              {
                key: 'outstanding',
                header: tr('common:table.outstanding'),
                width: 150,
                align: 'right',
                render: (p) =>
                  owed(p) > 0 ? (
                    <Cell weight="700" tone={tab === 'customer' ? 'warn' : 'bad'} mono>
                      {formatMoney(p.outstanding!)}
                    </Cell>
                  ) : (
                    <Cell tone="muted">{tr('contacts:hub.settled')}</Cell>
                  ),
              },
            ]}
            rows={filtered}
            rowKey={(p) => p.id}
            onRowPress={(p) =>
              router.push(tab === 'customer' ? `/(app)/contacts/customers/${p.id}` : `/(app)/contacts/suppliers/${p.id}`)
            }
            rowLabel={(p) => p.name}
            empty={
              pages.isLoading ? (
                <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} />
              ) : (
                <EmptyState illustration="no-contacts" icon="account-group-outline" title={emptyTitle} message={emptyMessage} compact />
              )
            }
          />
          {moreFooter}
        </View>
      ) : pages.isLoading && !filtered.length ? (
        <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} />
      ) : sections.length === 0 ? (
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg }}>
          <Card padded={false}>
            <EmptyState
              illustration="no-contacts" icon="account-group-outline"
              title={emptyTitle}
              message={emptyMessage}
              actionLabel={noneAtAll ? tr('contacts:hub.addContact') : undefined}
              onAction={
                noneAtAll
                  ? () => router.push(tab === 'customer' ? '/(app)/contacts/customers/new' : '/(app)/contacts/suppliers/new')
                  : undefined
              }
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
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={moreFooter}
          showsVerticalScrollIndicator={SHOW_SCROLLBAR}
          renderSectionHeader={({ section }) => (
            <Text variant="caption" tone="muted" weight="700" style={{ paddingVertical: t.spacing.sm }}>
              {section.title}
            </Text>
          )}
          renderItem={({ item: p }) => {
            const outstanding = owed(p);
            return (
              <Pressable
                onPress={() =>
                  router.push(
                    tab === 'customer'
                      ? `/(app)/contacts/customers/${p.id}`
                      : `/(app)/contacts/suppliers/${p.id}`,
                  )
                }
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
                    {p.status === 'inactive' ? <Badge label={tr('contacts:hub.inactive')} tone="neutral" size="sm" /> : null}
                    {p.currency !== baseCurrency ? <Badge label={p.currency} tone="info" size="sm" /> : null}
                  </View>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {p.phone ?? p.email ?? p.code}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  {outstanding > 0 ? (
                    <>
                      <Text variant="small" weight="700" tone={tab === 'customer' ? 'warn' : 'bad'}>
                        {formatMoney(p.outstanding!)}
                      </Text>
                      <Text variant="micro" tone="muted">
                        {tab === 'customer' ? tr('contacts:hub.owesYou') : tr('contacts:hub.youOwe')}
                      </Text>
                    </>
                  ) : (
                    <Text variant="micro" tone="muted">{tr('contacts:hub.settled')}</Text>
                  )}
                </View>
                <Icon name="chevron-right" size={18} color={t.c.muted} />
              </Pressable>
            );
          }}
        />
      )}

      <Fab
        icon="account-plus"
        onPress={() =>
          router.push(tab === 'customer' ? '/(app)/contacts/customers/new' : '/(app)/contacts/suppliers/new')
        }
      />
    </View>
  );
}
