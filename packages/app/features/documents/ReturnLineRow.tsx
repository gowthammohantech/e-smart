import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Icon } from '@esmart/ui/components/Icon';
import { Badge } from '@esmart/ui/components/Badge';
import { QuantityStepper, Segmented } from '@esmart/ui/components/Field';
import type { DocumentLine, StockCondition } from '@esmart/core/types';
import { STOCK_CONDITIONS } from '@esmart/core/types';
import { calculateLine } from '@esmart/core/domain/lineCalc';
import type { TaxContext } from '@esmart/core/domain/taxEngine';
import { formatMoney } from '@esmart/core/lib/format';
import { subtract } from '@esmart/core/lib/money';
import { unitDecimals, unitShortName } from '@esmart/core/data/masters';

/**
 * A line on a phone, for a sales return that records goods only (how many came back, and in what
 * condition) or a credit note made from one (its lines are the return's, shown, not edited).
 */
export function ReturnLineRow({
  line,
  last,
  stockOnly,
  currency,
  taxContext,
  maxQuantity,
  onUpdate,
  onRemove,
}: {
  line: DocumentLine;
  last: boolean;
  /** A stock-only return: quantity and condition, no price. Otherwise a credit note's line, with its value. */
  stockOnly: boolean;
  currency: string;
  taxContext: TaxContext;
  /** A return takes back no more than its invoice line carried. */
  maxQuantity?: number;
  /** Unset: the line can't be changed. */
  onUpdate?: (patch: Partial<DocumentLine>) => void;
  onRemove?: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales']);
  const condition: StockCondition = line.stockCondition ?? 'good';
  const calc = calculateLine(line, currency, taxContext);
  return (
    <View style={{ gap: t.spacing.sm, padding: t.spacing.lg, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: t.c.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="body" weight="600" numberOfLines={1}>
            {line.name}
          </Text>
          {line.hsnCode ? <Badge label={`HSN ${line.hsnCode}`} tone="neutral" size="sm" /> : null}
        </View>
        {stockOnly ? null : (
          <Text variant="body" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
            {formatMoney(subtract(calc.gross, calc.discount))}
          </Text>
        )}
        {onRemove ? (
          <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={tr('sales:return.removeLine', { name: line.name })} hitSlop={8}>
            <Icon name="trash-can-outline" size={18} color={t.c.muted} />
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: t.spacing.sm }}>
        {onUpdate ? (
          <QuantityStepper
            compact
            positive
            value={line.quantity}
            onChange={(q) => onUpdate({ quantity: maxQuantity !== undefined ? Math.min(q, maxQuantity) : q })}
            min={0}
            decimals={unitDecimals(line.unit)}
          />
        ) : (
          <Text variant="small" weight="600" style={{ fontVariant: ['tabular-nums'] }}>
            {line.quantity}
          </Text>
        )}
        <Text variant="caption" tone="muted">
          {stockOnly ? unitShortName(line.unit) : `${unitShortName(line.unit)} × ${formatMoney(line.unitPrice)}`}
        </Text>
      </View>
      {stockOnly ? (
        onUpdate ? (
          <View style={{ gap: 4 }}>
            <Text variant="caption" tone="muted" weight="600">
              {tr('sales:return.condition')}
            </Text>
            <Segmented
              options={STOCK_CONDITIONS.map((c) => ({ value: c, label: tr(`sales:return.conditionOption.${c}`) }))}
              value={condition}
              onChange={(v) => onUpdate({ stockCondition: v as StockCondition })}
            />
          </View>
        ) : (
          <Badge label={tr(`sales:return.conditionOption.${condition}`)} tone={condition === 'good' ? 'neutral' : 'warning'} size="sm" />
        )
      ) : null}
    </View>
  );
}
