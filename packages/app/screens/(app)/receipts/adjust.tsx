import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { AmountField, PickerField, Segmented } from '@esmart/ui/components/Field';
import { Icon } from '@esmart/ui/components/Icon';
import { Columns, FormContainer, FormSection } from '@esmart/ui/components/Layout';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney, toAmountInput } from '@esmart/core/lib/format';
import { fromMajor, money, type Money } from '@esmart/core/lib/money';
import { documentKindLabel } from '@esmart/core/labels';
import type { DocumentKind } from '@esmart/core/types';
import { adjustOnServer, useAdjustable, usePartyRecord, usePartySearch, type AdjustmentAllocation } from '../../../remote/queries';
import { describeError } from '../../../remote/errors';
import { refreshSoon } from '../../../remote/refresh';
import { useDebounced } from '../../../components/useDebounced';
import { useBaseCurrency, useHasModule, useParties } from '../../../store/selectors';
import { ListSkeleton } from '../../../components/ScreenSkeleton';
import { Skeleton } from '@esmart/ui/components/Skeleton';

type Side = 'customer' | 'supplier';

/**
 * The adjustment entry: a party's unadjusted advances (receipts, or payments made) and direct credit
 * notes, applied to its open invoices and debit notes (or bills). On the server (RULES 8.13): a service
 * advance's GST comes back on the invoice's date, a note moves no GST. `?partyId=&documentId=` opens on one.
 */
