import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { AmountField, PickerField, Segmented } from '@esmart/ui/components/Field';
import { Icon } from '@esmart/ui/components/Icon';
import { FormContainer, FormSection } from '@esmart/ui/components/Layout';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney, toAmountInput } from '@esmart/core/lib/format';
import { fromMajor, money, type Money } from '@esmart/core/lib/money';
import { documentKindLabel } from '@esmart/core/labels';
import type { DocumentKind } from '@esmart/core/types';
import { adjustOnServer, useAdjustable, usePartyRecord, usePartySearch, type AdjustmentAllocation } from '../../../remote/queries';
import { describeError } from '../../../remote/errors';
import { syncSoon } from '../../../remote/sync';
import { useDebounced } from '../../../components/useDebounced';
import { useBaseCurrency, useParties } from '../../../store/selectors';

type Side = 'customer' | 'supplier';

/**
 * The adjustment entry: a party's unadjusted advances (receipts, or payments made) and direct credit
 * notes, applied to its open invoices and debit notes (or bills). On the server (RULES 8.13): a service
 * advance's GST comes back on the invoice's date, a note moves no GST. `?partyId=&documentId=` opens on one.
 */
export default function AdjustAdvances() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { t: tr } = useTranslation(['books', 'common', 'domain']);
  const baseCurrency = useBaseCurrency();
  const params = useLocalSearchParams<{ partyId?: string; documentId?: string; side?: string }>();
  const [partyId, setPartyId] = useState<string | undefined>(params.partyId);
  const [sideChoice, setSide] = useState<Side>(params.side === 'supplier' ? 'supplier' : 'customer');
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const search = usePartySearch(undefined, useDebounced(query), picking);
  usePartyRecord(partyId);
  const party = useParties().find((p) => p.id === partyId);
  const side: Side = party?.kind === 'supplier' ? 'supplier' : party?.kind === 'both' ? sideChoice : 'customer';
  const data = useAdjustable(partyId, side);
  const credits = data.data?.credits ?? [];
  const open = useMemo(() => {
    const rows = data.data?.open ?? [];
    // Opened from an invoice: that one first.
    return params.documentId ? [...rows.filter((o) => o.documentId === params.documentId), ...rows.filter((o) => o.documentId !== params.documentId)] : rows;
  }, [data.data, params.documentId]);

  // Manual: one credit chosen, amounts typed per document. Left alone, everything goes oldest first.
  const [creditKey, setCreditKey] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const chosen = credits.find((c) => `${c.sourceType}:${c.id}` === creditKey);
  const typed = Object.entries(amounts)
    .map(([documentId, v]) => ({ documentId, minor: fromMajor(v || '0', baseCurrency).minor }))
    .filter((x) => x.minor > 0);
  const typedTotal = typed.reduce((a, x) => a + x.minor, 0);
  const over = !!chosen && typedTotal > (chosen.left as Money).minor;
  // A service advance applied to an invoice with no service line: GST taken back on goods (RULES 8.12).
  const goodsOnly = (documentId: string) => open.find((o) => o.documentId === documentId)?.hasServiceLines === false;
  const serviceAdvance = (c?: (typeof credits)[number]) => !!c && c.sourceType === 'payment' && !!c.advanceTax;
  const autoWarning = credits.some((c) => serviceAdvance(c)) && open.some((o) => !o.hasServiceLines);

  const pick = (key: string) => {
    setCreditKey(key === creditKey ? null : key);
    setAmounts({});
  };
  const fill = (documentId: string) => {
    if (!chosen) return;
    const row = open.find((o) => o.documentId === documentId)!;
    const room = (chosen.left as Money).minor - typedTotal + (amounts[documentId] ? fromMajor(amounts[documentId], baseCurrency).minor : 0);
    const take = Math.min(room, (row.outstanding as Money).minor);
    if (take > 0) setAmounts((a) => ({ ...a, [documentId]: toAmountInput(money(take, baseCurrency)) }));
  };

  const apply = async (allocations?: AdjustmentAllocation[]) => {
    if (!partyId) return;
    setBusy(true);
    try {
      const res = await adjustOnServer(partyId, side, allocations);
      const applied = res.applied.reduce((a, x) => a + x.amount.minor, 0);
      toast.show(applied ? tr('books:adjust.done', { amount: formatMoney(money(applied, baseCurrency)) }) : tr('books:adjust.nothing'), applied ? 'success' : 'info', { icon: 'swap-horizontal' });
      setCreditKey(null);
      setAmounts({});
      syncSoon();
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(false);
    }
  };
  const applyChosen = () =>
    chosen && void apply(typed.map((x) => ({ sourceType: chosen.sourceType, sourceId: chosen.id, documentId: x.documentId, amount: money(x.minor, baseCurrency) })));

  const kindLabel = (kind: DocumentKind) => documentKindLabel(tr, kind, 1);
  const row = (key: string, title: string, subtitle: string, right: React.ReactNode, opts: { selected?: boolean; onPress?: () => void; warn?: string; extra?: React.ReactNode }) => (
    <Pressable
      key={key}
      onPress={opts.onPress}
      disabled={!opts.onPress}
      accessibilityRole={opts.onPress ? 'button' : undefined}
      accessibilityState={opts.onPress ? { selected: !!opts.selected } : undefined}
      style={{ padding: t.spacing.md, gap: t.spacing.xs, borderBottomWidth: 0.5, borderBottomColor: t.c.line, backgroundColor: opts.selected ? t.c.card2 : 'transparent' }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
        {opts.onPress ? <Icon name={opts.selected ? 'radiobox-marked' : 'radiobox-blank'} size={18} color={opts.selected ? t.c.primary : t.c.muted} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" weight="600" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        {right}
      </View>
      {opts.extra}
      {opts.warn ? (
        <Text variant="caption" tone="warn">
          {opts.warn}
        </Text>
      ) : null}
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('books:adjust.title') }} />
      <FormContainer>
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          <Text variant="small" tone="muted">
            {tr('books:adjust.intro')}
          </Text>
          <PickerField label={tr('books:adjust.party')} value={party?.name} placeholder={tr('books:adjust.pickParty')} onPress={() => setPicking(true)} icon="account-outline" required />
          {party?.kind === 'both' ? (
            <Segmented
              options={[
                { value: 'customer' as Side, label: tr('books:adjust.customerSide') },
                { value: 'supplier' as Side, label: tr('books:adjust.supplierSide') },
              ]}
              value={sideChoice}
              onChange={(v) => {
                setSide(v);
                setCreditKey(null);
                setAmounts({});
              }}
            />
          ) : null}

          {!partyId ? null : data.isLoading ? (
            <ActivityIndicator color={t.c.muted} />
          ) : !credits.length || !open.length ? (
            <EmptyState icon="swap-horizontal" title={!credits.length ? tr('books:adjust.noCredit') : tr('books:adjust.noOpen')} message={tr('books:adjust.emptyHint')} compact />
          ) : (
            <>
              <FormSection title={tr('books:adjust.credits')}>
                <Card padded={false}>
                  {credits.map((c) => {
                    const key = `${c.sourceType}:${c.id}`;
                    return row(
                      key,
                      c.number,
                      `${tr(c.sourceType === 'note' ? 'books:adjust.note' : side === 'customer' ? 'books:adjust.advance' : 'books:adjust.advancePaid')} · ${formatDate(c.date)}`,
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <Text variant="small" weight="700">{formatMoney(c.left as Money)}</Text>
                        {serviceAdvance(c) ? <Badge label={tr('books:adjust.gst')} tone="info" size="sm" /> : null}
                      </View>,
                      { selected: creditKey === key, onPress: () => pick(key) },
                    );
                  })}
                </Card>
              </FormSection>
              <FormSection title={tr('books:adjust.open')}>
                <Card padded={false}>
                  {open.map((o) =>
                    row(
                      o.documentId,
                      o.number,
                      `${kindLabel(o.kind)} · ${formatDate(o.date)}`,
                      <Text variant="small" weight="700">{formatMoney(o.outstanding as Money)}</Text>,
                      {
                        onPress: chosen ? () => fill(o.documentId) : undefined,
                        selected: !!amounts[o.documentId],
                        warn: serviceAdvance(chosen) && goodsOnly(o.documentId) ? tr('books:adjust.notService') : undefined,
                        extra: chosen ? (
                          <AmountField label={tr('books:adjust.amount')} value={amounts[o.documentId] ?? ''} onChangeValue={(v) => setAmounts((a) => ({ ...a, [o.documentId]: v }))} currency={baseCurrency} />
                        ) : null,
                      },
                    ),
                  )}
                </Card>
              </FormSection>
              {chosen ? (
                <>
                  {over ? (
                    <Text variant="caption" tone="bad">
                      {tr('books:adjust.over', { amount: formatMoney(chosen.left as Money) })}
                    </Text>
                  ) : null}
                  <Button title={tr('books:adjust.applyChosen', { amount: formatMoney(money(typedTotal, baseCurrency)) })} onPress={applyChosen} loading={busy} disabled={busy || !typed.length || over} fullWidth size="lg" />
                </>
              ) : (
                <>
                  {autoWarning ? (
                    <Text variant="caption" tone="warn">
                      {tr('books:adjust.autoNotService')}
                    </Text>
                  ) : null}
                  <Button title={tr('books:adjust.applyAll')} icon="sort-calendar-ascending" onPress={() => void apply()} loading={busy} disabled={busy} fullWidth size="lg" />
                  <Text variant="caption" tone="muted">
                    {tr('books:adjust.applyAllHint')}
                  </Text>
                </>
              )}
            </>
          )}
          {params.documentId ? <Button title={tr('books:adjust.back')} variant="ghost" onPress={() => router.back()} /> : null}
        </ScrollView>
      </FormContainer>
      <SelectSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={tr('books:adjust.party')}
        options={(search.data ?? []).map((p) => ({ value: p.id!, label: p.name!, description: p.phone ?? p.code }))}
        onQueryChange={setQuery}
        loading={search.isFetching}
        value={partyId}
        onSelect={(id) => {
          setPartyId(id);
          setCreditKey(null);
          setAmounts({});
        }}
      />
    </View>
  );
}
