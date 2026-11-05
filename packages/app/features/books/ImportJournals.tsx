import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { SwitchField, TextField } from '@esmart/ui/components/Field';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { FormContainer } from '@esmart/ui/components/Layout';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { parseCsv } from '@esmart/core/lib/csv';
import { guessJournalColumns, journalsFromCsv } from '@esmart/core/domain/journalImport';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { api } from '../../remote/api';
import { describeError } from '../../remote/errors';
import { useServerBook } from '../../remote/queries';
import { useBaseCurrency } from '../../store/selectors';
import { useAppStore } from '../../store/appStore';
import { CAN_PICK_FILES, pickFile } from '../import/pickFile';
import { useAccountName } from './names';

type Outcome = { index: number; status: 'created' | 'invalid'; number?: string; issues?: { message?: string }[] };
/** Column names as spreadsheets have them, in English in every language. */
const SAMPLE_CSV = ['Date,Reference,Account,Debit,Credit,Narration', '31/03/2026,JV-1,Rent,25000,,March rent', '31/03/2026,JV-1,Cash,,25000,'].join('\n');

/**
 * Journals from a spreadsheet, one row per line, rows sharing a reference making one journal. Read on
 * the device (core/domain/journalImport), checked by the server without saving, then saved in one go,
 * posted or kept as drafts.
 */
export function ImportJournals() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { t: tr } = useTranslation(['books', 'common']);
  const companyId = useAppStore((s) => s.activeCompanyId);
  const currency = useBaseCurrency();
  const { accounts } = useServerBook();
  const accountName = useAccountName();
  const [text, setText] = useState('');
  const [asDrafts, setAsDrafts] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [busy, setBusy] = useState(false);

  // Accounts by their English name and by the name the reader sees, so either kind of sheet matches.
  const names = useMemo(() => accounts.flatMap((a) => [{ key: a.key, name: a.name }, { key: a.key, name: accountName(a) }]), [accounts, accountName]);
  const parsed = useMemo(() => {
    const rows = parseCsv(text);
    if (rows.length < 2) return { journals: [], columns: {} as ReturnType<typeof guessJournalColumns> };
    const columns = guessJournalColumns(rows[0]);
    return { journals: journalsFromCsv(rows, columns, names, currency), columns };
  }, [text, names, currency]);
  // A draft may be unbalanced; anything else the sheet gets wrong stops the journal.
  const usable = (problems: string[]) => (asDrafts ? problems.filter((p) => !p.startsWith('Debits (')) : problems).length === 0;
  const good = parsed.journals.filter((j) => usable(j.problems) && j.lines.length);
  const missing = parsed.journals.length > 0 && (parsed.columns.account === undefined || parsed.columns.date === undefined);

  const send = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const { data, error } = await api.POST('/companies/{companyId}/vouchers/import', {
        params: { path: { companyId } },
        body: {
          dryRun,
          asDrafts,
          vouchers: good.map((j) => ({
            kind: 'journal' as const,
            date: j.date,
            ...(j.reference && { reference: j.reference }),
            ...(j.narration && { narration: j.narration }),
            lines: j.lines.map((l) => ({ account: l.account, debit: money(l.debitMinor, currency), credit: money(l.creditMinor, currency), ...(l.narration && { narration: l.narration }) })),
          })),
        },
      });
      if (error || !data) throw error ?? new Error('No answer from the server');
      setOutcomes((data.results ?? []) as Outcome[]);
      if (!dryRun) {
        toast.show(tr('books:journalImport.done', { count: data.created ?? 0 }), 'success', { icon: 'swap-horizontal' });
        router.replace('/(app)/books/vouchers' as never);
      }
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(false);
    }
  };

  const outcomeOf = (goodIndex: number) => outcomes?.find((o) => o.index === goodIndex);
  const willCreate = outcomes ? outcomes.filter((o) => o.status === 'created').length : good.length;
  const reset = () => setOutcomes(null);

  return (
    <FormContainer>
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg, paddingBottom: t.spacing.xxxl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Text variant="small" tone="muted">
          {tr('books:journalImport.hint')}
        </Text>
        <SwitchField label={tr('books:journalImport.asDrafts')} description={tr('books:journalImport.asDraftsHint')} value={asDrafts} onValueChange={(v) => { setAsDrafts(v); reset(); }} />
        {CAN_PICK_FILES ? (
          <Button
            title={tr('books:journalImport.chooseFile')}
            icon="upload"
            variant="secondary"
            onPress={() =>
              void pickFile(['.csv']).then(async (file) => {
                if (!file) return;
                setText(await file.text());
                reset();
              })
            }
          />
        ) : null}
        <TextField label={tr('books:journalImport.paste')} value={text} onChangeText={(v) => { setText(v); reset(); }} placeholder={SAMPLE_CSV} multiline autoCapitalize="none" />

        {missing ? (
          <Text variant="caption" tone="bad">
            {tr('books:journalImport.missingColumns')}
          </Text>
        ) : null}

        {parsed.journals.length ? (
          <>
            <Text variant="body" weight="600">
              {tr('books:journalImport.summary', { total: parsed.journals.length, good: good.length })}
            </Text>
            <Card padded={false}>
              {parsed.journals.slice(0, 200).map((j, i) => {
                const ok = good.includes(j);
                const outcome = ok ? outcomeOf(good.indexOf(j)) : undefined;
                const problems = !ok ? j.problems : (outcome?.issues ?? []).map((x) => x.message ?? '');
                const status = !ok ? 'invalid' : outcome?.status;
                const amount = j.lines.reduce((a, l) => a + l.debitMinor, 0);
                return (
                  <ListRow
                    key={j.line}
                    title={j.reference || tr('books:journalImport.line', { line: j.line })}
                    subtitle={problems.length ? problems.join(' · ') : [j.date, j.narration, tr('books:journalImport.lines', { count: j.lines.length })].filter(Boolean).join(' · ')}
                    right={
                      status === 'invalid' ? (
                        <Badge label={tr('books:journalImport.status.invalid')} tone="danger" size="sm" />
                      ) : status === 'created' ? (
                        <Badge label={tr('books:journalImport.status.ready')} tone="success" size="sm" />
                      ) : (
                        <Text variant="mono">
                          {formatMoney(money(amount, currency))}
                        </Text>
                      )
                    }
                    divider={i < Math.min(parsed.journals.length, 200) - 1}
                  />
                );
              })}
            </Card>
          </>
        ) : null}

        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Button title={tr('books:journalImport.check')} variant="secondary" onPress={() => void send(true)} loading={busy && !outcomes} disabled={busy || !good.length || good.length > 500} style={{ flex: 1 }} />
          <Button title={tr('books:journalImport.import', { count: willCreate })} onPress={() => void send(false)} loading={busy && !!outcomes} disabled={busy || !outcomes || !willCreate} style={{ flex: 1 }} />
        </View>
        {good.length > 500 ? (
          <Text variant="caption" tone="bad">
            {tr('books:journalImport.tooMany')}
          </Text>
        ) : null}
      </ScrollView>
    </FormContainer>
  );
}
