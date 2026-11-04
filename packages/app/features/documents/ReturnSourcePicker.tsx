import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, View } from 'react-native';
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
import { fetchDocumentRecord, useDocumentPages, type ListedDocument } from '../../remote/queries';
import { useDebounced } from '../../components/useDebounced';
import type { DocStatus } from '@esmart/core/types';
import type { Money } from '@esmart/core/lib/money';
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
  const companyId = useAppStore((s) => s.activeCompanyId);
  const isReturn = kind === 'salesReturn' || kind === 'purchaseReturn';

  // Newest first from the server, searched there by number or party; drafts and cancelled ones can't take a return.
  const pages = useDocumentPages({ kinds: [sourceKind], q: useDebounced(query) });
  const rows = (pages.rows as ListedDocument[])
    .filter((d) => !['draft', 'cancelled', 'rejected'].includes(d.status ?? ''))
    .map((d) => ({ doc: d, partyName: d.partyName ?? '—' }));

  const pick = async (id: string) => {
    // Converting copies the source's lines on the device, so it needs the whole document.
    await fetchDocumentRecord(companyId, id);
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
        onEndReached={() => pages.hasNextPage && !pages.isFetchingNextPage && void pages.fetchNextPage()}
        ListFooterComponent={pages.isFetchingNextPage ? <ActivityIndicator color={t.c.muted} style={{ paddingVertical: t.spacing.md }} /> : null}
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxxl }}
        ListEmptyComponent={
          pages.isLoading ? (
            <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} />
          ) : (
            <Card padded={false}>
              <EmptyState icon="file-search-outline" title={tr('sales:returnPicker.empty')} compact />
            </Card>
          )
        }
        renderItem={({ item, index }) => (
          <Card padded={false} style={{ marginBottom: index === rows.length - 1 ? 0 : t.spacing.sm }}>
            <DocumentRow document={{ number: item.doc.number ?? '', date: item.doc.date!, status: item.doc.status as DocStatus, totals: { grandTotal: item.doc.grandTotal as Money } }} partyName={item.partyName} onPress={() => pick(item.doc.id)} divider={false} />
          </Card>
        )}
      />
    </View>
  );
}
