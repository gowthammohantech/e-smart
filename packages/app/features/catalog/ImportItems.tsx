import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { customFieldColumns, guessItemColumns, itemsFromCsv, type ImportedItem, type ItemImportField, type ItemImportRow } from '@esmart/core/domain/itemImport';
import type { CustomField } from '@esmart/core/domain/customFields';
import { ImportFlow, type ColumnMapping, type ImportColumn } from '../import/ImportFlow';
import { formatMoney, formatPercent } from '@esmart/core/lib/format';
import { today } from '@esmart/core/lib/date';
import { api } from '../../remote/api';
import { describeError } from '../../remote/errors';
import { refreshSoon } from '../../remote/refresh';
import { pickCsvOnWeb } from '../../components/pickCsv';
import { useBaseCurrency, useHasModule, useTaxCategories } from '../../store/selectors';
import { useAppStore } from '../../store/appStore';
import { useCustomFields } from '../customFields/CustomFieldsSection';

type Outcome = { index: number; status: 'created' | 'duplicate' | 'invalid'; issues?: { message?: string }[] };
/** A sample of the sheet: column names as spreadsheets have them, in English in every language; the business's own item fields after them. */
const sampleCsv = (custom: CustomField[]) =>
  [['Name,SKU,Unit,Sale price,Purchase price,GST %,HSN,Opening stock', ...custom.map((f) => f.label)].join(','), ['Ball Bearing 6203,BRG-6203,Nos,250,180,18,84821011,40', ...custom.map(() => '')].join(',')].join('\n');
/** The hint, with the columns the business's own fields are read from. */
const withCustomHint = (hint: string, custom: CustomField[], line: (labels: string) => string) => (custom.length ? `${hint} ${line(custom.map((f) => f.label).join(', '))}` : hint);

const ITEM_FIELDS: ItemImportField[] = ['name', 'sku', 'type', 'unit', 'salePrice', 'purchasePrice', 'taxRate', 'hsnCode', 'barcode', 'openingStock', 'reorderLevel', 'description'];
type ItemRecord = ImportedItem & { row: number };

/**
 * On the web: the shared ImportFlow (choose the file, match its columns, check, import). Phones keep
 * the paste screen below until ImportFlow can pick a file there.
 */
export function ImportItems() {
  return Platform.OS === 'web' ? <ImportItemsFlow /> : <ImportItemsPaste />;
}

function ImportItemsFlow() {
  const { t: tr } = useTranslation(['inventory', 'common']);
  const router = useRouter();
  const toast = useToast();
  const companyId = useAppStore((s) => s.activeCompanyId);
  const currency = useBaseCurrency();
  const taxCategories = useTaxCategories();
  const tracksStock = useHasModule('inventory');
  const customFields = useCustomFields('item');
  // Which of the business's own fields the file has a column for (by header), kept for the request.
  const customColumns = useRef<Record<string, number>>({});

  const fields = useMemo(() => ITEM_FIELDS.map((key) => ({ key, label: tr(`inventory:import.field.${key}`), required: key === 'name' })), [tr]);
  const detect = useCallback((rows: string[][]) => ({ headerRow: 0, mapping: guessItemColumns(rows[0] ?? []) }), []);
  const toRecords = useCallback(
    (rows: string[][], headerRow: number, mapping: ColumnMapping) => {
      customColumns.current = headerRow >= 0 ? customFieldColumns(rows[headerRow] ?? [], customFields) : {};
      // itemsFromCsv reads the row after its first as data: hand it the header and what follows.
      const read = itemsFromCsv(rows.slice(Math.max(headerRow, 0)), mapping as Partial<Record<ItemImportField, number>>, {
        currency,
        taxCategories,
        trackInventory: tracksStock,
        openingStockDate: today(),
        customFields: { fields: customFields, columns: customColumns.current },
      });
      const offset = Math.max(headerRow, 0);
      return {
        records: read.filter((r) => r.item).map((r) => ({ ...r.item!, row: r.line + offset })),
        errors: read.filter((r) => !r.item).map((r) => ({ row: r.line + offset, message: r.problems.join(' · ') })),
      };
    },
    [currency, taxCategories, tracksStock, customFields],
  );
  const taxRate = useCallback((id: string) => taxCategories.find((c) => c.id === id)?.rate ?? 0, [taxCategories]);
  const columns = useMemo<ImportColumn<ItemRecord>[]>(
    () => [
      { key: 'sku', label: tr('common:table.sku'), render: (i) => i.sku },
      { key: 'name', label: tr('common:table.name'), render: (i) => i.name },
      { key: 'unit', label: tr('common:table.unit'), render: (i) => i.unit },
      { key: 'tax', label: tr('inventory:import.col.tax'), render: (i) => formatPercent(taxRate(i.taxCategoryId)) },
      { key: 'stock', label: tr('inventory:import.col.stock'), align: 'right', render: (i) => (i.openingStock ? `${i.openingStock} ${i.unit}` : '') },
      { key: 'price', label: tr('inventory:import.col.price'), align: 'right', render: (i) => formatMoney(i.salePrice) },
    ],
    [tr, taxRate],
  );

  const send = async (records: ItemRecord[], dryRun: boolean) => {
    const { data, error } = await api.POST('/companies/{companyId}/items/import', {
      params: { path: { companyId } },
      body: { rows: records.map(({ row: _row, ...item }) => item) as never, dryRun, customFieldColumns: Object.keys(customColumns.current) },
    });
    if (error || !data) throw error ?? new Error('No answer from the server');
    return data;
  };

  return (
    <ImportFlow<ItemRecord>
      title={tr('inventory:import.title')}
      hint={withCustomHint(tr('inventory:import.hint'), customFields, (labels) => tr('inventory:import.customColumns', { labels }))}
      accept={['.csv']}
      fields={fields}
      detect={detect}
      toRecords={toRecords}
      columns={columns}
      maxRecords={1000}
      onDryRun={async (records) => {
        const res = await send(records, true);
        return {
          // A required field the file has no column for: said here, the items are still created.
          summary: [tr('inventory:import.dryRun', { created: res.created ?? 0, skipped: res.skipped ?? 0, invalid: res.invalid ?? 0 }), ...(res.warnings ?? [])].join(' · '),
          rowFlags: (res.results ?? []).map((r) =>
            r.status === 'duplicate' ? tr('inventory:import.status.duplicate') : r.status === 'invalid' ? (r.issues ?? []).map((x) => x.message).join(' · ') : undefined,
          ),
        };
      }}
      onConfirm={async (records) => {
        const res = await send(records, false);
        refreshSoon();
        toast.show(tr('inventory:import.done', { count: res.created ?? 0 }), 'success', {
          icon: 'tag-check-outline',
          detail: tr('inventory:import.skipped', { count: (res.skipped ?? 0) + (res.invalid ?? 0) }),
        });
        router.replace('/(app)/catalog/items');
      }}
      confirmLabel={(count) => tr('inventory:import.import', { count })}
    />
  );
}

