/**
 * ImportFlow: a spreadsheet import in three steps — choose a file, match its
 * columns to the fields, check the rows and import them. Generic over the
 * record type `T` it builds; bank statements use it, and items can.
 *
 * Props
 * - `title`: the import's name, at the top ("Import a bank statement").
 * - `hint?`: a line under it saying what the file should hold.
 * - `accept`: the file kinds taken, as extensions: ['.csv', '.xlsx'].
 * - `parseRemote?(fileName, base64)`: turns a non-CSV file into rows of text (the
 *   server's parser). A CSV is always read on the device (core `parseCsv`);
 *   without `parseRemote` only CSVs can be imported.
 * - `fields`: `{ key, label, required? }[]`, the things read from each row. Each
 *   becomes a picker of the file's columns; required ones are starred and must
 *   be mapped before the rows can be checked.
 * - `detect(rows)`: `{ headerRow, mapping }`, the header row's index (−1 for none)
 *   and the column each field is in, to prefill the pickers.
 * - `validateMapping?(mapping)`: a rule across fields ("an amount, or debit and
 *   credit"): a message to show, or undefined when the mapping will do.
 * - `toRecords(rows, headerRow, mapping)`: `{ records, errors }`, the rows read
 *   with the chosen mapping; `errors` are `{ row, message }` with spreadsheet
 *   (1-based) row numbers, shown and left out.
 * - `columns`: the preview's columns, `{ key, label, render(record) => string,
 *   align?, tone?(record) => 'good' | 'bad' | undefined }`. On a phone the first
 *   is a small line above, the second the title, the last on the right and any
 *   between under the title.
 * - `onDryRun?(records, fileName)`: asks the server what an import would do, without saving:
 *   `{ summary, rowFlags? }`, a sentence for the counts and a flag per record
 *   (e.g. "Already imported"). When given, it must run before Import is offered.
 * - `onConfirm(records, fileName)`: imports. Throw to stay on the preview with the error
 *   toasted; on success the caller moves on (a toast, back to its list).
 * - `confirmLabel?(count)`: the import button's text for `count` records.
 * - `maxRecords?`: more than this and the file must be split (default 10 000).
 * - `maxBytes?`: the largest file taken (default 5 MB).
 * - `options?`: choices that shape how rows are read (e.g. the contact type for rows that
 *   don't say), shown above the file button on the first step.
 *
 * The phone apps can't pick files yet (no document picker in the store build),
 * so there the flow only says to import from a computer, on the web.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { SHOW_SCROLLBAR, WIDE_FORM_MAX_WIDTH, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { PickerField } from '@esmart/ui/components/Field';
import { FormContainer } from '@esmart/ui/components/Layout';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Stepper } from '@esmart/ui/components/Stepper';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { parseCsv } from '@esmart/core/lib/csv';
import { describeError } from '../../remote/errors';
import { CAN_PICK_FILES, pickFile } from './pickFile';
import { accepts, assignColumn, fileColumns, initialMapping, missingRequired, readsOnDevice, trimRows, type ColumnMapping, type ImportField, type RowIssue } from './importMapping';

export type { ColumnMapping, ImportField, RowIssue } from './importMapping';

export type ImportColumn<T> = {
  key: string;
  label: string;
  render: (record: T) => string;
  align?: 'left' | 'right';
  tone?: (record: T) => 'good' | 'bad' | undefined;
};

export type DryRunResult = { summary: string; rowFlags?: (string | undefined)[] };

export type ImportFlowProps<T> = {
  title: string;
  hint?: string;
  accept: string[];
  parseRemote?: (fileName: string, base64: string) => Promise<string[][]>;
  fields: ImportField[];
  detect: (rows: string[][]) => { headerRow: number; mapping: Partial<ColumnMapping> };
  validateMapping?: (mapping: ColumnMapping) => string | undefined;
  toRecords: (rows: string[][], headerRow: number, mapping: ColumnMapping) => { records: T[]; errors: RowIssue[] };
  columns: ImportColumn<T>[];
  onDryRun?: (records: T[], fileName: string) => Promise<DryRunResult>;
  onConfirm: (records: T[], fileName: string) => Promise<void>;
  confirmLabel?: (count: number) => string;
  maxRecords?: number;
  maxBytes?: number;
  options?: React.ReactNode;
};

/** How many preview rows and problems are drawn; the counts cover them all. */
const SHOWN = 200;

