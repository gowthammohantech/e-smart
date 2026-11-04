import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { Button } from '@esmart/ui/components/Button';
import { DocumentRow } from '@esmart/ui/components/DocumentRow';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useServerSave } from '../../components/useServerSave';
import { useAppStore } from '../../store/appStore';
import { useDocuments, useParties } from '../../store/selectors';
import { NOTE_SOURCE } from '@esmart/core/domain/documentStates';
import { DocumentEditor, detailRouteFor } from './DocumentEditor';

/** Raised against one invoice or bill: returns, and credit and debit notes. */
type AgainstSource = 'salesReturn' | 'purchaseReturn' | 'creditNote' | 'debitNote' | 'supplierCreditNote' | 'supplierDebitNote';

/**
 * A return is always raised against one invoice (or bill): pick it first, then edit the draft that
 * carries its lines. A note usually is too, but may also be direct (`?direct=1`): a discount over a
 * period, a rate revision, against no one invoice. It then starts blank and must give its reason.
 */
export function ReturnSourcePicker({ kind }: { kind: AgainstSource }) {
  const { direct } = useLocalSearchParams<{ direct?: string }>();
  if (direct && kind !== 'salesReturn' && kind !== 'purchaseReturn') return <DocumentEditor kind={kind} />;
  return <SourceList kind={kind} />;
}

function SourceList({ kind }: { kind: AgainstSource }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales']);
  const router = useRouter();
  const { run: serverSave } = useServerSave();
  const [query, setQuery] = useState('');
  const convertDocument = useAppStore((s) => s.convertDocument);
  const sourceKind = NOTE_SOURCE[kind] ?? 'invoice';
  const purchase = sourceKind === 'purchaseBill';
  const sources = useDocuments(sourceKind);
  const parties = useParties();
  const isReturn = kind === 'salesReturn' || kind === 'purchaseReturn';

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sources
      .filter((d) => !['draft', 'cancelled', 'rejected'].includes(d.status))
      .map((d) => ({ doc: d, partyName: parties.find((p) => p.id === d.partyId)?.name ?? '—' }))
      .filter((r) => !q || r.doc.number.toLowerCase().includes(q) || r.partyName.toLowerCase().includes(q))
      .sort((a, b) => b.doc.date.localeCompare(a.doc.date));
  }, [sources, parties, query]);

  const pick = async (id: string) => {
    const res = await serverSave(() => convertDocument(id, kind), tr(isReturn ? 'sales:returnPicker.created' : 'sales:notePicker.created'), { icon: isReturn ? 'keyboard-return' : 'file-document-edit-outline' });
    if (!res?.result) return;
    router.replace(`${detailRouteFor(kind, res.id ?? res.result)}/edit` as never);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <Text variant="small" tone="muted">
          {tr(isReturn ? (purchase ? 'sales:returnPicker.purchaseHint' : 'sales:returnPicker.salesHint') : `sales:notePicker.hint.${kind}`)}
        </Text>
        <SearchBar value={query} onChangeText={setQuery} placeholder={tr('sales:returnPicker.search')} />
        {isReturn ? null : (
          <Button
            title={tr(purchase ? 'sales:notePicker.directBill' : 'sales:notePicker.directInvoice')}
            icon="file-document-outline"
            variant="secondary"
            onPress={() => router.setParams({ direct: '1' } as never)}
          />
        )}
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
