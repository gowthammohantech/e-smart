import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Icon } from './Icon';
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

export type Sort = { key: string; dir: 'asc' | 'desc' };

/** Rows per page for every list table in the web app, so they all page alike. */
export const TABLE_PAGE_SIZE = 10;

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
  pageSize,
  sort: sortProp,
  onSortChange,
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
  /** Shows this many rows at a time, with a pager under the table. */
  pageSize?: number;
  /**
   * Sorting done elsewhere (a server list): headers report the click and the rows keep their order.
   * Without it the table sorts the rows it has.
   */
  sort?: Sort | null;
  onSortChange?: (sort: Sort) => void;
}) {
  const t = useTheme();
  const breakpoint = useBreakpoint();
  const narrow = breakpoint === 'tablet';
  // Only a desktop window scrolls sideways; a phone never reaches this table.
  const desktop = breakpoint !== 'phone';
  const columns = narrow ? allColumns.filter((c) => !c.secondary) : allColumns;
  const [localSort, setSort] = useState<Sort | null>(initialSort ?? null);
  const controlled = onSortChange !== undefined;
  const sort = controlled ? (sortProp ?? null) : localSort;

  const sorted = useMemo(() => {
    const column = sort ? columns.find((c) => c.key === sort.key) : undefined;
    if (controlled || !sort || !column?.sortValue) return rows;
    const value = column.sortValue;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, sort, columns, controlled]);

  const toggleSort = (key: string) => {
    const next = (s: Sort | null): Sort => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
    if (controlled) onSortChange(next(sort));
    else setSort(next);
    setPageIndex(0);
  };

  // Paged after sorting, so a sort orders every row, not just the page in view.
  const [pageIndex, setPageIndex] = useState(0);
  // A search or filter that changes the list starts it again from page 1.
  const [pagedLength, setPagedLength] = useState(rows.length);
  if (rows.length !== pagedLength) {
    setPagedLength(rows.length);
    setPageIndex(0);
  }
  const pageCount = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  // Fewer rows than before (a narrower filter) can leave the page past the end.
  const page = Math.min(pageIndex, pageCount - 1);
  const visible = pageSize ? sorted.slice(page * pageSize, (page + 1) * pageSize) : sorted;

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
          <Text variant="caption" tone={active ? 'default' : 'muted'} weight={active ? '600' : '500'} numberOfLines={1}>
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
                  { flexDirection: 'row', alignItems: 'center', gap: 4, opacity: (state as WebPressState).hovered ? 0.7 : 1 },
                  focusRing(t, (state as WebPressState).focused),
                ]}
              >
                {label}
                <Icon
                  name={active ? (sort?.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'unfold-more-horizontal'}
                  size={12}
                  color={active ? t.c.text : t.c.lineStrong}
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
      visible.map((row, i) => {
        const cells = columns.map((c) => (
          <View key={c.key} style={cellStyle(c)}>
            {c.render(row)}
          </View>
        ));
        const rowStyle = {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          minHeight: 48,
          paddingHorizontal: 4,
          paddingVertical: 6,
          borderBottomWidth: i < visible.length - 1 || footer ? 1 : 0,
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

  const pageButton = (icon: 'chevron-left' | 'chevron-right', label: string, to: number, disabled: boolean) => (
    <Pressable
      onPress={() => setPageIndex(to)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={(state) => {
        const { hovered, focused } = state as WebPressState;
        return [
          {
            width: 30,
            height: 30,
            borderRadius: t.radius.sm,
            borderWidth: 1,
            borderColor: hovered && !disabled ? t.c.lineStrong : t.c.line,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: hovered && !disabled ? t.c.card2 : 'transparent',
            opacity: disabled ? 0.4 : 1,
          },
          focusRing(t, focused),
        ];
      }}
    >
      <Icon name={icon} size={16} color={t.c.text} />
    </Pressable>
  );

  const pager =
    pageSize && sorted.length > pageSize ? (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 48,
          paddingHorizontal: 16,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
        }}
      >
        <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
          {`${page * pageSize + 1}–${Math.min((page + 1) * pageSize, sorted.length)} of ${sorted.length}`}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {pageButton('chevron-left', 'Previous page', page - 1, page === 0)}
          <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'], minWidth: 64, textAlign: 'center' }}>
            {`Page ${page + 1} of ${pageCount}`}
          </Text>
          {pageButton('chevron-right', 'Next page', page + 1, page >= pageCount - 1)}
        </View>
      </View>
    ) : null;

  const content = (
    <>
      {header}
      {scroll ? (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {footerRow}
      {pager}
    </>
  );

  // Every column keeps at least its minimum width, so when the window is
  // squeezed (Lixi's panel open, say) the table scrolls sideways instead of
  // crushing its columns.
  const minWidth = columns.reduce((sum, c) => sum + (c.width ?? 120), 0) + 8;

  return (
    <View
      style={{
        flex: scroll ? 1 : undefined,
        backgroundColor: t.c.paper,
        borderRadius: t.radius.lg,
        borderWidth: 1,
        borderColor: t.c.line,
        overflow: 'hidden',
        ...t.shadow.card,
      }}
    >
      {desktop ? (
        <ScrollView
          horizontal
          style={{ flex: scroll ? 1 : undefined }}
          contentContainerStyle={{ flexGrow: 1, minWidth }}
          showsHorizontalScrollIndicator={SHOW_SCROLLBAR}
        >
          <View style={{ flexGrow: 1 }}>{content}</View>
        </ScrollView>
      ) : (
        content
      )}
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