export function ImportFlow<T>({
  title,
  hint,
  accept,
  parseRemote,
  fields,
  detect,
  validateMapping,
  toRecords,
  columns,
  onDryRun,
  onConfirm,
  confirmLabel,
  maxRecords = 10_000,
  maxBytes = 5 * 1024 * 1024,
  options,
}: ImportFlowProps<T>) {
  const t = useTheme();
  const desktop = useIsDesktop();
  // The steps' cards and buttons keep a form's width on a desktop; only the preview table spreads.
  const narrow = desktop ? { maxWidth: WIDE_FORM_MAX_WIDTH, width: '100%' as const } : undefined;
  const toast = useToast();
  const { t: tr } = useTranslation(['banking', 'common']);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [headerRow, setHeaderRow] = useState(-1);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [picking, setPicking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [dry, setDry] = useState<DryRunResult | null>(null);
  const [busy, setBusy] = useState<'check' | 'import' | null>(null);

  const kinds = accept.join(', ');
  const steps = [tr('banking:importFlow.step.file'), tr('banking:importFlow.step.columns'), tr('banking:importFlow.step.check')];

  const choose = async () => {
    setProblem(null);
    const file = await pickFile(accept);
    if (!file) return;
    if (!accepts(file.name, accept) || (!readsOnDevice(file.name) && !parseRemote)) return setProblem(tr('banking:importFlow.wrongType', { kinds }));
    if (file.size > maxBytes) return setProblem(tr('banking:importFlow.tooBig', { mb: Math.round(maxBytes / 1024 / 1024) }));
    setPicking(file.name);
    try {
      const read = readsOnDevice(file.name) ? parseCsv(await file.text()) : await parseRemote!(file.name, await file.base64());
      const got = trimRows(read.map((r) => r.map((c) => String(c ?? ''))));
      if (!got.length) return setProblem(tr('banking:importFlow.empty'));
      const found = detect(got);
      const width = fileColumns(got, found.headerRow, String).length;
      setFileName(file.name);
      setRows(got);
      setHeaderRow(found.headerRow);
      setMapping(initialMapping(fields, found.mapping, width));
      setDry(null);
      setStep(1);
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setPicking(null);
    }
  };

  const fileCols = useMemo(() => fileColumns(rows, headerRow, (n) => tr('banking:importFlow.column', { n })), [rows, headerRow, tr]);
  const sampleRow = rows[headerRow + 1] ?? [];
  const missing = missingRequired(fields, mapping);
  const mappingProblem = missing.length ? tr('banking:importFlow.missing', { fields: missing.map((f) => f.label).join(', ') }) : validateMapping?.(mapping);
  const parsed = useMemo(() => (step === 2 ? toRecords(rows, headerRow, mapping) : { records: [] as T[], errors: [] as RowIssue[] }), [step, rows, headerRow, mapping, toRecords]);
  const tooMany = parsed.records.length > maxRecords;
  const flags = dry?.rowFlags ?? [];
  const flagged = flags.filter(Boolean).length;
  const [openField, setOpenField] = useState<ImportField | null>(null);

  const changeMapping = (key: string, index: number | undefined) => {
    setMapping((m) => assignColumn(m, key, index));
    setDry(null);
  };

  const check = async () => {
    if (!onDryRun) return;
    setBusy('check');
    try {
      setDry(await onDryRun(parsed.records, fileName));
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    setBusy('import');
    try {
      await onConfirm(parsed.records, fileName);
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!CAN_PICK_FILES) {
    return (
      <View style={{ flex: 1, padding: t.spacing.lg, justifyContent: 'center' }}>
        <EmptyState icon="web" title={tr('banking:importFlow.webOnly')} message={tr('banking:importFlow.webOnlyBody', { kinds })} />
      </View>
    );
  }

  const previewTable = desktop ? (
    <DataTable
      scroll={false}
      pageSize={25}
      columns={[
        { key: 'row', header: tr('banking:importFlow.row'), width: 72, render: (r: { record: T; index: number; row: number }) => <Cell tone="muted" mono>{r.row || '—'}</Cell> },
        ...columns.map((c) => ({
          key: c.key,
          header: c.label,
          flex: c.align === 'right' ? 1 : 1.5,
          align: c.align,
          render: (r: { record: T; index: number }) => (
            <Cell tone={c.tone?.(r.record) ?? 'default'} mono={c.align === 'right'}>
              {c.render(r.record)}
            </Cell>
          ),
        })),
        ...(flags.length
          ? [{ key: 'flag', header: tr('banking:importFlow.status'), width: 160, render: (r: { index: number }) => (flags[r.index] ? <Badge label={flags[r.index]!} tone="warning" size="sm" /> : <Badge label={tr('banking:importFlow.ready')} tone="success" size="sm" />) }]
          : []),
      ]}
      rows={parsed.records.map((record, index) => ({ record, index, row: (record as { row?: number }).row ?? 0 }))}
      rowKey={(r) => String(r.index)}
    />
  ) : (
    <Card padded={false}>
      {parsed.records.slice(0, SHOWN).map((record, i, shown) => {
        const [first, second, ...rest] = columns;
        const last = rest.length ? rest[rest.length - 1] : undefined;
        const middle = rest.slice(0, -1);
        return (
          <View
            key={i}
            style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, padding: t.spacing.md, borderBottomWidth: i < shown.length - 1 ? 0.5 : 0, borderBottomColor: t.c.line }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              {first && second ? (
                <Text variant="caption" tone="muted">
                  {first.render(record)}
                </Text>
              ) : null}
              <Text variant="small" weight="600" numberOfLines={2}>
                {(second ?? first)?.render(record)}
              </Text>
              {middle.length ? (
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {middle.map((c) => c.render(record)).filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              {flags[i] ? <Badge label={flags[i]!} tone="warning" size="sm" style={{ alignSelf: 'flex-start' }} /> : null}
            </View>
            {last ? (
              <Text variant="small" weight="700" tone={last.tone?.(record) ?? 'default'} style={{ fontVariant: ['tabular-nums'] }}>
                {last.render(record)}
              </Text>
            ) : null}
          </View>
        );
      })}
    </Card>
  );

  return (
    <FormContainer style={{ maxWidth: '100%' }}>
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg, paddingBottom: t.spacing.xxxl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <View style={[{ gap: t.spacing.lg }, narrow]}>
          <View style={{ gap: t.spacing.xs }}>
            <Text variant="h3" weight="700">
              {title}
            </Text>
            {hint ? (
              <Text variant="small" tone="muted">
                {hint}
              </Text>
            ) : null}
          </View>
          <Stepper steps={steps} current={step} />
        </View>

        {step === 0 ? (
          <Card style={[{ gap: t.spacing.md }, narrow]}>
            {options}
            <Text variant="small" tone="muted">
              {tr('banking:importFlow.kinds', { kinds })}
            </Text>
            <Button title={picking ? tr('banking:importFlow.reading', { name: picking }) : tr('banking:importFlow.choose')} icon="upload" onPress={() => void choose()} loading={!!picking} disabled={!!picking} fullWidth={!desktop} />
            {problem ? (
              <Text variant="caption" tone="bad" role="alert">
                {problem}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {step === 1 ? (
          <View style={[{ gap: t.spacing.lg }, narrow]}>
            <Card style={{ gap: t.spacing.md }}>
              <Text variant="small" tone="muted">
                {headerRow >= 0 ? tr('banking:importFlow.headerAt', { name: fileName, row: headerRow + 1, count: rows.length - headerRow - 1 }) : tr('banking:importFlow.noHeader', { name: fileName, count: rows.length })}
              </Text>
              {/* Two fields to a row on a desktop, each with a sample from the file under it. */}
              <View style={desktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.md } : { gap: t.spacing.md }}>
                {fields.map((f) => {
                  const col = mapping[f.key];
                  return (
                    <View key={f.key} style={desktop ? { flexBasis: '45%', flexGrow: 1 } : undefined}>
                      <PickerField
                        label={f.label}
                        required={f.required}
                        value={col !== undefined ? fileCols[col]?.label : undefined}
                        placeholder={tr('banking:importFlow.notInFile')}
                        hint={col !== undefined && sampleRow[col] ? tr('banking:importFlow.sample', { value: sampleRow[col] }) : undefined}
                        onPress={() => setOpenField(f)}
                        clearable={col !== undefined && !f.required}
                        onClear={() => changeMapping(f.key, undefined)}
                      />
                    </View>
                  );
                })}
              </View>
              {mappingProblem ? (
                <Text variant="caption" tone="bad" role="alert">
                  {mappingProblem}
                </Text>
              ) : null}
            </Card>
            <View style={[{ flexDirection: 'row', gap: t.spacing.md }, desktop && { justifyContent: 'flex-end' }]}>
              <Button title={tr('banking:importFlow.otherFile')} variant="ghost" onPress={() => setStep(0)} style={desktop ? undefined : { flex: 1 }} />
              <Button title={tr('banking:importFlow.next')} onPress={() => setStep(2)} disabled={!!mappingProblem} style={desktop ? undefined : { flex: 1 }} />
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <>
            <Card style={[{ gap: t.spacing.xs }, narrow]}>
              <Text variant="body" weight="600">
                {tr('banking:importFlow.counts', { count: parsed.records.length, problems: parsed.errors.length })}
              </Text>
              {dry ? (
                <Text variant="small" tone={flagged ? 'warn' : 'good'} role="status">
                  {dry.summary}
                </Text>
              ) : onDryRun ? (
                <Text variant="small" tone="muted">
                  {tr('banking:importFlow.checkFirst')}
                </Text>
              ) : null}
              {tooMany ? (
                <Text variant="caption" tone="bad" role="alert">
                  {tr('banking:importFlow.tooMany', { max: maxRecords })}
                </Text>
              ) : null}
            </Card>

            {parsed.errors.length ? (
              <View style={[{ gap: t.spacing.sm }, narrow]}>
                <Text variant="caption" tone="muted" weight="600">
                  {tr('banking:importFlow.skipped')}
                </Text>
                <Card padded={false}>
                  {parsed.errors.slice(0, SHOWN).map((e, i, shown) => (
                    <View key={`${e.row}-${i}`} style={{ flexDirection: 'row', gap: t.spacing.md, padding: t.spacing.md, borderBottomWidth: i < shown.length - 1 ? 0.5 : 0, borderBottomColor: t.c.line }}>
                      <Text variant="caption" tone="muted" style={{ minWidth: 64 }}>
                        {e.row > 0 ? tr('banking:importFlow.rowNo', { row: e.row }) : '—'}
                      </Text>
                      <Text variant="caption" tone="bad" style={{ flex: 1 }}>
                        {e.message}
                      </Text>
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}

            {parsed.records.length ? previewTable : <EmptyState icon="file-alert-outline" title={tr('banking:importFlow.nothing')} message={tr('banking:importFlow.nothingBody')} compact />}
            {!desktop && parsed.records.length > SHOWN ? (
              <Text variant="caption" tone="muted">
                {tr('banking:importFlow.more', { count: parsed.records.length - SHOWN })}
              </Text>
            ) : null}

            <View style={[{ flexDirection: 'row', gap: t.spacing.md, flexWrap: 'wrap' }, desktop && { justifyContent: 'flex-end' }]}>
              <Button title={tr('banking:importFlow.back')} variant="ghost" onPress={() => setStep(1)} disabled={!!busy} style={desktop ? undefined : { flex: 1, minWidth: 120 }} />
              {onDryRun ? (
                <Button
                  title={tr('banking:importFlow.check')}
                  variant="secondary"
                  onPress={() => void check()}
                  loading={busy === 'check'}
                  disabled={!!busy || !parsed.records.length || tooMany}
                  style={desktop ? undefined : { flex: 1, minWidth: 120 }}
                />
              ) : null}
              <Button
                title={confirmLabel ? confirmLabel(parsed.records.length) : tr('banking:importFlow.import', { count: parsed.records.length })}
                onPress={() => void confirm()}
                loading={busy === 'import'}
                disabled={!!busy || !parsed.records.length || tooMany || (!!onDryRun && !dry)}
                style={desktop ? undefined : { flex: 1, minWidth: 120 }}
              />
            </View>
          </>
        ) : null}
      </ScrollView>

      <SelectSheet
        visible={!!openField}
        onClose={() => setOpenField(null)}
        title={openField?.label ?? ''}
        options={[
          ...(openField?.required ? [] : [{ value: '', label: tr('banking:importFlow.notInFile') }]),
          ...fileCols.map((c) => ({ value: String(c.index), label: c.label, description: sampleRow[c.index] ? tr('banking:importFlow.sample', { value: sampleRow[c.index] }) : undefined })),
        ]}
        value={openField && mapping[openField.key] !== undefined ? String(mapping[openField.key]) : ''}
        onSelect={(v) => {
          if (openField) changeMapping(openField.key, v === '' ? undefined : Number(v));
          setOpenField(null);
        }}
      />
    </FormContainer>
  );
}
