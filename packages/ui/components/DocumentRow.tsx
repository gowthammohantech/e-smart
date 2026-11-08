import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeProvider';
import { focusRing, type WebPressState } from '../theme/interaction';
import { Text } from './Text';
import { StatusBadge } from './Badge';
import { Avatar } from './Avatar';
import type { BusinessDocument } from '@esmart/core/types';
import { formatMoney } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';

/** What a row shows: a whole document, or a server list's summary of one. */
export type DocumentRowData = Pick<BusinessDocument, 'number' | 'date' | 'status'> & { totals: Pick<BusinessDocument['totals'], 'grandTotal'> };

export function DocumentRow({
  document,
  partyName,
  onPress,
  outstandingLabel,
  detail,
  divider = true,
}: {
  document: DocumentRowData;
  partyName: string;
  onPress?: () => void;
  outstandingLabel?: string;
  /** More to say under the name, e.g. the supplier's own bill number. */
  detail?: string;
  divider?: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  // A draft's placeholder number (INVOICE-DRAFT) reads as "Draft".
  const number = document.status === 'draft' && document.number.endsWith('-DRAFT') ? tr('common:documentList.draftNumber') : document.number;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${number}, ${partyName}, ${formatMoney(document.totals.grandTotal)}`}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressState;
        return {
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingVertical: t.spacing.md,
        paddingHorizontal: t.spacing.lg,
        borderBottomWidth: divider ? 0.5 : 0,
        borderBottomColor: t.c.line,
        backgroundColor: pressed || hovered ? t.c.card2 : 'transparent',
        ...focusRing(t, focused),
        };
      }}
    >
      <Avatar name={partyName} size={38} />

      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="body" weight="600" numberOfLines={1}>
          {partyName}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {/* The year only when it isn't this one: a list reaches back into earlier years. */}
          {number} · {formatDate(document.date, document.date.slice(0, 4) === String(new Date().getFullYear()) ? 'dd MMM' : 'dd MMM yyyy')}
          {detail ? ` · ${detail}` : ''}
          {outstandingLabel ? ` · ${outstandingLabel}` : ''}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 5 }}>
        <Text variant="body" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
          {formatMoney(document.totals.grandTotal)}
        </Text>
        <StatusBadge status={document.status} size="sm" />
      </View>
    </Pressable>
  );
}
