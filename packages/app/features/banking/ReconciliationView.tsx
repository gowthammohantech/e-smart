import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { Text } from '@esmart/ui/components/Text';
import { formatDate, today } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import type { Money } from '@esmart/core/lib/money';
import { useRowsExport } from '../../components/pagedTable';
import { useBankReconciliation, type BankReconciliation } from '../../remote/queries';
import { KeyFigures, ReportRow, ReportSection, SectionCard } from '../reports/reportParts';
import { useRecordLabel } from './parts';

const m = (x: Money) => formatMoney(x);

/** One figure of the statement: a label, an amount, and the items under it. */
function Figure({ label, value, sign, strong, items, tone }: { label: string; value: Money; sign?: '+' | '−'; strong?: boolean; items?: { key: string; date: string; text: string; amount: Money }[]; tone?: 'good' | 'bad' }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: t.spacing.sm, borderTopWidth: strong ? 1 : 0, borderTopColor: t.c.line, gap: t.spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.md }}>
        <Text variant="small" weight={strong ? '700' : '500'} style={{ flex: 1 }}>
          {label}
        </Text>
        <Text variant="small" weight={strong ? '700' : '600'} tone={tone ?? 'default'} style={{ fontVariant: ['tabular-nums'] }}>
          {sign ? `${sign} ${m(value)}` : m(value)}
        </Text>
      </View>
      {items?.map((i) => (
        <View key={i.key} style={{ flexDirection: 'row', gap: t.spacing.md, paddingLeft: t.spacing.md }}>
          <Text variant="caption" tone="muted" style={{ width: 56 }}>
            {formatDate(i.date, 'dd MMM')}
          </Text>
          <Text variant="caption" tone="muted" style={{ flex: 1 }} numberOfLines={2}>
            {i.text}
          </Text>
          <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
            {m(i.amount)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const abs = (x: Money): Money => ({ minor: Math.abs(x.minor), currency: x.currency });

/**
 * The bank reconciliation statement as an accountant writes it: the balance
 * as per the books, put right for what the bank did that the books don't
 * have yet; the balance as per the statement, put right for what the books
 * have that the bank hasn't cleared yet; and the difference left between them.
 */
export function ReconciliationView({ accountId, accountName }: { accountId: string; accountName: string }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['banking', 'common']);
  const [asOf, setAsOf] = useState(today());
  const q = useBankReconciliation(accountId, asOf);
  const labelOf = useRecordLabel();
  const exportRows = useRowsExport();
  const r = q.data;

  const lineItems = (lines: BankReconciliation['unrecordedLines']['credits']) => lines.map((l) => ({ key: l.id, date: l.date, text: [l.description, l.reference].filter(Boolean).join(' · ') || '—', amount: abs(l.amount) }));
  const recordItems = (recs: BankReconciliation['unclearedPayments']['deposits']) => recs.map((c) => ({ key: `${c.type}:${c.id}`, date: c.date, text: [labelOf(c), c.reference].filter(Boolean).join(' · '), amount: abs(c.amount) }));

  const exportCsv = () => {
    if (!r) return;
    const row = (section: string, date: string, text: string, amount: Money) => [section, date, text, amount.minor / 100];
    const rows: (string | number)[][] = [
      row(tr('banking:brs.bookBalance'), r.asOf, '', r.bookBalance),
      ...lineItems(r.unrecordedLines.credits).map((i) => row(tr('banking:brs.addCredits'), i.date, i.text, i.amount)),
      ...lineItems(r.unrecordedLines.debits).map((i) => row(tr('banking:brs.lessDebits'), i.date, i.text, { ...i.amount, minor: -i.amount.minor })),
      row(tr('banking:brs.adjustedBook'), r.asOf, '', r.adjustedBookBalance),
      ...(r.statementBalance ? [row(tr('banking:brs.statementBalance'), r.statementBalanceDate ?? r.asOf, '', r.statementBalance)] : []),
      ...recordItems(r.unclearedPayments.deposits).map((i) => row(tr('banking:brs.addDeposits'), i.date, i.text, i.amount)),
      ...recordItems(r.unclearedPayments.payments).map((i) => row(tr('banking:brs.lessPayments'), i.date, i.text, { ...i.amount, minor: -i.amount.minor })),
      ...(r.adjustedStatementBalance ? [row(tr('banking:brs.adjustedStatement'), r.asOf, '', r.adjustedStatementBalance)] : []),
      ...(r.difference ? [row(tr('banking:brs.difference'), r.asOf, '', r.difference)] : []),
    ];
    void exportRows(`${tr('banking:brs.fileName')} ${accountName} ${r.asOf}`, { headers: [tr('banking:brs.colSection'), tr('banking:col.date'), tr('banking:brs.colDetails'), tr('banking:col.amount')], rows }, tr('common:table.exportCancelled'));
  };

  const differs = !!r?.difference && r.difference.minor !== 0;

  return (
    <ScrollView contentContainerStyle={{ padding: desktop ? 0 : t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.md }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
      <View style={{ flexDirection: desktop ? 'row' : 'column', gap: t.spacing.md, alignItems: desktop ? 'flex-end' : 'stretch' }}>
        <View style={desktop ? { width: 220 } : undefined}>
          <DateField label={tr('banking:brs.asOf')} value={asOf} onChange={setAsOf} maximumDate={new Date()} />
        </View>
        <View style={desktop ? { marginLeft: 'auto' } : undefined}>
          <Button title={tr('banking:brs.export')} icon="file-export-outline" variant="ghost" size="sm" onPress={exportCsv} disabled={!r} />
        </View>
      </View>

      {!r ? (
        q.isError ? (
          <EmptyState icon="alert-circle-outline" title={tr('common:table.loadFailed')} actionLabel={tr('banking:lines.retry')} onAction={() => void q.refetch()} compact />
        ) : (
          <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} />
        )
      ) : (
        <>
          <KeyFigures
            rows={[
              { label: tr('banking:brs.bookBalance'), value: m(r.bookBalance) },
              { label: tr('banking:brs.statementBalance'), value: r.statementBalance ? m(r.statementBalance) : tr('banking:brs.noBalanceShort') },
              {
                label: tr('banking:brs.difference'),
                value: r.difference ? (differs ? m(r.difference) : tr('banking:brs.agrees')) : '—',
                tone: r.difference ? (differs ? 'bad' : 'good') : undefined,
              },
            ]}
          />
          <ReportRow top>
            <ReportSection title={tr('banking:brs.booksSide')}>
              <SectionCard>
                <Figure label={tr('banking:brs.bookBalanceOn', { date: formatDate(r.asOf) })} value={r.bookBalance} />
                <Figure label={tr('banking:brs.addCredits')} sign="+" value={r.unrecordedLines.creditsTotal} items={lineItems(r.unrecordedLines.credits)} />
                <Figure label={tr('banking:brs.lessDebits')} sign="−" value={r.unrecordedLines.debitsTotal} items={lineItems(r.unrecordedLines.debits)} />
                <Figure label={tr('banking:brs.adjustedBook')} value={r.adjustedBookBalance} strong />
              </SectionCard>
            </ReportSection>
            <ReportSection title={tr('banking:brs.bankSide')}>
              <SectionCard>
                {r.statementBalance ? (
                  <>
                    <Figure label={tr('banking:brs.statementBalanceOn', { date: formatDate(r.statementBalanceDate ?? r.asOf) })} value={r.statementBalance} />
                    <Figure label={tr('banking:brs.addDeposits')} sign="+" value={r.unclearedPayments.depositsTotal} items={recordItems(r.unclearedPayments.deposits)} />
                    <Figure label={tr('banking:brs.lessPayments')} sign="−" value={r.unclearedPayments.paymentsTotal} items={recordItems(r.unclearedPayments.payments)} />
                    {r.adjustedStatementBalance ? <Figure label={tr('banking:brs.adjustedStatement')} value={r.adjustedStatementBalance} strong /> : null}
                  </>
                ) : (
                  <View style={{ gap: t.spacing.sm }}>
                    <Text variant="small" tone="warn" role="status">
                      {tr('banking:brs.noBalance')}
                    </Text>
                    <Figure label={tr('banking:brs.addDeposits')} sign="+" value={r.unclearedPayments.depositsTotal} items={recordItems(r.unclearedPayments.deposits)} />
                    <Figure label={tr('banking:brs.lessPayments')} sign="−" value={r.unclearedPayments.paymentsTotal} items={recordItems(r.unclearedPayments.payments)} />
                  </View>
                )}
              </SectionCard>
            </ReportSection>
          </ReportRow>

          {r.difference ? (
            <Card style={{ gap: t.spacing.xs, borderWidth: 1, borderColor: differs ? t.c.bad : t.c.good }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.md }}>
                <Text variant="body" weight="700" style={{ flex: 1 }}>
                  {tr('banking:brs.difference')}
                </Text>
                <Text variant="body" weight="700" tone={differs ? 'bad' : 'good'} style={{ fontVariant: ['tabular-nums'] }}>
                  {m(r.difference)}
                </Text>
              </View>
              <Text variant="caption" tone="muted" role="status">
                {differs ? tr('banking:brs.differsHint') : tr('banking:brs.agreesHint')}
              </Text>
            </Card>
          ) : null}
          {r.since ? (
            <Text variant="caption" tone="muted">
              {tr('banking:brs.since', { date: formatDate(r.since) })}
            </Text>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
