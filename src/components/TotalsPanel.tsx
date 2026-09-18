import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { DocumentTotals } from '@/types';
import { formatMoney } from '@/lib/format';
import { flattenTaxComponents } from '@/domain/lineCalc';
import { isZero } from '@/lib/money';

function Row({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: 'muted' | 'default' | 'good' | 'bad';
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <Text variant={bold ? 'body' : 'small'} tone={tone ?? (bold ? 'default' : 'muted')} weight={bold ? '700' : '400'}>
        {label}
      </Text>
      <Text
        variant={bold ? 'title' : 'small'}
        weight={bold ? '700' : '500'}
        tone={tone ?? 'default'}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * The tax and total breakdown the PRD requires on every document: every
 * component is itemised so the customer can see exactly how the total was
 * reached.
 */
export function TotalsPanel({
  totals,
  currency,
  baseCurrency,
  exchangeRate,
  compact,
}: {
  totals: DocumentTotals;
  currency: string;
  baseCurrency?: string;
  exchangeRate?: number;
  compact?: boolean;
}) {
  const t = useTheme();
  const components = flattenTaxComponents(totals.taxLines, currency);
  const showFx = !!baseCurrency && baseCurrency !== currency;

  return (
    <View style={{ gap: compact ? 6 : 8 }}>
      <Row label="Subtotal" value={formatMoney(totals.subtotal)} />

      {!isZero(totals.lineDiscount) ? (
        <Row label="Line discounts" value={`− ${formatMoney(totals.lineDiscount)}`} tone="good" />
      ) : null}

      <Row label="Taxable value" value={formatMoney(totals.taxableAmount)} />

      {components.map((c) => (
        <Row key={c.label} label={c.label} value={formatMoney(c.amount)} />
      ))}

      {!isZero(totals.documentDiscount) ? (
        <Row label="Discount on total" value={`− ${formatMoney(totals.documentDiscount)}`} tone="good" />
      ) : null}

      {!isZero(totals.charges) ? <Row label="Other charges" value={formatMoney(totals.charges)} /> : null}

      {!isZero(totals.roundOff) ? (
        <Row label="Round off" value={formatMoney(totals.roundOff, { signed: true })} />
      ) : null}

      <View style={{ height: 1, backgroundColor: t.c.line, marginVertical: 4 }} />

      <Row label="Total" value={formatMoney(totals.grandTotal)} bold />

      {showFx ? (
        <Text variant="micro" tone="muted" style={{ textAlign: 'right' }}>
          ≈ {formatMoney(totals.grandTotalBase)} at 1 {currency} = {exchangeRate?.toFixed(4)} {baseCurrency}
        </Text>
      ) : null}
    </View>
  );
}
