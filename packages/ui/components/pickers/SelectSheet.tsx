import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Icon, type IconName } from '../Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { Sheet } from '../Sheet';
import { SearchBar } from '../SearchBar';
import { Text, TextTone } from '../Text';
import { EmptyState } from '../EmptyState';
import { Button } from '../Button';
import { useToast } from '../Toast';
import { useKeepScrollWhileOpen } from '../ScrollKeep';
import { DIALOG_WIDTH, useIsDesktop } from '../../theme/breakpoints';
import type { WebPressState } from '../../theme/interaction';

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  icon?: IconName;
  /** Drawn where the icon goes, in its place: e.g. a business's logo. */
  leading?: React.ReactNode;
  trailing?: string;
  disabled?: boolean;
  /** A coloured line under the description, e.g. an item's stock. */
  note?: { text: string; tone?: TextTone };
  /** Why this row can't be picked: shown dimmed, and tapping it shows this message instead. */
  blocked?: string;
};

/** Hands the sheet's own toast (see Sheet `ownToasts`) out to the rows' press handlers. */
function ToastCapture({ intoRef }: { intoRef: React.MutableRefObject<ReturnType<typeof useToast> | null> }) {
  const toast = useToast();
  useEffect(() => {
    intoRef.current = toast;
  }, [intoRef, toast]);
  return null;
}

/**
 * Search-first selection, per the PRD UX principles. Used for every list the
 * user picks from — customers, items, accounts, categories, countries.
 */
