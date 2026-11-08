import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { SHOW_SCROLLBAR, useBreakpoint } from '../theme/breakpoints';
import { focusRing, type WebPressState } from '../theme/interaction';
import { Text } from './Text';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { ShimmerProvider, Skeleton } from './Skeleton';
import { Menu, MenuItem, useMenuAnchor } from './Menu';

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

/** One entry in a row's ⋯ menu. */
export type RowAction = {
  key: string;
  label: string;
  icon?: IconName;
  destructive?: boolean;
  onPress: () => void;
};

/** Rows per page for every list table in the web app, so they all page alike. */
export const TABLE_PAGE_SIZE = 10;
/** The choices a list table offers for rows per page. */
export const TABLE_PAGE_SIZES = [10, 25, 50, 100];

const SELECT_WIDTH = 44;
const ACTIONS_WIDTH = 52;

function cellStyle<T>(column: Pick<Column<T>, 'width' | 'flex' | 'align'>) {
  return {
    ...(column.width ? { width: column.width } : { flex: column.flex ?? 1, minWidth: 120 }),
    paddingHorizontal: 12,
    alignItems: column.align === 'right' ? ('flex-end' as const) : column.align === 'center' ? ('center' as const) : ('flex-start' as const),
  };
}

/** A remembered rows-per-page for one table, if it is still on offer. Web only; never throws. */
function storedPageSize(tableKey: string | undefined, options: number[] | undefined): number | undefined {
  if (!tableKey || !options || Platform.OS !== 'web') return undefined;
  try {
    const n = Number(globalThis.localStorage?.getItem(`ebs.table.${tableKey}.pageSize`));
    return options.includes(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

function storePageSize(tableKey: string | undefined, n: number) {
  if (!tableKey || Platform.OS !== 'web') return;
  try {
    globalThis.localStorage?.setItem(`ebs.table.${tableKey}.pageSize`, String(n));
  } catch {
    // Private windows and blocked storage: the choice just lasts for this visit.
  }
}

/**
 * A desktop data table: column headers that sort, rows that highlight on
 * hover and open on click or Enter, and an optional totals footer. Columns
 * line up with flex rows, so it renders anywhere React Native does.
 *
 * Optionally: skeleton rows while loading, an error row with Retry, a
 * rows-per-page choice, a checkbox column with a bulk-action bar, and a ⋯
 * menu per row. A server list passes `totalCount`, `hasMore` and
 * `onLoadMore`, and the pager fetches the next page when it runs out.
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
  loading,
  error,
  onRetry,
  pageSizeOptions,
  tableKey,
  totalCount,
  hasMore,
  onLoadMore,
  selectable,
  selectedKeys,
  onSelectionChange,
  bulkActions,
  rowActions,
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
  /** Rows are on their way: skeleton rows stand in while there are none yet. */
  loading?: boolean;
  /** Loading failed: an error row (with Retry when `onRetry` is given) in place of the rows. */
  error?: string | null;
  onRetry?: () => void;
  /** Lets the user pick rows per page from these; implies paging. */
  pageSizeOptions?: number[];
  /** Remembers the rows-per-page choice under this name. */
  tableKey?: string;
  /** How many rows the server has in all, when only some are loaded. */
  totalCount?: number;
  /** More rows can be fetched. */
  hasMore?: boolean;
  /** Fetches the next batch; called when the page in view runs past the rows loaded. */
  onLoadMore?: () => void;
  /** A checkbox per row and a select-all for the page. Needs `selectedKeys` and `onSelectionChange`. */
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  /** Buttons for the bar shown while rows are selected. */
  bulkActions?: (keys: string[]) => React.ReactNode;
  /** The entries of a row's ⋯ menu; none (or an empty list) leaves the row without one. */
  rowActions?: (row: T) => RowAction[];
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const breakpoint = useBreakpoint();
  const narrow = breakpoint === 'tablet';
  // Only a desktop window scrolls sideways; a phone never reaches this table.
  const desktop = breakpoint !== 'phone';
  const canSelect = !!selectable && !!onSelectionChange;
  const extrasWidth = 8 + (canSelect ? SELECT_WIDTH : 0) + (rowActions ? ACTIONS_WIDTH : 0);
  // The table's own width, not the window's: a sidebar, Lixi's panel or a side
  // column can leave it far narrower than the window suggests.
  const [boxWidth, setBoxWidth] = useState(0);
  const columns = useMemo(() => {
    if (narrow) return allColumns.filter((c) => !c.secondary);
    const need = (cols: Column<T>[]) => cols.reduce((sum, c) => sum + (c.width ?? 120), 0) + extrasWidth;
    // Secondary columns go one at a time, in the order they're declared, until the rest fit.
    let cols = allColumns;
    for (const c of allColumns.filter((x) => x.secondary)) {
      if (!boxWidth || need(cols) <= boxWidth) break;
      cols = cols.filter((x) => x !== c);
    }
    return cols;
  }, [allColumns, narrow, boxWidth, extrasWidth]);
  const [localSort, setSort] = useState<Sort | null>(initialSort ?? null);
  const controlled = onSortChange !== undefined;
  const sort = controlled ? (sortProp ?? null) : localSort;
  const selection = useMemo(() => new Set(selectedKeys ?? []), [selectedKeys]);

  const [size, setSize] = useState<number | undefined>(
    () => storedPageSize(tableKey, pageSizeOptions) ?? pageSize ?? pageSizeOptions?.[0],
  );

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
  // A search or filter that replaces the list starts it again from page 1. A
  // server list growing by a fetched page (same first row, more rows) doesn't.
  const firstKey = rows.length ? rowKey(rows[0]) : '';
  const [seen, setSeen] = useState({ length: rows.length, firstKey });
  if (rows.length !== seen.length || firstKey !== seen.firstKey) {
    if (rows.length < seen.length || firstKey !== seen.firstKey) setPageIndex(0);
    setSeen({ length: rows.length, firstKey });
  }
  const known = Math.max(sorted.length, totalCount ?? 0);
  const pageCount = size ? Math.max(1, Math.ceil(known / size)) : 1;
  // Fewer rows than before (a narrower filter) can leave the page past the end.
  const page = Math.min(pageIndex, pageCount - 1);
  const visible = size ? sorted.slice(page * size, (page + 1) * size) : sorted;
  // The page in view needs rows that haven't been fetched yet.
  const short = !!size && !!hasMore && (page + 1) * size > sorted.length;

  // Fetch once per length, so a slow response isn't asked for twice.
  const askedAt = useRef(-1);
  useEffect(() => {
    if (short && onLoadMore && askedAt.current !== sorted.length) {
      askedAt.current = sorted.length;
      onLoadMore();
    }
  }, [short, onLoadMore, sorted.length]);

  const actionsFor = (row: T) => rowActions?.(row) ?? [];
  const hasActionsColumn = !!rowActions;

  const pageKeys = visible.map(rowKey);
  const pageSelected = pageKeys.filter((k) => selection.has(k)).length;
  const headerChecked: boolean | 'mixed' = pageSelected === 0 ? false : pageSelected === pageKeys.length ? true : 'mixed';
  const setPageSelection = (on: boolean) => {
    const next = new Set(selection);
    for (const k of pageKeys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    onSelectionChange?.([...next]);
  };
  const toggleRow = (key: string, on: boolean) => {
    const next = new Set(selection);
    if (on) next.add(key);
    else next.delete(key);
    onSelectionChange?.([...next]);
  };

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
      role="row"
    >
      {canSelect ? (
        <View style={{ width: SELECT_WIDTH, alignItems: 'center' }} role="columnheader">
          <Checkbox
            checked={pageKeys.length ? headerChecked : false}
            disabled={!pageKeys.length}
            onChange={setPageSelection}
            label={tr('common:table.selectPage')}
          />
        </View>
      ) : null}
      {columns.map((c) => {
        const active = sort?.key === c.key;
        const ariaSort = !c.sortValue ? undefined : !active ? 'none' : sort?.dir === 'asc' ? 'ascending' : 'descending';
        const sortLabel = !active
          ? tr('common:table.sortBy', { column: c.header })
          : tr(sort?.dir === 'asc' ? 'common:table.sortedAsc' : 'common:table.sortedDesc', { column: c.header });
        const label = (
          <Text variant="caption" tone={active ? 'default' : 'muted'} weight={active ? '600' : '500'} numberOfLines={1}>
            {c.header}
          </Text>
        );
        return (
          <View key={c.key} style={cellStyle(c)} role="columnheader" aria-sort={ariaSort}>
            {c.sortValue ? (
              <Pressable
                onPress={() => toggleSort(c.key)}
                accessibilityRole="button"
                accessibilityLabel={sortLabel}
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
      {hasActionsColumn ? (
        <View style={{ width: ACTIONS_WIDTH }} role="columnheader" aria-label={tr('common:table.actions')} />
      ) : null}
    </View>
  );

  const rowStyle = (last: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 48,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderBottomWidth: !last || footer ? 1 : 0,
    borderBottomColor: t.c.line,
  });

  const skeletonRows = (count: number, startAt: number) =>
    Array.from({ length: count }).map((_, i) => (
      <View key={`skeleton-${startAt + i}`} style={rowStyle(i === count - 1)} role="row" aria-hidden>
        {canSelect ? <View style={{ width: SELECT_WIDTH }} /> : null}
        {columns.map((c, j) => (
          <View key={c.key} style={cellStyle(c)}>
            {/* Widths vary a little, row to row, so the stand-in reads as text and not as a grid. */}
            <Skeleton height={12} width={`${55 + ((i * 7 + j * 13) % 35)}%`} radius={4} />
          </View>
        ))}
        {hasActionsColumn ? <View style={{ width: ACTIONS_WIDTH }} /> : null}
      </View>
    ));

  const errorRow = error ? (
    <View key="error" role="row" style={{ paddingVertical: t.spacing.xl, paddingHorizontal: t.spacing.lg }}>
      <View role="cell" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: t.spacing.md, flexWrap: 'wrap' }}>
        <Icon name="alert-circle-outline" size={18} color={t.c.bad} />
        <Text variant="small" tone="bad" role="alert">
          {error}
        </Text>
        {onRetry ? <Button title={tr('common:action.retry')} variant="ghost" size="sm" icon="sync" onPress={onRetry} /> : null}
      </View>
    </View>
  ) : null;

  const dataRows = visible.map((row, i) => {
    const key = rowKey(row);
    const checked = selection.has(key);
    const label = rowLabel?.(row) ?? key;
    const cells = (
      <>
        {canSelect ? (
          <View style={{ width: SELECT_WIDTH, alignItems: 'center' }} role="cell">
            <Checkbox checked={checked} onChange={(on) => toggleRow(key, on)} label={tr('common:table.selectRow', { label })} />
          </View>
        ) : null}
        {columns.map((c) => (
          <View key={c.key} style={cellStyle(c)} role="cell">
            {c.render(row)}
          </View>
        ))}
        {hasActionsColumn ? (
          <View style={{ width: ACTIONS_WIDTH, alignItems: 'center' }} role="cell">
            <RowActionsButton actions={actionsFor(row)} label={tr('common:table.rowActions', { label })} />
          </View>
        ) : null}
      </>
    );
    const style = rowStyle(i === visible.length - 1 && !short && !error);
    const tint = checked ? t.c.chip : undefined;
    return onRowPress ? (
      <Pressable
        key={key}
        onPress={() => onRowPress(row)}
        // A row, not a link, so the table stays a table to a screen reader;
        // it is still focusable and opens on Enter.
        role="row"
        aria-selected={canSelect ? checked : undefined}
        accessibilityLabel={rowLabel?.(row)}
        style={(state) => {
          const { pressed, hovered, focused } = state as WebPressState;
          return [style, { backgroundColor: tint ?? (pressed || hovered ? t.c.card2 : 'transparent') }, focusRing(t, focused)];
        }}
      >
        {cells}
      </Pressable>
    ) : (
      <View key={key} style={[style, tint ? { backgroundColor: tint } : null]} role="row" aria-selected={canSelect ? checked : undefined}>
        {cells}
      </View>
    );
  });

  const body =
    error && sorted.length === 0 ? (
      errorRow
    ) : loading && sorted.length === 0 ? (
      skeletonRows(size ?? 8, 0)
    ) : sorted.length === 0 && empty ? (
      <View role="row" style={{ flexGrow: 1 }}>
        <View role="cell" style={{ flexGrow: 1 }}>
          {empty}
        </View>
      </View>
    ) : (
      <>
        {dataRows}
        {/* A fetched page on its way, or the reason it didn't come. */}
        {error ? errorRow : short && size ? skeletonRows(Math.min(size - visible.length, 6), visible.length) : null}
      </>
    );

  const footerRow = footer ? (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 4, backgroundColor: t.c.card2 }}
      role="row"
    >
      {canSelect ? <View style={{ width: SELECT_WIDTH }} role="cell" /> : null}
      {columns.map((c) => (
        <View key={c.key} style={cellStyle(c)} role="cell">
          {footer[c.key] ?? null}
        </View>
      ))}
      {hasActionsColumn ? <View style={{ width: ACTIONS_WIDTH }} role="cell" /> : null}
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

  const smallestChoice = pageSizeOptions ? Math.min(...pageSizeOptions) : Infinity;
  const pager =
    size && (known > size || known > smallestChoice) ? (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: t.spacing.md,
          minHeight: 48,
          paddingHorizontal: 16,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg }}>
          <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
            {tr('common:table.range', {
              from: page * size + 1,
              to: Math.min((page + 1) * size, known),
              total: known,
            })}
          </Text>
          {pageSizeOptions ? (
            <PageSizePicker
              value={size}
              options={pageSizeOptions}
              onChange={(n) => {
                // Keep the first row in view on the new page.
                setPageIndex(Math.floor((page * size) / n));
                setSize(n);
                storePageSize(tableKey, n);
              }}
            />
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {pageButton('chevron-left', tr('common:table.previousPage'), page - 1, page === 0)}
          <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'], minWidth: 64, textAlign: 'center' }}>
            {tr('common:table.pageOf', { page: page + 1, count: pageCount })}
          </Text>
          {pageButton('chevron-right', tr('common:table.nextPage'), page + 1, page >= pageCount - 1)}
        </View>
      </View>
    ) : null;

  const bulkBar =
    canSelect && selection.size > 0 ? (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
          minHeight: 48,
          paddingHorizontal: 16,
          backgroundColor: t.c.chip,
          borderBottomWidth: 1,
          borderBottomColor: t.c.line,
        }}
        role="toolbar"
        aria-label={tr('common:table.selected', { count: selection.size })}
      >
        <Text variant="small" weight="600" tone="primary" aria-live="polite">
          {tr('common:table.selected', { count: selection.size })}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, flex: 1 }}>{bulkActions?.([...selection])}</View>
        <Button title={tr('common:table.clearSelection')} variant="ghost" size="sm" onPress={() => onSelectionChange?.([])} />
      </View>
    ) : null;

  // The pager and the bulk bar sit outside the table element (they control it but are not
  // part of it) and outside the sideways scroll, so they stay in view.
  const content = (
    <>
      <ShimmerProvider>
      <View role="table" aria-busy={loading || short || undefined} style={{ flex: scroll ? 1 : undefined }}>
        <View role="rowgroup">{header}</View>
        {scroll ? (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR} role="rowgroup">
            {body}
          </ScrollView>
        ) : (
          <View role="rowgroup">{body}</View>
        )}
        {footerRow ? <View role="rowgroup">{footerRow}</View> : null}
      </View>
      </ShimmerProvider>
    </>
  );

  // Every column keeps at least its minimum width, so when the window is
  // squeezed (Lixi's panel open, say) the table scrolls sideways instead of
  // crushing its columns.
  const minWidth = columns.reduce((sum, c) => sum + (c.width ?? 120), 0) + extrasWidth;

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
      onLayout={(e) => setBoxWidth(Math.round(e.nativeEvent.layout.width))}
    >
      {bulkBar}
      {desktop ? (
        <ScrollView
          horizontal
          style={{ flex: scroll ? 1 : undefined }}
          contentContainerStyle={{ flexGrow: 1, minWidth }}
          showsHorizontalScrollIndicator={SHOW_SCROLLBAR}
        >
          {/* An explicit width: inside a sideways scroller the content would otherwise take
              its natural width, and a long name would widen its column instead of truncating. */}
          <View style={{ flexGrow: 1, width: boxWidth ? Math.max(minWidth, boxWidth - 2) : undefined }}>{content}</View>
        </ScrollView>
      ) : (
        content
      )}
      {pager}
    </View>
  );
}