export default function AdjustAdvances() {
  const t = useTheme();
  const desktop = useIsDesktop();
  const router = useRouter();
  const toast = useToast();
  const { t: tr } = useTranslation(['books', 'common', 'domain', 'sales']);
  // Suppliers come with purchases: without them (Free, Basic) the words are about customers only.
  const hasSuppliers = useHasModule('purchases');
  const baseCurrency = useBaseCurrency();
  const params = useLocalSearchParams<{ partyId?: string; documentId?: string; side?: string }>();
  const [partyId, setPartyId] = useState<string | undefined>(params.partyId);
  const [sideChoice, setSide] = useState<Side>(params.side === 'supplier' ? 'supplier' : 'customer');
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const search = usePartySearch(undefined, useDebounced(query), picking);
  const partyQuery = usePartyRecord(partyId);
  const party = useParties().find((p) => p.id === partyId);
  // The side follows the party's kind: until it's in, a supplier would be read as a customer.
  const partyPending = !!partyId && !party && partyQuery.isLoading;
  const side: Side = party?.kind === 'supplier' ? 'supplier' : party?.kind === 'both' ? sideChoice : 'customer';
  const data = useAdjustable(partyPending ? undefined : partyId, side);
  const credits = data.data?.credits ?? [];
  // Only invoices whose every line is a service: what an advance receipt is adjusted against.
  const open = useMemo(() => {
    const rows = (data.data?.open ?? []).filter((o) => o.servicesOnly);
    // Opened from an invoice: that one first.
    return params.documentId ? [...rows.filter((o) => o.documentId === params.documentId), ...rows.filter((o) => o.documentId !== params.documentId)] : rows;
  }, [data.data, params.documentId]);

  // Manual: one or more credits chosen, amounts typed per document. Left alone, everything goes oldest first.
  const [creditKeys, setCreditKeys] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  /** The credits ticked, oldest first: the amounts typed are drawn from them in that order. */
  const chosenList = credits.filter((c) => creditKeys.includes(`${c.sourceType}:${c.id}`));
  const chosen = chosenList.length > 0;
  const chosenLeft = chosenList.reduce((a, c) => a + (c.left as Money).minor, 0);
  const typed = Object.entries(amounts)
    .map(([documentId, v]) => ({ documentId, minor: fromMajor(v || '0', baseCurrency).minor }))
    .filter((x) => x.minor > 0);
  const typedTotal = typed.reduce((a, x) => a + x.minor, 0);
  // Never more than the ticked advances have left between them.
  const over = chosen && typedTotal > chosenLeft;
  const serviceAdvance = (c?: (typeof credits)[number]) => !!c && c.sourceType === 'payment' && !!c.advanceTax;
  const shownOpen = open;

  const pick = (key: string) => {
    setCreditKeys((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));
    setAmounts({});
  };
  const fill = (documentId: string) => {
    if (!chosen) return;
    const row = open.find((o) => o.documentId === documentId)!;
    const room = chosenLeft - typedTotal + (amounts[documentId] ? fromMajor(amounts[documentId], baseCurrency).minor : 0);
    const take = Math.min(room, (row.outstanding as Money).minor);
    if (take > 0) setAmounts((a) => ({ ...a, [documentId]: toAmountInput(money(take, baseCurrency)) }));
    // All the ticked advances have is on other invoices: say so, rather than the tap doing nothing.
    else toast.show(tr('books:adjust.nothingLeft'), 'warning', { icon: 'cash-remove' });
  };
  /** A tap ticks an invoice (filled with what is left) or unticks it (its amount freed for the others). */
  const toggle = (documentId: string) => {
    if (!amounts[documentId]) return fill(documentId);
    setAmounts((a) => {
      const next = { ...a };
      delete next[documentId];
      return next;
    });
  };

  const apply = async (allocations?: AdjustmentAllocation[]) => {
    if (!partyId) return;
    setBusy(true);
    try {
      const res = await adjustOnServer(partyId, side, allocations);
      const applied = res.applied.reduce((a, x) => a + x.amount.minor, 0);
      toast.show(applied ? tr('books:adjust.done', { amount: formatMoney(money(applied, baseCurrency)) }) : tr('books:adjust.nothing'), applied ? 'success' : 'info', { icon: 'swap-horizontal' });
      setCreditKeys([]);
      setAmounts({});
      refreshSoon();
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(false);
    }
  };
  // Each document's amount is drawn from the ticked credits oldest first, the next taking over as one runs out.
  const applyChosen = () => {
    if (!chosen || over) return;
    const left = chosenList.map((c) => ({ c, left: (c.left as Money).minor }));
    const allocations: AdjustmentAllocation[] = [];
    for (const x of typed) {
      let need = x.minor;
      for (const l of left) {
        if (need <= 0) break;
        const take = Math.min(need, l.left);
        if (take <= 0) continue;
        allocations.push({ sourceType: l.c.sourceType, sourceId: l.c.id, documentId: x.documentId, amount: money(take, baseCurrency) });
        l.left -= take;
        need -= take;
      }
    }
    void apply(allocations);
  };

  const kindLabel = (kind: DocumentKind) => documentKindLabel(tr, kind, 1);
  // The row is the tap target; a field under it sits outside it, so typing in the field never
  // re-fills it with the most it can take.
  const row = (key: string, title: string, subtitle: string, right: React.ReactNode, opts: { selected?: boolean; onPress?: () => void; warn?: string; extra?: React.ReactNode; multi?: boolean }) => (
    <View key={key} style={{ borderBottomWidth: 0.5, borderBottomColor: t.c.line, backgroundColor: opts.selected ? t.c.card2 : 'transparent' }}>
      <Pressable
        onPress={opts.onPress}
        disabled={!opts.onPress}
        accessibilityRole={opts.onPress ? 'button' : undefined}
        accessibilityState={opts.onPress ? { selected: !!opts.selected } : undefined}
        style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, padding: t.spacing.md, minHeight: 48 }}
      >
        {opts.onPress ? (
          <Icon
            name={opts.multi ? (opts.selected ? 'checkbox-marked' : 'checkbox-blank-outline') : opts.selected ? 'radiobox-marked' : 'radiobox-blank'}
            size={18}
            color={opts.selected ? t.c.primary : t.c.muted}
          />
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" weight="600" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        {right}
      </Pressable>
      {opts.extra || opts.warn ? (
        <View style={{ paddingHorizontal: t.spacing.md, paddingBottom: t.spacing.md, gap: t.spacing.xs }}>
          {opts.extra}
          {opts.warn ? (
            <Text variant="caption" tone="warn">
              {opts.warn}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('books:adjust.title') }} />
      {/* Two lists side by side on a desktop, across the page's full column; the intro and the party
          sit side by side above them, so nothing stretches alone across it. */}
      <FormContainer style={desktop ? { maxWidth: '100%' } : undefined}>
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          <Columns
            left={
              <Text variant="small" tone="muted">
                {tr('books:adjust.intro')}
              </Text>
            }
            right={
              <View style={{ gap: t.spacing.lg }}>
                {partyPending ? (
                  <View style={{ gap: 6 }}>
                    <Skeleton height={12} width={80} radius={4} />
                    <Skeleton height={44} radius={t.radius.md} />
                  </View>
                ) : (
                  <PickerField label={tr('books:adjust.party')} value={party?.name} placeholder={tr(hasSuppliers ? 'books:adjust.pickParty' : 'books:adjust.pickCustomer')} onPress={() => setPicking(true)} icon="account-outline" required />
                )}
                {party?.kind === 'both' ? (
                  <Segmented
                    options={[
                      { value: 'customer' as Side, label: tr('books:adjust.customerSide') },
                      { value: 'supplier' as Side, label: tr('books:adjust.supplierSide') },
                    ]}
                    value={sideChoice}
                    onChange={(v) => {
                      setSide(v);
                      setCreditKeys([]);
                      setAmounts({});
                    }}
                  />
                ) : null}
              </View>
            }
          />

          {!partyId ? null : partyPending || data.isLoading ? (
            <ListSkeleton kind="list" rows={4} />
          ) : data.isError ? (
            // Not "nothing to adjust": what the party holds and owes didn't load.
            <EmptyState
              icon="cloud-off-outline"
              title={tr('common:table.loadFailed')}
              message={tr('common:documentList.loadFailedBody')}
              actionLabel={tr('common:action.retry')}
              onAction={() => void data.refetch()}
              compact
            />
          ) : !credits.length ? (
            <EmptyState icon="swap-horizontal" title={tr('books:adjust.noCredit')} message={tr('books:adjust.emptyHint')} compact />
          ) : (
            <>
              <Columns
                left={
                  <FormSection title={tr('books:adjust.credits')}>
                    <Card padded={false}>
                      {credits.map((c) => {
                        const key = `${c.sourceType}:${c.id}`;
                        return row(
                          key,
                          c.number,
                          `${tr(c.sourceType === 'note' ? 'books:adjust.note' : side === 'customer' ? 'books:adjust.advance' : 'books:adjust.advancePaid')} · ${formatDate(c.date)}`,
                          // A service advance with GST: what is left to adjust (GST included), and
                          // under it what the customer paid and the GST in that, taken back in the return (11B).
                          <View style={{ alignItems: 'flex-end', gap: 2 }}>
                            <Text variant="small" weight="700">{formatMoney(c.left as Money)}</Text>
                            {c.gst && c.total ? (
                              <>
                                <Text variant="caption" tone="muted">
                                  {tr('books:adjust.paidWithGst', { paid: formatMoney(c.total as Money), gst: formatMoney(c.gst as Money) })}
                                </Text>
                                <Badge label={tr('books:adjust.toAdjust', { amount: formatMoney(c.left as Money) })} tone="info" size="sm" />
                              </>
                            ) : serviceAdvance(c) ? (
                              <Badge label={tr('books:adjust.gst')} tone="info" size="sm" />
                            ) : null}
                          </View>,
                          { selected: creditKeys.includes(key), onPress: () => pick(key), multi: true },
                        );
                      })}
                    </Card>
                  </FormSection>
                }
                right={
                  <FormSection title={tr('books:adjust.open')}>
                    <Card padded={false}>
                      {/* The party's advances still show on the left; here, that there is nothing yet to put them on. */}
                      {!shownOpen.length ? (
                        <Text variant="small" tone="muted" style={{ padding: t.spacing.lg }}>
                          {tr('books:adjust.noServiceInvoices')}
                        </Text>
                      ) : null}
                      {shownOpen.map((o) =>
                        row(
                          o.documentId,
                          o.number,
                          `${kindLabel(o.kind)} · ${formatDate(o.date)}`,
                          <Text variant="small" weight="700">{formatMoney(o.outstanding as Money)}</Text>,
                          {
                            // A tap fills a document not yet given an amount; one already typed is left as it is.
                            onPress: chosen ? () => toggle(o.documentId) : undefined,
                            selected: !!amounts[o.documentId],
                            multi: true,
                            extra: chosen ? (
                              <AmountField label={tr('books:adjust.amountFor', { number: o.number })} value={amounts[o.documentId] ?? ''} onChangeValue={(v) => setAmounts((a) => ({ ...a, [o.documentId]: v }))} currency={baseCurrency} />
                            ) : null,
                          },
                        ),
                      )}
                    </Card>
                  </FormSection>
                }
              />
              {!shownOpen.length ? null : chosen ? (
                <>
                  {over ? (
                    <Text variant="caption" tone="bad">
                      {tr('books:adjust.over', { amount: formatMoney(money(chosenLeft, baseCurrency)) })}
                    </Text>
                  ) : null}
                  <Button title={tr('books:adjust.applyChosen', { amount: formatMoney(money(typedTotal, baseCurrency)) })} onPress={applyChosen} loading={busy} disabled={busy || !typed.length || over} fullWidth={!desktop} style={desktop ? { alignSelf: 'flex-start' } : undefined} />
                </>
              ) : (
                <>
                  <Button title={tr('books:adjust.applyAll')} icon="sort-calendar-ascending" onPress={() => void apply()} loading={busy} disabled={busy} fullWidth={!desktop} style={desktop ? { alignSelf: 'flex-start' } : undefined} />
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
        // Only parties holding an advance (or a credit note) to adjust.
        options={(search.data ?? []).filter((p) => ((p.advance as Money | undefined)?.minor ?? 0) > 0).map((p) => ({ value: p.id!, label: p.name!, description: p.phone ?? p.code }))}
        onQueryChange={setQuery}
        loading={search.isFetching}
        value={partyId}
        onSelect={(id) => {
          setPartyId(id);
          setCreditKeys([]);
          setAmounts({});
        }}
      />
    </View>
  );
}
