import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { Button } from '@esmart/ui/components/Button';
import { Checkbox } from '@esmart/ui/components/Checkbox';
import { DocumentRow } from '@esmart/ui/components/DocumentRow';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Sheet } from '@esmart/ui/components/Sheet';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { useServerSave } from '../../components/useServerSave';
import { useSingleFlight } from '../../components/useSingleFlight';
import { useAppStore } from '../../store/appStore';
import { fetchDocumentRecord, useDocumentPages, usePartyRecord, usePartySearch, type ListedDocument } from '../../remote/queries';
import { useDebounced } from '../../components/useDebounced';
import type { DocStatus } from '@esmart/core/types';
import type { Money } from '@esmart/core/lib/money';
import { formatMoney } from '@esmart/core/lib/format';
import { NOTE_SOURCE } from '@esmart/core/domain/documentStates';
import { DocumentEditor, detailRouteFor } from './DocumentEditor';
import { ListSkeleton, MoreRowsSkeleton } from '../../components/ScreenSkeleton';

/** Raised against one invoice or bill: returns, and credit and debit notes. */
type AgainstSource = 'salesReturn' | 'purchaseReturn' | 'creditNote' | 'debitNote' | 'supplierCreditNote' | 'supplierDebitNote';

/** An invoice or bill that can take a return or note: finalised, not cancelled (see `conversionBlock`). */
const OPEN_TO_NOTES: DocStatus[] = ['issued', 'partiallyPaid', 'paid', 'overdue'];

type SourceRecord = Awaited<ReturnType<typeof fetchDocumentRecord>>;

/**
 * A return is always raised against one invoice (or bill): pick it first, then the lines it covers,
 * then edit the draft that carries them. A note usually is too, but may also be direct (`?direct=1`):
 * a discount over a period, a rate revision, against no one invoice. It then starts blank and must
 * give its reason. `?partyId=` opens the list on one party's invoices.
 */
export function ReturnSourcePicker({ kind }: { kind: AgainstSource }) {
  const { direct } = useLocalSearchParams<{ direct?: string }>();
  if (direct && kind !== 'salesReturn' && kind !== 'purchaseReturn') return <DocumentEditor kind={kind} />;
  return <SourceList kind={kind} />;
}

