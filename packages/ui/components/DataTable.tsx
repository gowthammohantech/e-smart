import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { SHOW_SCROLLBAR, useBreakpoint } from '../theme/breakpoints';
import { focusRing, type WebPressState } from '../theme/interaction';
import { Text } from './Text';

export type Column<T> = {
  key: string;
  header: string;
  /** Share of the spare width; ignored when `width` is set. */
  flex?: number;
  /** Fixed width in px. */
  width?: number;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => React.ReactNode;
  /** Makes the column sortable by clicking its header. */
  sortValue?: (row: T) => string | number;
  /** Dropped when the window is too narrow for every column (below 1024px). */
  secondary?: boolean;
};

type Sort = { key: string; dir: 'asc' | 'desc' };

function cellStyle<T>(column: Column<T>) {
  return {
    ...(column.width ? { width: column.width } : { flex: column.flex ?? 1, minWidth: 120 }),
    paddingHorizontal: 12,
    alignItems: column.align === 'right' ? ('flex-end' as const) : column.align === 'center' ? ('center' as const) : ('flex-start' as const),
  };
}

/**
 * A desktop data table: column headers that sort, rows that highlight on
 * hover and open on click or Enter, and an optional totals footer. Columns
 * line up with flex rows, so it renders anywhere React Native does.
 */
export function DataTable<T>({
  columns: allColumns,
  rows,
  rowKey,
  onRowPress,
  footer,
  empty,
  initialSort,
  scroll = true,
  rowLabel,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowPress?: (row: T) => void;
  /** Cells for a totals row, keyed by column key. */
  footer?: Partial<Record<string, React.ReactNode>>;
  /** Shown in place of rows when there are none. */
  empty?: React.ReactNode;
  initialSort?: Sort;
  /** Scroll the body under a fixed header; turn off inside another scroller. */
  scroll?: boolean;
  /** Screen-reader label for a row. */
  rowLabel?: (row: T) => string;
}) {
  const t = useTheme();
  const narrow = useBreakpoint() === 'tablet';
  const columns = narrow ? allColumns.filter((c) => !c.secondary) : allColumns;
  const [sort, setSort] = useState<Sort | null>(initialSort ?? null);

  const sorted = useMemo(() => {
    const column = sort ? columns.find((c) => c.key === sort.key) : undefined;
    if (!sort || !column?.sortValue) return rows;
    const value = column.sortValue;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, sort, columns]);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const header = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 40,
        paddingHorizontal: 4,
        backgroundColor: t.c.card2,
        borderBottomWidth: 1,
        borderBottomColor: t.c.line,
      }}
      accessibilityRole="header"
    >
      {columns.map((c) => {
        const active = sort?.key === c.key;
        const label = (
          <Text variant="micro" tone={active ? 'default' : 'muted'} weight="700" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }} numberOfLines={1}>
            {c.header}
          </Text>
        );
        return (
          <View key={c.key} style={cellStyle(c)}>
            {c.sortValue ? (
              <Pressable
                onPress={() => toggleSort(c.key)}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${c.header}`}
                style={(state) => [
                  { flexDirection: 'row', alignItems: 'center', gap: 2, opacity: (state as WebPressState).hovered ? 0.7 : 1 },
                  focusRing(t, (state as WebPressState).focused),
                ]}
              >
                {label}
                <MaterialCommunityIcons
                  name={active ? (sort?.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'swap-vertical'}
                  size={12}
                  color={active ? t.c.text : t.c.line}
                />
              </Pressable>
            ) : (
              label
            )}
          </View>
        );
      })}
    </View>
  );

  const body =
    sorted.length === 0 && empty ? (
      empty
    ) : (
      sorted.map((row, i) => {
        const cells = columns.map((c) => (
          <View key={c.key} style={cellStyle(c)}>
            {c.render(row)}
          </View>
        ));
        const rowStyle = {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          minHeight: 52,
          paddingHorizontal: 4,
          paddingVertical: 6,
          borderBottomWidth: i < sorted.length - 1 || footer ? 1 : 0,
          borderBottomColor: t.c.line,
        };
        return onRowPress ? (
          <Pressable
            key={rowKey(row)}
            onPress={() => onRowPress(row)}
            accessibilityRole="link"
            accessibilityLabel={rowLabel?.(row)}
            style={(state) => {
              const { pressed, hovered, focused } = state as WebPressState;
              return [rowStyle, { backgroundColor: pressed || hovered ? t.c.card2 : 'transparent' }, focusRing(t, focused)];
            }}
          >
            {cells}
          </Pressable>
        ) : (
          <View key={rowKey(row)} style={rowStyle}>
            {cells}
          </View>
        );
      })
    );

  const footerRow = footer ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 4, backgroundColor: t.c.card2 }}>
      {columns.map((c) => (
        <View key={c.key} style={cellStyle(c)}>
          {footer[c.key] ?? null}
        </View>
      ))}
    </View>
  ) : null;

  return (
    <View
      style={{
        flex: scroll ? 1 : undefined,
        backgroundColor: t.c.paper,
        borderRadius: t.radius.lg,
        borderWidth: 1,
        borderColor: t.c.line,
        overflow: 'hidden',
      }}
    >
      {header}
      {scroll ? (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {footerRow}
    </View>
  );
}

/** Plain text for a table cell, one line, with the usual tones. */
export function Cell({
  children,
  tone = 'default',
  weight,
  mono,
}: {
  children: React.ReactNode;
  tone?: 'default' | 'muted' | 'primary' | 'bad' | 'good' | 'warn';
  weight?: '400' | '500' | '600' | '700';
  /** Tabular figures, for amounts and numbers. */
  mono?: boolean;
}) {
  return (
    <Text variant="small" tone={tone} weight={weight} numberOfLines={1} style={mono ? { fontVariant: ['tabular-nums'] } : undefined}>
      {children}
    </Text>
  );
}
