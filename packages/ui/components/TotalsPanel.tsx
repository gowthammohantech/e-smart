import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useIsDesktop } from '../theme/breakpoints';
import { Text } from './Text';
import { DocumentTotals } from '@esmart/core/types';
import { formatMoney } from '@esmart/core/lib/format';
import { flattenTaxComponents } from '@esmart/core/domain/lineCalc';
import { Money, isZero, subtract } from '@esmart/core/lib/money';

/** The totals' widest on a desktop: labels and amounts stay close enough to read across. */
export const TOTALS_MAX_WIDTH = 420;

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
  tds,
  itc,
}: {
  totals: DocumentTotals;
  /**
   * TDS kept back on a supplier's bill, with how it reads ("TDS 194C @ 2%"); or, on an invoice, what
   * the customer is expected to deduct, with `netLabel` for what they then pay (the total is unchanged).
   */
  tds?: { label: string; amount: Money; netLabel?: string };
  /** On a purchase: the input tax credit by bucket (eligible, capital goods, reverse charge, blocked, ineligible). */
  itc?: { title: string; rows: { label: string; amount: Money; tone?: 'muted' | 'bad' }[] };
  currency: string;
  baseCurrency?: string;
  exchangeRate?: number;
  compact?: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const components = flattenTaxComponents(totals.taxLines, currency);
  const showFx = !!baseCurrency && baseCurrency !== currency;
  const desktop = useIsDesktop();

  return (
    // On a desktop a wide card keeps the totals at its right edge, as on a printed invoice.
    <View style={[{ gap: compact ? 6 : 8 }, desktop ? { width: '100%', maxWidth: TOTALS_MAX_WIDTH, alignSelf: 'flex-end' } : null]}>
      <Row label={tr('common:totals.subtotal')} value={formatMoney(totals.subtotal)} />

      {!isZero(totals.lineDiscount) ? (
        <Row label={tr('common:totals.lineDiscounts')} value={`− ${formatMoney(totals.lineDiscount)}`} tone="good" />
      ) : null}

      {totals.chargesTaxed && !isZero(totals.chargesTaxed) ? (
        <Row label={tr('common:totals.chargesTaxed')} value={formatMoney(totals.chargesTaxed)} />
      ) : null}

      <Row label={tr('common:totals.taxableValue')} value={formatMoney(totals.taxableAmount)} />

      {components.map((c) => (
        <Row key={c.label} label={c.label} value={formatMoney(c.amount)} />
      ))}

      {!isZero(totals.documentDiscount) ? (
        <Row label={tr('common:totals.discountOnTotal')} value={`− ${formatMoney(totals.documentDiscount)}`} tone="good" />
      ) : null}

      {totals.reimbursements && !isZero(totals.reimbursements) ? (
        <Row label={tr('common:totals.reimbursements')} value={formatMoney(totals.reimbursements)} />
      ) : null}

      {!isZero(totals.charges) ? <Row label={tr('common:totals.otherCharges')} value={formatMoney(totals.charges)} /> : null}

      {/* TCS is inside the grand total (lineCalc): without its row the rows wouldn't add up to Total. */}
      {totals.tcs && !isZero(totals.tcs) ? <Row label={tr('common:totals.tcs')} value={formatMoney(totals.tcs)} /> : null}

      {!isZero(totals.roundOff) ? (
        <Row label={tr('common:totals.roundOff')} value={formatMoney(totals.roundOff, { signed: true })} />
      ) : null}

      <View style={{ height: 1, backgroundColor: t.c.line, marginVertical: 4 }} />

      <Row label={tr('common:totals.total')} value={formatMoney(totals.grandTotal)} bold />

      {tds && !isZero(tds.amount) ? (
        <>
          <Row label={tds.label} value={`− ${formatMoney(tds.amount)}`} />
          <Row label={tds.netLabel ?? tr('common:totals.payableToSupplier')} value={formatMoney(subtract(totals.grandTotal, tds.amount))} bold />
        </>
      ) : null}

      {itc && itc.rows.length ? (
        <View style={{ gap: 4, marginTop: 4 }}>
          <Text variant="micro" tone="muted" weight="600">
            {itc.title}
          </Text>
          {itc.rows.map((r) => (
            <Row key={r.label} label={r.label} value={formatMoney(r.amount)} tone={r.tone} />
          ))}
        </View>
      ) : null}

      {totals.reverseChargeTax && !isZero(totals.reverseChargeTax) ? (
        <Row label={tr('common:totals.reverseChargeTax')} value={formatMoney(totals.reverseChargeTax)} />
      ) : null}

      {showFx ? (
        <Text variant="micro" tone="muted" style={{ textAlign: 'right' }}>
          {tr('common:totals.fxNote', {
            amount: formatMoney(totals.grandTotalBase),
            currency,
            rate: exchangeRate?.toFixed(4),
            baseCurrency,
          })}
        </Text>
      ) : null}
    </View>
  );
}
