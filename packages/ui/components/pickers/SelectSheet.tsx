import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { Sheet } from '../Sheet';
import { SearchBar } from '../SearchBar';
import { Text } from '../Text';
import { EmptyState } from '../EmptyState';
import { Button } from '../Button';

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  trailing?: string;
  disabled?: boolean;
};

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
  searchPlaceholder = 'Search',
  emptyMessage = 'Nothing matches that search.',
  footer,
  onCreate,
  createLabel,
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
  /** Tick several rows, then confirm them together; `onSelect` is not called in this mode. */
  multiple?: boolean;
  onConfirm?: (values: string[]) => void;
  confirmLabel?: (count: number) => string;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const [query, setQuery] = useState('');
  // Kept in tap order so whatever is confirmed arrives in the order it was picked.
  const [picked, setPicked] = useState<string[]>([]);

  const close = () => {
    setQuery('');
    setPicked([]);
    onClose();
  };

  // A creatable list always needs the search box — it is where the new value is typed.
  const showSearch = searchable && (options.length > 6 || !!onCreate);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);

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
      <MaterialCommunityIcons name="plus" size={20} color={t.c.primary} />
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
          <View style={{ gap: t.spacing.md }}>
            <Button
              title={confirmLabel ? confirmLabel(picked.length) : tr('common:action.done')}
              icon="check"
              disabled={picked.length === 0}
              fullWidth
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
      header={
        showSearch ? (
          <View style={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.sm }}>
            <SearchBar value={query} onChangeText={setQuery} placeholder={searchPlaceholder} />
          </View>
        ) : null
      }
    >

      {filtered.length === 0 ? (
        (createRow ?? <EmptyState icon="magnify" title={tr('common:component.noMatches')} message={emptyMessage} compact />)
      ) : (
        filtered.map((o) => {
          const checked = multiple && picked.includes(o.value);
          const selected = multiple ? checked : o.value === value;
          return (
            <Pressable
              key={o.value}
              disabled={o.disabled}
              onPress={() => {
                if (multiple) {
                  setPicked((p) => (p.includes(o.value) ? p.filter((v) => v !== o.value) : [...p, o.value]));
                  return;
                }
                onSelect?.(o.value);
                close();
              }}
              accessibilityRole={multiple ? 'checkbox' : 'button'}
              accessibilityState={multiple ? { checked, disabled: !!o.disabled } : { selected, disabled: !!o.disabled }}
              accessibilityLabel={o.label}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                paddingVertical: t.spacing.md,
                paddingHorizontal: t.spacing.lg,
                minHeight: 52,
                backgroundColor: pressed ? t.c.card2 : 'transparent',
                opacity: o.disabled ? 0.4 : 1,
              })}
            >
              {multiple ? (
                <MaterialCommunityIcons
                  name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={22}
                  color={checked ? t.c.primary : t.c.muted}
                />
              ) : null}
              {o.icon ? <MaterialCommunityIcons name={o.icon} size={20} color={t.c.muted} /> : null}
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body" weight={selected ? '600' : '400'} numberOfLines={1}>
                  {o.label}
                </Text>
                {o.description ? (
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {o.description}
                  </Text>
                ) : null}
              </View>
              {o.trailing ? (
                <Text variant="caption" tone="muted">
                  {o.trailing}
                </Text>
              ) : null}
              {selected && !multiple ? <MaterialCommunityIcons name="check" size={19} color={t.c.primary} /> : null}
            </Pressable>
          );
        })
      )}
      {filtered.length > 0 ? createRow : null}
    </Sheet>
  );
}
