import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { advanceInterState, advanceTaxSplit } from '@esmart/core/domain/advanceTax';
import { homeStateCode } from '@esmart/core/domain/taxEngine';
import { formatMoney } from '@esmart/core/lib/format';
import { money, type Money } from '@esmart/core/lib/money';
import type { Company } from '@esmart/core/types';

/**
 * The GST inside a service advance, line by line: its value, IGST or CGST and SGST, cess. The tax is
 * owed when the advance is received (s.13(2)) and comes out of the amount itself, so the lines add up
 * to it. Shown where the advance is: the receipt's summary as it is typed, and the receipt once saved.
 */
export function AdvanceGstBreakup({
  gross,
  rate,
  cessRate = 0,
  placeOfSupply,
  company,
  baseCurrency,
  exchangeRate = 1,
  tds,
  style,
}: {
  /** The advance, GST included (and the TDS the customer kept back, which was part of it). */
  gross: Money;
  rate: number;
  cessRate?: number;
  placeOfSupply?: string;
  company: Company | undefined;
  baseCurrency: string;
  exchangeRate?: number;
  /** TDS the customer kept back from it, said under the lines. */
  tds?: Money;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales']);
  if (!(rate > 0) || gross.minor <= 0) return null;
  const split = advanceTaxSplit(Math.round(gross.minor * (exchangeRate || 1)), rate, cessRate, advanceInterState(homeStateCode(company), placeOfSupply));
  const rows = [
    { label: tr('sales:payment.advanceValue'), minor: split.taxable },
    ...(split.igst ? [{ label: `IGST ${rate}%`, minor: split.igst }] : [{ label: `CGST ${rate / 2}%`, minor: split.cgst }, { label: `SGST ${rate / 2}%`, minor: split.sgst }]),
    ...(split.cess ? [{ label: `${tr('sales:payment.advanceCessRow')} ${cessRate}%`, minor: split.cess }] : []),
  ];
  return (
    <View style={[{ gap: 2 }, style]}>
      {rows.map((r) => (
        <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.md }}>
          <Text variant="caption" tone="muted">
            {r.label}
          </Text>
          <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
            {formatMoney(money(r.minor, baseCurrency))}
          </Text>
        </View>
      ))}
      <Text variant="caption" tone="muted">
        {tds && tds.minor > 0 ? tr('sales:payment.advanceGstInsideTds', { tds: formatMoney(tds) }) : tr('sales:payment.advanceGstInside')}
      </Text>
    </View>
  );
}