export function SelectSheet({
  visible,
  onClose,
  title,
  subtitle,
  options,
  value,
  onSelect,
  searchable = true,
  searchPlaceholder,
  emptyMessage,
  footer,
  onCreate,
  createLabel,
  onQueryChange,
  loading,
  multiple = false,
  onConfirm,
  confirmLabel,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  options: SelectOption[];
  value?: string | null;
  onSelect?: (value: string) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  footer?: React.ReactNode;
  /** Offer the typed search text as a value of its own, for lists that aren't exhaustive. */
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
  /**
   * The search is done elsewhere (on the server): the sheet reports what's typed and shows the
   * options it is given as they are, rather than filtering them itself.
   */
  onQueryChange?: (query: string) => void;
  /** While the options for what's typed are on their way. */
  loading?: boolean;
  /** Tick several rows, then confirm them together; `onSelect` is not called in this mode. */
  multiple?: boolean;
  onConfirm?: (values: string[]) => void;
  confirmLabel?: (count: number) => string;
}) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['common']);
  const [query, setQuery] = useState('');
  // The form behind the sheet stays where it was when the sheet closes.
  useKeepScrollWhileOpen(visible);
  // Kept in tap order so whatever is confirmed arrives in the order it was picked.
  const [picked, setPicked] = useState<string[]>([]);
  // Only a list with rows that can't be picked needs its own toasts.
  const hasBlocked = options.some((o) => o.blocked);
  const sheetToastRef = useRef<ReturnType<typeof useToast> | null>(null);

  const close = () => {
    setQuery('');
    onQueryChange?.('');
    setPicked([]);
    onClose();
  };

  // A creatable list always needs the search box — it is where the new value is typed.
  const showSearch = searchable && (options.length > 6 || !!onCreate || !!onQueryChange);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || onQueryChange) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q),
    );
  }, [options, query, onQueryChange]);

  const typed = query.trim();
  const canCreate = !!onCreate && !!typed && !filtered.some((o) => o.label.toLowerCase() === typed.toLowerCase());
  const createText = createLabel ? createLabel(typed) : tr('common:component.useTyped', { value: typed });

  const createRow = canCreate ? (
    <Pressable
      onPress={() => {
        onCreate?.(typed);
        close();
      }}
      accessibilityRole="button"
      accessibilityLabel={createText}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingVertical: t.spacing.md,
        paddingHorizontal: t.spacing.lg,
        minHeight: 52,
        backgroundColor: pressed ? t.c.card2 : 'transparent',
      })}
    >
      <Icon name="plus" size={20} color={t.c.primary} />
      <Text variant="body" weight="600" tone="primary" numberOfLines={1} style={{ flex: 1 }}>
        {createText}
      </Text>
    </Pressable>
  ) : null;

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={title}
      subtitle={subtitle}
      footer={
        multiple ? (
          <View style={desktop ? { flexDirection: 'row-reverse', alignItems: 'center', gap: t.spacing.sm } : { gap: t.spacing.md }}>
            <Button
              title={confirmLabel ? confirmLabel(picked.length) : tr('common:action.done')}
              icon="check"
              disabled={picked.length === 0}
              fullWidth={!desktop}
              onPress={() => {
                onConfirm?.(picked);
                close();
              }}
            />
            {footer}
          </View>
        ) : (
          footer
        )
      }
      fillHeight={showSearch}
      ownToasts={hasBlocked}
      // On a desktop a list worth searching opens down the right edge, beside the form it fills;
      // a handful of options is a small dialog.
      desktopAs={showSearch ? 'drawer' : 'dialog'}
      desktopWidth={showSearch ? undefined : DIALOG_WIDTH.sm}
      header={
        showSearch ? (
          <View style={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.sm }}>
            <SearchBar
              value={query}
              onChangeText={(q) => {
                setQuery(q);
                onQueryChange?.(q);
              }}
              placeholder={searchPlaceholder ?? tr('common:component.search')}
            />
          </View>
        ) : null
      }
    >
      {hasBlocked ? <ToastCapture intoRef={sheetToastRef} /> : null}

      {loading && filtered.length === 0 ? (
        <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} />
      ) : filtered.length === 0 ? (
        (createRow ?? <EmptyState icon="magnify" title={tr('common:component.noMatches')} message={emptyMessage ?? tr('common:component.noSearchMatch')} compact />)
      ) : (
        filtered.map((o) => {
          const checked = multiple && picked.includes(o.value);
          const selected = multiple ? checked : o.value === value;
          return (
            <Pressable
              key={o.value}
              disabled={o.disabled}
              onPress={() => {
                if (o.blocked) {
                  sheetToastRef.current?.show(o.blocked, 'error');
                  return;
                }
                if (multiple) {
                  setPicked((p) => (p.includes(o.value) ? p.filter((v) => v !== o.value) : [...p, o.value]));
                  return;
                }
                onSelect?.(o.value);
                close();
              }}
              accessibilityRole={multiple ? 'checkbox' : 'button'}
              accessibilityState={multiple ? { checked, disabled: !!o.disabled || !!o.blocked } : { selected, disabled: !!o.disabled || !!o.blocked }}
              accessibilityLabel={o.label}
              accessibilityHint={o.blocked}
              style={(state) => {
                const { pressed, hovered } = state as WebPressState;
                return {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.md,
                  paddingVertical: desktop ? t.spacing.sm + 2 : t.spacing.md,
                  paddingHorizontal: t.spacing.lg,
                  minHeight: desktop ? 44 : 52,
                  backgroundColor: (pressed || hovered) && !o.blocked && !o.disabled ? t.c.card2 : 'transparent',
                  opacity: o.disabled ? 0.4 : o.blocked ? 0.55 : 1,
                };
              }}
            >
              {multiple ? (
                <Icon
                  name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={22}
                  color={checked ? t.c.primary : t.c.muted}
                />
              ) : null}
              {o.leading ?? (o.icon ? <Icon name={o.icon} size={20} color={t.c.muted} /> : null)}
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body" weight={selected ? '600' : '400'} numberOfLines={1}>
                  {o.label}
                </Text>
                {o.description ? (
                  <Text variant="caption" tone="muted" numberOfLines={desktop ? 2 : 1}>
                    {o.description}
                  </Text>
                ) : null}
                {o.note ? (
                  <Text variant="caption" weight="600" tone={o.note.tone ?? 'muted'} numberOfLines={1}>
                    {o.note.text}
                  </Text>
                ) : null}
              </View>
              {o.trailing ? (
                <Text variant="caption" tone="muted">
                  {o.trailing}
                </Text>
              ) : null}
              {selected && !multiple ? <Icon name="check" size={19} color={t.c.primary} /> : null}
            </Pressable>
          );
        })
      )}
      {filtered.length > 0 ? createRow : null}
    </Sheet>
  );
}
