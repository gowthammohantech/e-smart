import React, { createContext, useContext } from 'react';
import { ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useBreakpoint, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Cell, DataTable as UiDataTable, TABLE_PAGE_SIZE } from '@esmart/ui/components/DataTable';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Money } from '@esmart/core/lib/money';
import { formatMoney } from '@esmart/core/lib/format';

// Set inside a ReportRow, so its sections and their cards stretch to the row's height.
const InRow = createContext(false);

/**
 * Two report sections side by side, the same height, on a desktop browser
 * wide enough for both. Anywhere narrower, and always on a phone, the
 * sections simply follow each other as before. `top` keeps each section at
 * its own height, for a short chart beside a long table.
 */
export function ReportRow({ children, top = false }: { children: React.ReactNode; top?: boolean }) {
  const t = useTheme();
  const bp = useBreakpoint();
  if (bp !== 'desktop' && bp !== 'wide') return <>{children}</>;
  return (
    <InRow.Provider value={!top}>
      <View style={{ flexDirection: 'row', alignItems: top ? 'flex-start' : 'stretch', gap: t.spacing.xl }}>
        {React.Children.map(children, (child) => (child ? <View style={{ flex: 1, minWidth: 0 }}>{child}</View> : null))}
      </View>
    </InRow.Provider>
  );
}

/** A report section's card: in a ReportRow it fills the height its neighbour sets. */
export function SectionCard({ children, style, padded }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const inRow = useContext(InRow);
  return (
    <Card padded={padded} style={[inRow ? { flex: 1 } : null, style]}>
      {children}
    </Card>
  );
}

export function KeyFigures({ rows }: { rows: { label: string; value: string; tone?: 'good' | 'bad' | 'warn' }[] }) {
  const t = useTheme();
  const inRow = useContext(InRow);
  const desktop = useIsDesktop();
  if (desktop && !inRow) {
    // On its own across a desktop page, each figure sits under its label in equal cells across the card,
    // so the card fills the page column like the sections under it instead of a block in one corner.
    return (
      <Card style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: t.spacing.xxl, rowGap: t.spacing.md }}>
        {rows.map((r) => (
          <View key={r.label} style={{ gap: 2, flex: 1, minWidth: 140 }}>
            <Text variant="caption" tone="muted">
              {r.label}
            </Text>
            <Text variant="body" weight="700" tone={r.tone ?? 'default'} style={{ fontVariant: ['tabular-nums'] }}>
              {r.value}
            </Text>
          </View>
        ))}
      </Card>
    );
  }
  return (
    // In a row the figures spread over the card's height, divided by hairlines.
    <Card style={inRow ? { flex: 1, justifyContent: 'space-around' } : { gap: t.spacing.md }}>
      {rows.map((r, i) => (
        <View
          key={r.label}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: i === 0 ? 0 : 0,
            ...(inRow ? { paddingVertical: t.spacing.md, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: t.c.line } : null),
          }}
        >
          <Text variant="small" tone="muted">
            {r.label}
          </Text>
          <Text variant="small" weight="700" tone={r.tone ?? 'default'} style={{ fontVariant: ['tabular-nums'] }}>
            {r.value}
          </Text>
        </View>
      ))}
    </Card>
  );
}

export function HeroFigure({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: Money | string;
  caption?: string;
  tone?: 'good' | 'bad' | 'warn';
}) {
  const t = useTheme();
  const desktop = useIsDesktop();
  return (
    // One number needn't span a desktop page: the card keeps to its figure there.
    <Card style={[{ gap: 5, paddingVertical: t.spacing.xl }, desktop && { alignSelf: 'flex-start', minWidth: 320, maxWidth: '100%' }]}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="h1" weight="700" tone={tone ?? 'default'}>
        {typeof value === 'string' ? value : formatMoney(value)}
      </Text>
      {caption ? (
        <Text variant="caption" tone="muted">
          {caption}
        </Text>
      ) : null}
    </Card>
  );
}

