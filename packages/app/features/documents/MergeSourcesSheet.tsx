import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Button } from '@esmart/ui/components/Button';
import { Checkbox } from '@esmart/ui/components/Checkbox';
import { Sheet } from '@esmart/ui/components/Sheet';
import { Text } from '@esmart/ui/components/Text';
import type { Money } from '@esmart/core/lib/money';
import { formatMoney } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';

type Row = { id: string; number: string; date: string; total?: Money; detail?: string };

/** The kinds several of which can go into one (`MERGE_CONVERSIONS`), each with its own title and hint. */
export type MergeSource = 'salesOrder' | 'delivery' | 'purchaseOrder';

/**
 * Several of a party's orders (challans, receipts) into one: this one, ticked and fixed, and the
 * others that can go with it (the server's `mergeableWith`), none ticked to start. The button
 * makes the one document from whichever are ticked.
 */
export function MergeSourcesSheet({
  visible,
  onClose,
  kind,
  partyName,
  current,
  candidates,
  createLabel,
  busy,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  /** The kind being merged: sales orders, delivery notes… */
  kind: MergeSource;
  partyName: string;
  current: Row;
  candidates: Row[];
  createLabel: string;
  busy: boolean;
  /** The others ticked, oldest first. */
  onCreate: (alsoFrom: string[]) => void;
}) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['sales', 'common']);
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string, on: boolean) => setPicked((cur) => (on ? [...cur, id] : cur.filter((x) => x !== id)));
  const count = picked.length + 1;

  return (
    <Sheet
      visible={visible}
      onClose={() => (busy ? undefined : onClose())}
      title={tr(`sales:merge.title.${kind}`)}
      subtitle={tr(`sales:merge.hint.${kind}`, { party: partyName })}
      desktopAs="drawer"
      footer={
        <View style={desktop ? { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing.md } : { gap: t.spacing.sm }}>
          <Text variant="caption" tone="muted" center={!desktop} accessibilityLiveRegion="polite">
            {busy ? tr('sales:merge.fetching') : tr('sales:merge.picked', { count })}
          </Text>
          <Button
            title={createLabel}
            icon="check"
            fullWidth={!desktop}
            loading={busy}
            onPress={() => onCreate(candidates.filter((c) => picked.includes(c.id)).map((c) => c.id))}
          />
        </View>
      }
    >
      <Choice row={current} checked disabled note={tr('sales:merge.thisOne')} onChange={() => undefined} />
      {candidates.map((c) => (
        <Choice key={c.id} row={c} checked={picked.includes(c.id)} disabled={busy} onChange={(on) => toggle(c.id, on)} />
      ))}
    </Sheet>
  );
}

function Choice({ row, checked, disabled, note, onChange }: { row: Row; checked: boolean; disabled?: boolean; note?: string; onChange: (on: boolean) => void }) {
  const t = useTheme();
  const label = `${row.number} · ${formatDate(row.date)}`;
  return (
    <Pressable
      onPress={() => !disabled && onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={note ? `${label}, ${note}` : label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingVertical: t.spacing.sm,
        paddingHorizontal: t.spacing.lg,
        minHeight: 52,
        backgroundColor: pressed && !disabled ? t.c.card2 : 'transparent',
        borderBottomWidth: 1,
        borderBottomColor: t.c.line,
      })}
    >
      <Checkbox checked={checked} onChange={onChange} label={label} disabled={disabled} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="600" numberOfLines={1}>
          {row.number}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {[formatDate(row.date), note ?? row.detail].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {row.total ? (
        <Text variant="body" weight="600">
          {formatMoney(row.total)}
        </Text>
      ) : null}
    </Pressable>
  );
}