/** A row's ⋯ button and the menu it opens. Renders nothing for a row with no actions. */
function RowActionsButton({ actions, label }: { actions: RowAction[]; label: string }) {
  const t = useTheme();
  // Destructured: the compiler lint reads `setAnchor` passed as a ref as reading a ref in render.
  const { setAnchor, rect, open, close, visible } = useMenuAnchor();
  if (!actions.length) return null;
  return (
    <>
      <Pressable
        ref={setAnchor}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={label}
        aria-haspopup="menu"
        aria-expanded={visible}
        hitSlop={6}
        style={(state) => {
          const { hovered, focused } = state as WebPressState;
          return [
            {
              width: 30,
              height: 30,
              borderRadius: t.radius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: hovered || visible ? t.c.card2 : 'transparent',
            },
            focusRing(t, focused),
          ];
        }}
      >
        <Icon name="dots-horizontal" size={18} color={t.c.muted} />
      </Pressable>
      <Menu anchor={rect} onClose={close} align="right" width={220}>
        {actions.map((a) => (
          <MenuItem
            key={a.key}
            icon={a.icon}
            label={a.label}
            destructive={a.destructive}
            onPress={() => {
              close();
              a.onPress();
            }}
          />
        ))}
      </Menu>
    </>
  );
}

/** "Rows per page: 25 ▾" and the menu of choices. */
function PageSizePicker({ value, options, onChange }: { value: number; options: number[]; onChange: (n: number) => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  // Destructured: the compiler lint reads `setAnchor` passed as a ref as reading a ref in render.
  const { setAnchor, rect, open, close, visible } = useMenuAnchor();
  return (
    <>
      <Pressable
        ref={setAnchor}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={tr('common:table.rowsPerPage', { n: value })}
        aria-haspopup="menu"
        aria-expanded={visible}
        style={(state) => {
          const { hovered, focused } = state as WebPressState;
          return [
            { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4, paddingHorizontal: 6, borderRadius: t.radius.sm },
            { backgroundColor: hovered || visible ? t.c.card2 : 'transparent' },
            focusRing(t, focused),
          ];
        }}
      >
        <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
          {tr('common:table.rowsPerPage', { n: value })}
        </Text>
        <Icon name="chevron-down" size={14} color={t.c.muted} />
      </Pressable>
      <Menu anchor={rect} onClose={close} width={160}>
        {options.map((n) => (
          <MenuItem
            key={n}
            label={tr('common:table.perPage', { n })}
            selected={n === value}
            onPress={() => {
              close();
              onChange(n);
            }}
          />
        ))}
      </Menu>
    </>
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
