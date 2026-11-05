import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { TextField } from '@esmart/ui/components/Field';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { FormContainer } from '@esmart/ui/components/Layout';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { parseCsv } from '@esmart/core/lib/csv';
import { guessItemColumns, itemsFromCsv, type ItemImportRow } from '@esmart/core/domain/itemImport';
import { formatMoney, formatPercent } from '@esmart/core/lib/format';
import { today } from '@esmart/core/lib/date';
import { api } from '../../remote/api';
import { describeError } from '../../remote/errors';
import { syncSoon } from '../../remote/sync';
import { pickCsvOnWeb } from '../../components/pickCsv';
import { useBaseCurrency, useHasModule, useTaxCategories } from '../../store/selectors';
import { useAppStore } from '../../store/appStore';

type Outcome = { index: number; status: 'created' | 'duplicate' | 'invalid'; issues?: { message?: string }[] };
/** A sample of the sheet: column names as spreadsheets have them, in English in every language. */
const SAMPLE_CSV = ['Name,SKU,Unit,Sale price,Purchase price,GST %,HSN,Opening stock', 'Ball Bearing 6203,BRG-6203,Nos,250,180,18,84821011,40'].join('\n');

/**
 * Items from a spreadsheet, as contacts are: read on the device (core/domain/itemImport), checked
 * by the server without saving (a dry run), then created in one go, opening stock and all. Rows the
 * sheet gets wrong, and items already in the book (same SKU, barcode or name), are shown and left out.
 */
export function ImportItems() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { t: tr } = useTranslation(['inventory', 'common']);
  const companyId = useAppStore((s) => s.activeCompanyId);
  const currency = useBaseCurrency();
  const taxCategories = useTaxCategories();
  const tracksStock = useHasModule('inventory');
  const [text, setText] = useState('');
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [busy, setBusy] = useState(false);

  // Read on every change: the preview shows what the sheet holds before anything is sent.
  const parsed = useMemo(() => {
    const rows = parseCsv(text);
    if (rows.length < 2) return { rows: [] as ItemImportRow[], columns: {} as ReturnType<typeof guessItemColumns> };
    const columns = guessItemColumns(rows[0]);
    return { rows: itemsFromCsv(rows, columns, { currency, taxCategories, trackInventory: tracksStock, openingStockDate: today() }), columns };
  }, [text, currency, taxCategories, tracksStock]);
  const good = parsed.rows.filter((r) => r.item);
  const noName = parsed.rows.length > 0 && parsed.columns.name === undefined;
  const changeText = (v: string) => {
    setText(v);
    setOutcomes(null);
  };

  const send = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const { data, error } = await api.POST('/companies/{companyId}/items/import', {
        params: { path: { companyId } },
        body: { rows: good.map((r) => r.item!) as never, dryRun },
      });
      if (error || !data) throw error ?? new Error('No answer from the server');
      setOutcomes((data.results ?? []) as Outcome[]);
      if (!dryRun) {
        syncSoon();
        toast.show(tr('inventory:import.done', { count: data.created ?? 0 }), 'success', {
          icon: 'tag-check-outline',
          detail: tr('inventory:import.skipped', { count: (data.skipped ?? 0) + (data.invalid ?? 0) }),
        });
        router.replace('/(app)/catalog/items');
      }
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(false);
    }
  };

  const outcomeOf = (goodIndex: number) => outcomes?.find((o) => o.index === goodIndex);
  const willCreate = outcomes ? outcomes.filter((o) => o.status === 'created').length : good.length;
  const taxRate = (id: string) => taxCategories.find((c) => c.id === id)?.rate ?? 0;

  return (
    <FormContainer>
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg, paddingBottom: t.spacing.xxxl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Text variant="small" tone="muted">
          {tr('inventory:import.hint')}
        </Text>
        {Platform.OS === 'web' ? (
          <Button
            title={tr('inventory:import.chooseFile')}
            icon="upload"
            variant="secondary"
            onPress={() =>
              void pickCsvOnWeb().then((csv) => {
                if (csv !== null) changeText(csv);
              })
            }
          />
        ) : null}
        <TextField label={tr('inventory:import.paste')} value={text} onChangeText={changeText} placeholder={SAMPLE_CSV} multiline autoCapitalize="none" />

        {noName ? (
          <Text variant="caption" tone="bad">
            {tr('inventory:import.noNameColumn')}
          </Text>
        ) : null}

        {parsed.rows.length ? (
          <>
            <Text variant="body" weight="600">
              {tr('inventory:import.summary', { total: parsed.rows.length, good: good.length })}
            </Text>
            <Card padded={false}>
              {parsed.rows.slice(0, 200).map((r, i) => {
                const outcome = r.item ? outcomeOf(good.indexOf(r)) : undefined;
                const problems = r.problems.length ? r.problems : (outcome?.issues ?? []).map((x) => x.message ?? '');
                const status = !r.item ? 'invalid' : outcome?.status;
                const it = r.item;
                return (
                  <ListRow
                    key={r.line}
                    title={it?.name ?? tr('inventory:import.line', { line: r.line })}
                    subtitle={
                      problems.length
                        ? problems.join(' · ')
                        : [it?.sku, it?.unit, it ? formatMoney(it.salePrice) : '', it ? formatPercent(taxRate(it.taxCategoryId)) : '', it?.openingStock ? `${it.openingStock} ${it.unit}` : '']
                            .filter(Boolean)
                            .join(' · ')
                    }
                    right={
                      status === 'invalid' ? (
                        <Badge label={tr('inventory:import.status.invalid')} tone="danger" size="sm" />
                      ) : status === 'duplicate' ? (
                        <Badge label={tr('inventory:import.status.duplicate')} tone="warning" size="sm" />
                      ) : status === 'created' ? (
                        <Badge label={tr('inventory:import.status.ready')} tone="success" size="sm" />
                      ) : null
                    }
                    divider={i < Math.min(parsed.rows.length, 200) - 1}
                  />
                );
              })}
            </Card>
            {parsed.rows.length > 200 ? (
              <Text variant="caption" tone="muted">
                {tr('inventory:import.more', { count: parsed.rows.length - 200 })}
              </Text>
            ) : null}
          </>
        ) : null}

        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Button title={tr('inventory:import.check')} variant="secondary" onPress={() => void send(true)} loading={busy && !outcomes} disabled={busy || !good.length || good.length > 1000} style={{ flex: 1 }} />
          <Button
            title={tr('inventory:import.import', { count: willCreate })}
            onPress={() => void send(false)}
            loading={busy && !!outcomes}
            // Checked first, so the count on the button is what the server will create.
            disabled={busy || !outcomes || !willCreate}
            style={{ flex: 1 }}
          />
        </View>
        {good.length > 1000 ? (
          <Text variant="caption" tone="bad">
            {tr('inventory:import.tooMany')}
          </Text>
        ) : null}
      </ScrollView>
    </FormContainer>
  );
}
