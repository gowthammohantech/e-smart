import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Icon } from '@esmart/ui/components/Icon';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { describeError } from '../../remote/errors';

/** A bank amount with its sign, "+₹5,000.00" in or "−₹1,200.00" out. */
export const signedMoney = (minor: number, currency: string) => formatMoney(money(minor, currency), { signed: true });

/**
 * A statement amount: signed, green in and red out, with an arrow and a
 * spoken "money in" / "money out" so colour isn't the only way to tell.
 */
export function SignedAmount({ minor, currency, variant = 'small' }: { minor: number; currency: string; variant?: 'small' | 'body' }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['banking']);
  const into = minor > 0;
  const text = signedMoney(minor, currency);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }} accessible accessibilityLabel={tr(into ? 'banking:amount.inA11y' : 'banking:amount.outA11y', { amount: formatMoney(money(Math.abs(minor), currency)) })}>
      <Icon name={into ? 'arrow-bottom-left' : 'arrow-top-right'} size={14} color={into ? t.c.good : t.c.bad} />
      <Text variant={variant} weight="700" tone={into ? 'good' : 'bad'} style={{ fontVariant: ['tabular-nums'] }}>
        {text}
      </Text>
    </View>
  );
}

export type RecordLike = { type: 'payment' | 'expense' | 'voucher'; number?: string; date: string; partyName?: string };

/** "Payment PAY-0012 · 03 Apr · Murugan Traders". */
export function useRecordLabel() {
  const { t: tr } = useTranslation(['banking']);
  return useCallback(
    (r: RecordLike) => [`${tr(`banking:record.${r.type}`)} ${r.number ?? ''}`.trim(), formatDate(r.date, 'dd MMM'), r.partyName].filter(Boolean).join(' · '),
    [tr],
  );
}

/** A one-tap match: the record a line most likely is. */
export function MatchChip({ label, onPress, disabled, strong }: { label: string; onPress: () => void; disabled?: boolean; strong?: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['banking']);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={tr('banking:lines.matchTo', { record: label })}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: t.spacing.sm,
        paddingVertical: 4,
        borderRadius: t.radius.pill,
        backgroundColor: pressed ? t.c.card2 : t.c.chip,
        borderWidth: strong ? 1 : 0,
        borderColor: t.c.primary,
        opacity: disabled ? 0.5 : 1,
        maxWidth: '100%',
      })}
    >
      <Icon name="link-variant" size={13} color={t.c.primary} />
      <Text variant="caption" weight="600" tone="primary" numberOfLines={1} style={{ flexShrink: 1 }}>
        {tr('banking:lines.match', { record: label })}
      </Text>
    </Pressable>
  );
}

/**
 * Runs a bank write: one at a time, a toast when it worked, the server's
 * reason when it didn't (describeError, as every server save shows it).
 */
export function useBankAction() {
  const toast = useToast();
  const { t: tr } = useTranslation(['banking', 'common']);
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async (key: string, action: () => Promise<unknown>, success?: string): Promise<boolean> => {
      setBusy(key);
      try {
        await action();
        if (success) toast.show(success, 'success');
        return true;
      } catch (err) {
        toast.show(describeError(err, tr), 'error');
        return false;
      } finally {
        setBusy(null);
      }
    },
    [toast, tr],
  );
  return { run, busy };
}