/**
 * Items from a spreadsheet, as contacts are: read on the device (core/domain/itemImport), checked
 * by the server without saving (a dry run), then created in one go, opening stock and all. Rows the
 * sheet gets wrong, and items already in the book (same SKU, barcode or name), are shown and left out.
 */
function ImportItemsPaste() {
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
  const customFields = useCustomFields('item');
  const [warnings, setWarnings] = useState<string[]>([]);

  // Read on every change: the preview shows what the sheet holds before anything is sent.
  const parsed = useMemo(() => {
    const rows = parseCsv(text);
    if (rows.length < 2) return { rows: [] as ItemImportRow[], columns: {} as ReturnType<typeof guessItemColumns>, custom: {} as Record<string, number> };
    const columns = guessItemColumns(rows[0]);
    const custom = customFieldColumns(rows[0], customFields);
    return { rows: itemsFromCsv(rows, columns, { currency, taxCategories, trackInventory: tracksStock, openingStockDate: today(), customFields: { fields: customFields, columns: custom } }), columns, custom };
  }, [text, currency, taxCategories, tracksStock, customFields]);
  const good = parsed.rows.filter((r) => r.item);
  const noName = parsed.rows.length > 0 && parsed.columns.name === undefined;
  const changeText = (v: string) => {
    setText(v);
    setOutcomes(null);
    setWarnings([]);
  };

  const send = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const { data, error } = await api.POST('/companies/{companyId}/items/import', {
        params: { path: { companyId } },
        body: { rows: good.map((r) => r.item!) as never, dryRun, customFieldColumns: Object.keys(parsed.custom) },
      });
      if (error || !data) throw error ?? new Error('No answer from the server');
      setOutcomes((data.results ?? []) as Outcome[]);
      setWarnings(data.warnings ?? []);
      if (!dryRun) {
        refreshSoon();
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
          {withCustomHint(tr('inventory:import.hint'), customFields, (labels) => tr('inventory:import.customColumns', { labels }))}
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
        <TextField label={tr('inventory:import.paste')} value={text} onChangeText={changeText} placeholder={sampleCsv(customFields)} multiline autoCapitalize="none" />

        {noName ? (
          <Text variant="caption" tone="bad">
            {tr('inventory:import.noNameColumn')}
          </Text>
        ) : null}

        {warnings.map((w) => (
          <Text key={w} variant="caption" tone="warn">
            {w}
          </Text>
        ))}

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
