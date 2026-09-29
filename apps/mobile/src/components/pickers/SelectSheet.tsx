import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Sheet } from '@/components/Sheet';
import { SearchBar } from '@/components/SearchBar';
import { Text } from '@/components/Text';
import { EmptyState } from '@/components/EmptyState';

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
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  options: SelectOption[];
  value?: string | null;
  onSelect: (value: string) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  footer?: React.ReactNode;
  /** Offer the typed search text as a value of its own, for lists that aren't exhaustive. */
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const [query, setQuery] = useState('');

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
        setQuery('');
        onClose();
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
      onClose={() => {
        setQuery('');
        onClose();
      }}
      title={title}
      subtitle={subtitle}
      footer={footer}
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
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              disabled={o.disabled}
              onPress={() => {
                onSelect(o.value);
                setQuery('');
                onClose();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: !!o.disabled }}
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
              {selected ? <MaterialCommunityIcons name="check" size={19} color={t.c.primary} /> : null}
            </Pressable>
          );
        })
      )}
      {filtered.length > 0 ? createRow : null}
    </Sheet>
  );
}
