import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, SectionList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { AppHeader } from '../../../components/AppHeader';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { Avatar } from '@esmart/ui/components/Avatar';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { Segmented } from '@esmart/ui/components/Field';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { Badge } from '@esmart/ui/components/Badge';
import { useBaseCurrency, useDocuments, useHasModule, useParties, usePayments } from '../../../store/selectors';
import { buildOutstanding } from '@esmart/core/domain/receivables';
import { money } from '@esmart/core/lib/money';
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

  const parties = useParties(tab);
  const documents = useDocuments(tab === 'customer' ? 'invoice' : 'purchaseBill');
  const payments = usePayments(tab === 'customer' ? 'received' : 'paid');

  const outstandingByParty = useMemo(() => {
    const rows = buildOutstanding(documents, payments);
    const map: Record<string, number> = {};
    rows.forEach((r) => {
      map[r.document.partyId] =
        (map[r.document.partyId] ?? 0) + Math.round(r.outstanding.minor * (r.document.exchangeRate || 1));
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
      <AppHeader title={hasSuppliers ? 'Contacts' : 'Customers'} subtitle={hasSuppliers ? 'Customers and suppliers' : 'Who you sell to'} />

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
              { value: 'customer', label: 'Customers' },
              { value: 'supplier', label: 'Suppliers' },
            ]}
            value={tab}
            onChange={(v) => setTab(v as Tab)}
          />
          </View>
        ) : null}
        <View style={desktop ? { width: 300 } : undefined}>
          <SearchBar value={query} onChangeText={setQuery} placeholder={`Search ${tab === 'customer' ? 'customers' : 'suppliers'}`} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.lg, ...(desktop ? { flex: 1, justifyContent: 'flex-end' } : null) }}>
          <Text variant="caption" tone="muted">
            {filtered.length} {tab === 'customer' ? 'customers' : 'suppliers'}
          </Text>
          <Text variant="caption" weight="600" tone={tab === 'customer' ? 'warn' : 'bad'}>
            {formatMoney(totalOutstanding)} {tab === 'customer' ? 'receivable' : 'payable'}
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
                sortValue: (p) => p.name,
              },
              { key: 'code', header: tr('common:table.code'), width: 110, render: (p) => <Cell tone="muted">{p.code}</Cell>, sortValue: (p) => p.code },
              { key: 'taxId', secondary: true, header: tr('common:table.taxId'), width: 180, render: (p) => <Cell tone="muted">{p.taxId || '—'}</Cell> },
              { key: 'phone', header: tr('common:table.phone'), width: 150, render: (p) => <Cell tone="muted">{p.phone || '—'}</Cell> },
              { key: 'email', secondary: true, header: tr('common:table.email'), flex: 1.5, render: (p) => <Cell tone="muted">{p.email || '—'}</Cell> },
              {
                key: 'outstanding',
                header: tr('common:table.outstanding'),
                width: 150,
                align: 'right',
                render: (p) => {
                  const due = outstandingByParty[p.id] ?? 0;
                  return due > 0 ? (
                    <Cell weight="700" tone={tab === 'customer' ? 'warn' : 'bad'} mono>
                      {formatMoney(money(due, baseCurrency))}
                    </Cell>
                  ) : (
                    <Cell tone="muted">{tr('contacts:hub.settled')}</Cell>
                  );
                },
                sortValue: (p) => outstandingByParty[p.id] ?? 0,
              },
            ]}
            rows={filtered}
            rowKey={(p) => p.id}
            initialSort={{ key: 'name', dir: 'asc' }}
            onRowPress={(p) =>
              router.push(tab === 'customer' ? `/(app)/contacts/customers/${p.id}` : `/(app)/contacts/suppliers/${p.id}`)
            }
            rowLabel={(p) => p.name}
            empty={
              <EmptyState
                illustration="no-contacts"
                icon="account-group-outline"
                title={parties.length === 0 ? `No ${tab === 'customer' ? 'customers' : 'suppliers'} yet` : 'No matches'}
                message={parties.length === 0 ? 'Add one now, or they get created as you invoice.' : 'Try a different search term.'}
                compact
              />
            }
          />
        </View>
      ) : sections.length === 0 ? (
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg }}>
          <Card padded={false}>
            <EmptyState
              illustration="no-contacts" icon="account-group-outline"
              title={parties.length === 0 ? `No ${tab === 'customer' ? 'customers' : 'suppliers'} yet` : 'No matches'}
              message={
                parties.length === 0
                  ? 'Add one now, or they get created as you invoice.'
                  : 'Try a different search term.'
              }
              actionLabel={parties.length === 0 ? 'Add contact' : undefined}
              onAction={
                parties.length === 0
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
          showsVerticalScrollIndicator={SHOW_SCROLLBAR}
          renderSectionHeader={({ section }) => (
            <Text variant="caption" tone="muted" weight="700" style={{ paddingVertical: t.spacing.sm }}>
              {section.title}
            </Text>
          )}
          renderItem={({ item: p }) => {
            const outstanding = outstandingByParty[p.id] ?? 0;
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
                        {formatMoney(money(outstanding, baseCurrency))}
                      </Text>
                      <Text variant="micro" tone="muted">
                        {tab === 'customer' ? 'owes you' : 'you owe'}
                      </Text>
                    </>
                  ) : (
                    <Text variant="micro" tone="muted">{tr('contacts:hub.settled')}</Text>
                  )}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
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