export function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  const inRow = useContext(InRow);
  return (
    <View style={{ marginTop: t.spacing.xl, flex: inRow ? 1 : undefined }}>
      <Text
        variant="caption"
        tone="muted"
        weight="600"
        style={{ textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: t.spacing.sm }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

/** How a report column reads: text sits left in the body face, a number right in tabular figures. */
export type ColumnKind = 'text' | 'num';

/**
 * Simple aligned table used by the tax and stock reports.
 *
 * By default the first column is text and the rest are numbers; `kinds`
 * overrides that per column (a contact, PAN or document number is text).
 * `total` is the totals row: a footer on a desktop (outside any paging), a
 * bold, shaded last row on a phone. `strong` marks rows inside the body
 * (subtotals, headings) as bold. A desktop table shows every row unless the
 * report opts into `paged` (long lists, not statements).
 */
export function DataTable({
  headers,
  rows,
  widths,
  minWidth,
  kinds,
  total,
  strong,
  paged = false,
  tone,
}: {
  headers: string[];
  rows: (string | number)[][];
  widths?: number[];
  /**
   * On a phone, the narrowest the table may be: a wider one scrolls sideways.
   * Left out, a table of three or more columns gets about 110pt per number
   * column, so amounts are never cut short.
   */
  minWidth?: number;
  kinds?: readonly ColumnKind[];
  total?: (string | number)[];
  strong?: number[];
  paged?: boolean;
  /** A body cell's colour: a favourable variance green, an overrun red. */
  tone?: (row: number, column: number) => 'good' | 'bad' | 'warn' | undefined;
}) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const flexOf = (i: number) => widths?.[i] ?? 1;
  const kindOf = (i: number): ColumnKind => kinds?.[i] ?? (i === 0 ? 'text' : 'num');
  const isNum = (i: number) => kindOf(i) === 'num';
  const strongSet = new Set(strong ?? []);

  // A desktop gets the same table as the app's lists, rows highlighted on hover.
  if (desktop) {
    return (
      <UiDataTable
        scroll={false}
        // Two or three columns read across a desktop page only at a table's own width.
        maxWidth={headers.length <= 3 ? 720 : undefined}
        pageSize={paged ? TABLE_PAGE_SIZE : undefined}
        columns={headers.map((h, i) => ({
          key: String(i),
          header: h,
          flex: flexOf(i),
          align: isNum(i) ? ('right' as const) : ('left' as const),
          render: (row: { cells: (string | number)[]; index: number }) => (
            <Cell weight={strongSet.has(row.index) ? '700' : i === 0 ? '600' : undefined} mono={isNum(i)} tone={tone?.(row.index, i)}>
              {row.cells[i]}
            </Cell>
          ),
        }))}
        rows={rows.map((cells, index) => ({ cells, index }))}
        rowKey={(row) => String(row.index)}
        footer={
          total
            ? Object.fromEntries(
                total.map((v, i) => [
                  String(i),
                  <Cell key={i} weight="700" mono={isNum(i)}>
                    {v}
                  </Cell>,
                ]),
              )
            : undefined
        }
      />
    );
  }

  const numCols = headers.filter((_, i) => isNum(i)).length;
  const width = minWidth ?? (headers.length >= 3 ? 150 + 110 * numCols + 120 * (headers.length - 1 - numCols) : undefined);
  const bodyRows = total ? [...rows, total] : rows;
  const table = (
    <View style={width ? { minWidth: width } : undefined}>
      <View
        style={{
          flexDirection: 'row',
          gap: t.spacing.sm,
          paddingHorizontal: t.spacing.lg,
          paddingVertical: t.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: t.c.line,
          backgroundColor: t.c.card2,
        }}
      >
        {headers.map((h, i) => (
          <Text
            key={`${i}-${h}`}
            variant="micro"
            tone="muted"
            weight="700"
            style={{ flex: flexOf(i), textAlign: isNum(i) ? 'right' : 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}
            numberOfLines={width ? 2 : 1}
          >
            {h}
          </Text>
        ))}
      </View>
      {bodyRows.map((row, ri) => {
        const isTotal = !!total && ri === bodyRows.length - 1;
        const bold = isTotal || strongSet.has(ri);
        return (
          <View
            key={ri}
            style={{
              flexDirection: 'row',
              gap: t.spacing.sm,
              paddingHorizontal: t.spacing.lg,
              paddingVertical: t.spacing.md,
              borderBottomWidth: ri < bodyRows.length - 1 && !(total && ri === bodyRows.length - 2) ? 0.5 : 0,
              borderBottomColor: t.c.line,
              ...(isTotal ? { borderTopWidth: 1, borderTopColor: t.c.line, backgroundColor: t.c.card2 } : null),
            }}
          >
            {row.map((cell, ci) => (
              <Text
                key={ci}
                variant="caption"
                weight={bold ? '700' : ci === 0 ? '600' : '500'}
                tone={isTotal ? undefined : tone?.(ri, ci)}
                style={{
                  flex: flexOf(ci),
                  textAlign: isNum(ci) ? 'right' : 'left',
                  fontVariant: isNum(ci) ? ['tabular-nums'] : undefined,
                }}
                numberOfLines={1}
              >
                {cell}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
  return (
    <Card padded={false}>
      {width ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
          {table}
        </ScrollView>
      ) : (
        table
      )}
    </Card>
  );
}
