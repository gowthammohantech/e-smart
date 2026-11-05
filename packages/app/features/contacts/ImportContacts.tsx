import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { Segmented, TextField } from '@esmart/ui/components/Field';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { FormContainer } from '@esmart/ui/components/Layout';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { guessColumns, parseCsv, partiesFromCsv, type ImportKind, type ImportRow } from '@esmart/core/domain/partyImport';
import { api } from '../../remote/api';
import { describeError } from '../../remote/errors';
import { syncSoon } from '../../remote/sync';
import { useBaseCurrency } from '../../store/selectors';
import { useAppStore } from '../../store/appStore';
import { useCustomFields } from '../customFields/CustomFieldsSection';
import { CAN_PICK_FILES, pickFile } from '../import/pickFile';

type Outcome = { index: number; status: 'created' | 'duplicate' | 'invalid'; issues?: { message?: string }[] };
const KINDS: ImportKind[] = ['customer', 'supplier', 'both', 'general'];
/** A sample of the sheet: column names as spreadsheets have them, in English in every language. */
const SAMPLE_CSV = ['Name,GSTIN,Phone,State,Opening Balance', 'Murugan Traders,33AAACM1234A1ZF,9840012345,Tamil Nadu,12500'].join('\n');

/**
 * Contacts from a spreadsheet: read on the device (core/domain/partyImport), checked by the server
 * without saving (a dry run), then created in one go. Rows the sheet gets wrong, and contacts already
 * in the book, are shown and left out.
 */
export function ImportContacts() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { t: tr } = useTranslation(['contacts', 'common']);
  const companyId = useAppStore((s) => s.activeCompanyId);
  const currency = useBaseCurrency();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<ImportKind>('customer');
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [busy, setBusy] = useState(false);
  // The company's contact fields: columns named after them fill them in.
  const contactFields = useCustomFields('party');

  // Read on every change: the preview shows what the sheet holds before anything is sent.
  const parsed = useMemo(() => {
    const rows = parseCsv(text);
    if (rows.length < 2) return { rows: [] as ImportRow[], columns: {} };
    const columns = guessColumns(rows[0]);
    return { rows: partiesFromCsv(rows, columns, { kind, currency }, contactFields), columns };
  }, [text, kind, currency, contactFields]);
  const good = parsed.rows.filter((r) => r.party);
  const noName = parsed.rows.length > 0 && parsed.columns.name === undefined;

  const send = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const { data, error } = await api.POST('/companies/{companyId}/parties/import', {
        params: { path: { companyId } },
        body: { rows: good.map((r) => r.party!) as never, dryRun },
      });
      if (error || !data) throw error ?? new Error('No answer from the server');
      setOutcomes((data.results ?? []) as Outcome[]);
      if (!dryRun) {
        syncSoon();
        toast.show(tr('contacts:import.done', { count: data.created ?? 0 }), 'success', { icon: 'account-check-outline', detail: tr('contacts:import.skipped', { count: parsed.rows.length - (data.created ?? 0) }) });
        router.replace('/(app)/(tabs)/contacts');
      }
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(false);
    }
  };

  const outcomeOf = (goodIndex: number) => outcomes?.find((o) => o.index === goodIndex);
  const willCreate = outcomes ? outcomes.filter((o) => o.status === 'created').length : good.length;

  return (
    <FormContainer>
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg, paddingBottom: t.spacing.xxxl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Text variant="small" tone="muted">
          {tr('contacts:import.hint')}
        </Text>
        <View style={{ gap: t.spacing.xs }}>
          <Text variant="caption" tone="muted" weight="600">
            {tr('contacts:import.defaultKind')}
          </Text>
          <Segmented options={KINDS.map((k) => ({ value: k, label: tr(`contacts:kind.${k}`) }))} value={kind} onChange={(v) => { setKind(v as ImportKind); setOutcomes(null); }} />
        </View>
        {CAN_PICK_FILES ? (
          <Button
            title={tr('contacts:import.chooseFile')}
            icon="upload"
            variant="secondary"
            onPress={() =>
              void pickFile(['.csv']).then(async (file) => {
                if (!file) return;
                setText(await file.text());
                setOutcomes(null);
              })
            }
          />
        ) : null}
        <TextField
          label={tr('contacts:import.paste')}
          value={text}
          onChangeText={(v) => { setText(v); setOutcomes(null); }}
          placeholder={SAMPLE_CSV}
          multiline
          autoCapitalize="none"
        />

        {noName ? (
          <Text variant="caption" tone="bad">
            {tr('contacts:import.noNameColumn')}
          </Text>
        ) : null}

        {parsed.rows.length ? (
          <>
            <Text variant="body" weight="600">
              {tr('contacts:import.summary', { total: parsed.rows.length, good: good.length })}
            </Text>
            <Card padded={false}>
              {parsed.rows.slice(0, 200).map((r, i) => {
                const outcome = r.party ? outcomeOf(good.indexOf(r)) : undefined;
                const problems = r.problems.length ? r.problems : (outcome?.issues ?? []).map((x) => x.message ?? '');
                const status = !r.party ? 'invalid' : outcome?.status;
                return (
                  <ListRow
                    key={r.line}
                    title={r.party?.name ?? tr('contacts:import.line', { line: r.line })}
                    subtitle={problems.length ? problems.join(' · ') : [r.party?.taxId, r.party?.billingAddress.state, tr(`contacts:kind.${r.party?.kind ?? kind}`)].filter(Boolean).join(' · ')}
                    right={
                      status === 'invalid' ? (
                        <Badge label={tr('contacts:import.status.invalid')} tone="danger" size="sm" />
                      ) : status === 'duplicate' ? (
                        <Badge label={tr('contacts:import.status.duplicate')} tone="warning" size="sm" />
                      ) : status === 'created' ? (
                        <Badge label={tr('contacts:import.status.ready')} tone="success" size="sm" />
                      ) : null
                    }
                    divider={i < Math.min(parsed.rows.length, 200) - 1}
                  />
                );
              })}
            </Card>
            {parsed.rows.length > 200 ? (
              <Text variant="caption" tone="muted">
                {tr('contacts:import.more', { count: parsed.rows.length - 200 })}
              </Text>
            ) : null}
          </>
        ) : null}

        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Button title={tr('contacts:import.check')} variant="secondary" onPress={() => void send(true)} loading={busy && !outcomes} disabled={busy || !good.length || good.length > 1000} style={{ flex: 1 }} />
          <Button
            title={tr('contacts:import.import', { count: willCreate })}
            onPress={() => void send(false)}
            loading={busy && !!outcomes}
            // Checked first, so the count on the button is what the server will create.
            disabled={busy || !outcomes || !willCreate}
            style={{ flex: 1 }}
          />
        </View>
        {good.length > 1000 ? (
          <Text variant="caption" tone="bad">
            {tr('contacts:import.tooMany')}
          </Text>
        ) : null}
      </ScrollView>
    </FormContainer>
  );
}