function SourceList({ kind }: { kind: AgainstSource }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales', 'common']);
  const router = useRouter();
  const params = useLocalSearchParams<{ partyId?: string }>();
  const { run: serverSave } = useServerSave();
  const [query, setQuery] = useState('');
  const convertDocument = useAppStore((s) => s.convertDocument);
  const sourceKind = NOTE_SOURCE[kind] ?? 'invoice';
  const purchase = sourceKind === 'purchaseBill';
  const companyId = useAppStore((s) => s.activeCompanyId);
  const isReturn = kind === 'salesReturn' || kind === 'purchaseReturn';

  const [partyId, setPartyId] = useState<string | undefined>(params.partyId || undefined);
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyQuery, setPartyQuery] = useState('');
  const partySearch = usePartySearch(purchase ? 'supplier' : 'customer', useDebounced(partyQuery), partyOpen);
  const partyRecord = usePartyRecord(partyId);
  const partyName = partyRecord.data?.name;

  // Newest first, filtered and searched on the server: only what can take a note comes back, so the
  // list doesn't page through drafts and cancelled ones looking for a screenful.
  const pages = useDocumentPages({ kinds: [sourceKind], statuses: OPEN_TO_NOTES, partyId, q: useDebounced(query) });
  const rows = (pages.rows as ListedDocument[]).map((d) => ({ doc: d, partyName: d.partyName ?? '—' }));

  // The picked source, while its lines are being chosen.
  const [source, setSource] = useState<SourceRecord | null>(null);
  const [lineIds, setLineIds] = useState<string[]>([]);

  // One at a time, and shut while it leaves: a second tap would create a second note.
  const loading = useSingleFlight();
  const creating = useSingleFlight();
  const busy = loading.busy || creating.busy;
  const [pickedId, setPickedId] = useState<string | null>(null);

  const create = (doc: SourceRecord, ids?: string[]) =>
    creating.run(
      async () => {
        const res = await serverSave(() => convertDocument(doc.id!, kind, ids), tr(isReturn ? 'sales:returnPicker.created' : 'sales:notePicker.created'), {
          icon: isReturn ? 'keyboard-return' : 'file-document-edit-outline',
        });
        if (!res?.result) return undefined;
        router.replace(`${detailRouteFor(kind, res.id ?? res.result)}/edit` as never);
        return true;
      },
      { hold: true },
    );

  const pick = (id: string) =>
    loading.run(async () => {
      setPickedId(id);
      try {
        // Converting copies the source's lines on the device, so it needs the whole document.
        const doc = await fetchDocumentRecord(companyId, id);
        const ids = (doc.lines ?? []).map((l) => l.id!).filter(Boolean);
        // One line has nothing to choose between.
        if (ids.length <= 1) {
          await create(doc);
          return;
        }
        setLineIds(ids);
        setSource(doc);
      } finally {
        setPickedId(null);
      }
    });

  const allIds = (source?.lines ?? []).map((l) => l.id!).filter(Boolean);
  const toggle = (id: string, on: boolean) => setLineIds((cur) => (on ? [...cur, id] : cur.filter((x) => x !== id)));

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        {isReturn ? null : (
          <Card style={{ gap: t.spacing.sm }}>
            <Button
              title={tr(purchase ? 'sales:notePicker.directBill' : 'sales:notePicker.directInvoice')}
              icon="file-document-outline"
              variant="primary"
              fullWidth
              disabled={busy}
              onPress={() => router.setParams({ direct: '1' } as never)}
            />
            <Text variant="small" tone="muted">
              {tr(purchase ? 'sales:notePicker.directHint.bill' : 'sales:notePicker.directHint.invoice')}
            </Text>
          </Card>
        )}
        {isReturn ? null : (
          <Text variant="title" weight="600" style={{ marginTop: t.spacing.sm }}>
            {tr(purchase ? 'sales:notePicker.orPick.bill' : 'sales:notePicker.orPick.invoice')}
          </Text>
        )}
        <Text variant="small" tone="muted">
          {tr(isReturn ? (purchase ? 'sales:returnPicker.purchaseHint' : 'sales:returnPicker.salesHint') : `sales:notePicker.hint.${kind}`)}
        </Text>
        <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <SearchBar value={query} onChangeText={setQuery} placeholder={tr('sales:returnPicker.search')} />
          </View>
          <Button
            title={partyId ? (partyName ?? '…') : tr('sales:returnPicker.allParties')}
            icon={purchase ? 'truck-outline' : 'account-outline'}
            iconRight="chevron-down"
            variant="secondary"
            onPress={() => setPartyOpen(true)}
          />
          {partyId ? <Button title={tr('sales:returnPicker.clearParty')} icon="close" variant="ghost" size="sm" onPress={() => setPartyId(undefined)} /> : null}
        </View>
        {creating.busy ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }} accessibilityLiveRegion="polite">
            <ActivityIndicator color={t.c.muted} size="small" />
            <Text variant="small" tone="muted">
              {tr('sales:returnPicker.busy')}
            </Text>
          </View>
        ) : null}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.doc.id}
        onEndReached={() => pages.hasNextPage && !pages.isFetchingNextPage && void pages.fetchNextPage()}
        ListFooterComponent={pages.isFetchingNextPage ? <MoreRowsSkeleton /> : null}
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxxl }}
        ListEmptyComponent={
          pages.isLoading ? (
            <ListSkeleton rows={5} />
          ) : (
            <Card padded={false}>
              <EmptyState icon="file-search-outline" title={tr('sales:returnPicker.empty')} compact />
            </Card>
          )
        }
        renderItem={({ item, index }) => (
          <View pointerEvents={busy ? 'none' : 'auto'} aria-busy={pickedId === item.doc.id} style={{ opacity: busy && pickedId !== item.doc.id ? 0.5 : 1 }}>
            <Card padded={false} style={{ marginBottom: index === rows.length - 1 ? 0 : t.spacing.sm }}>
              <DocumentRow
                document={{ number: item.doc.number ?? '', date: item.doc.date!, status: item.doc.status as DocStatus, totals: { grandTotal: item.doc.grandTotal as Money } }}
                partyName={item.partyName}
                onPress={() => pick(item.doc.id)}
                divider={false}
              />
              {pickedId === item.doc.id ? <ActivityIndicator color={t.c.muted} style={{ position: 'absolute', right: t.spacing.lg, top: 0, bottom: 0 }} /> : null}
            </Card>
          </View>
        )}
      />

      <SelectSheet
        visible={partyOpen}
        onClose={() => setPartyOpen(false)}
        title={tr(purchase ? 'sales:returnPicker.supplier' : 'sales:returnPicker.customer')}
        options={(partySearch.data ?? []).map((p) => ({ value: p.id!, label: p.name ?? '', description: [p.displayName, p.taxId, p.phone].filter(Boolean).join(' · ') }))}
        value={partyId}
        onSelect={setPartyId}
        onQueryChange={setPartyQuery}
        loading={partySearch.isFetching}
      />

      <Sheet
        visible={!!source}
        onClose={() => (creating.busy ? undefined : setSource(null))}
        title={tr('sales:returnPicker.linesTitle')}
        subtitle={source ? tr('sales:returnPicker.linesSubtitle', { number: source.number ?? '', party: source.party?.name ?? '' }) : undefined}
        footer={
          <View style={{ gap: t.spacing.sm }}>
            <Text variant="caption" tone={lineIds.length ? 'muted' : 'bad'} center>
              {lineIds.length ? tr('sales:returnPicker.linesPicked', { count: lineIds.length, total: allIds.length }) : tr('sales:returnPicker.noLines')}
            </Text>
            <Button
              title={tr(isReturn ? 'sales:returnPicker.createReturn' : 'sales:returnPicker.createNote')}
              icon="check"
              fullWidth
              disabled={!lineIds.length}
              loading={creating.busy}
              // All lines is the server's default: send none so the request stays as it was.
              onPress={() => source && create(source, lineIds.length === allIds.length ? undefined : allIds.filter((id) => lineIds.includes(id)))}
            />
          </View>
        }
      >
        <Text variant="small" tone="muted" style={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.sm }}>
          {tr('sales:returnPicker.linesHint')}
        </Text>
        <LineChoice
          label={tr('sales:returnPicker.allLines')}
          checked={lineIds.length === allIds.length ? true : lineIds.length ? 'mixed' : false}
          onChange={(on) => setLineIds(on ? allIds : [])}
          strong
        />
        {(source?.lines ?? []).map((l) =>
          l.id ? (
            <LineChoice
              key={l.id}
              label={l.name}
              detail={`${l.quantity} ${l.unit} × ${formatMoney(l.unitPrice as Money)}`}
              checked={lineIds.includes(l.id)}
              onChange={(on) => toggle(l.id!, on)}
            />
          ) : null,
        )}
      </Sheet>
    </View>
  );
}

function LineChoice({ label, detail, checked, onChange, strong }: { label: string; detail?: string; checked: boolean | 'mixed'; onChange: (on: boolean) => void; strong?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => onChange(checked !== true)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingVertical: t.spacing.sm,
        paddingHorizontal: t.spacing.lg,
        minHeight: 44,
        backgroundColor: pressed ? t.c.card2 : 'transparent',
        borderBottomWidth: strong ? 1 : 0,
        borderBottomColor: t.c.line,
      })}
    >
      <Checkbox checked={checked} onChange={onChange} label={label} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight={strong ? '600' : '400'} numberOfLines={2}>
          {label}
        </Text>
        {detail ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
