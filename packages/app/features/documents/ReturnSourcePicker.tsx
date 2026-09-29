import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { DocumentRow } from '@esmart/ui/components/DocumentRow';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useToast } from '@esmart/ui/components/Toast';
import { useAppStore } from '../../store/appStore';
import { useDocuments, useParties } from '../../store/selectors';
import { detailRouteFor } from './DocumentEditor';

/**
 * A return is always raised against one invoice (or bill): pick it first, then
 * edit the draft that carries its lines — never a free pick from the catalogue.
 */
export function ReturnSourcePicker({ kind }: { kind: 'salesReturn' | 'purchaseReturn' }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales']);
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const convertDocument = useAppStore((s) => s.convertDocument);
  const sourceKind = kind === 'salesReturn' ? 'invoice' : 'purchaseBill';
  const sources = useDocuments(sourceKind);
  const parties = useParties();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sources
      .filter((d) => !['draft', 'cancelled', 'rejected'].includes(d.status))
      .map((d) => ({ doc: d, partyName: parties.find((p) => p.id === d.partyId)?.name ?? '—' }))
      .filter((r) => !q || r.doc.number.toLowerCase().includes(q) || r.partyName.toLowerCase().includes(q))
      .sort((a, b) => b.doc.date.localeCompare(a.doc.date));
  }, [sources, parties, query]);

  const pick = (id: string) => {
    const newId = convertDocument(id, kind);
    if (!newId) return;
    toast.show(tr('sales:returnPicker.created'), 'success');
    router.replace(`${detailRouteFor(kind, newId)}/edit` as never);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <Text variant="small" tone="muted">
          {tr(kind === 'salesReturn' ? 'sales:returnPicker.salesHint' : 'sales:returnPicker.purchaseHint')}
        </Text>
        <SearchBar value={query} onChangeText={setQuery} placeholder={tr('sales:returnPicker.search')} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.doc.id}
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxxl }}
        ListEmptyComponent={
          <Card padded={false}>
            <EmptyState icon="file-search-outline" title={tr('sales:returnPicker.empty')} compact />
          </Card>
        }
        renderItem={({ item, index }) => (
          <Card padded={false} style={{ marginBottom: index === rows.length - 1 ? 0 : t.spacing.sm }}>
            <DocumentRow document={item.doc} partyName={item.partyName} onPress={() => pick(item.doc.id)} divider={false} />
          </Card>
        )}
      />
    </View>
  );
}
