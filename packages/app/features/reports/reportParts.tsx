import React, { createContext, useContext } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
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
  return (
    <Card style={{ gap: 5, paddingVertical: t.spacing.xl }}>
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

/** Simple aligned table used by the tax and stock reports. */
export function DataTable({
  headers,
  rows,
  widths,
}: {
  headers: string[];
  rows: (string | number)[][];
  widths?: number[];
}) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const flexOf = (i: number) => widths?.[i] ?? 1;

  // A desktop gets the same table as the app's lists, rows highlighted on hover.
  if (desktop) {
    return (
      <UiDataTable
        scroll={false}
        pageSize={TABLE_PAGE_SIZE}
        columns={headers.map((h, i) => ({
          key: String(i),
          header: h,
          flex: flexOf(i),
          align: i === 0 ? ('left' as const) : ('right' as const),
          render: (row: { cells: (string | number)[] }) => (
            <Cell weight={i === 0 ? '600' : undefined} mono={i > 0}>
              {row.cells[i]}
            </Cell>
          ),
        }))}
        rows={rows.map((cells, index) => ({ cells, index }))}
        rowKey={(row) => String(row.index)}
      />
    );
  }

  return (
    <Card padded={false}>
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: t.spacing.lg,
          paddingVertical: t.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: t.c.line,
          backgroundColor: t.c.card2,
        }}
      >
        {headers.map((h, i) => (
          <Text
            key={h}
            variant="micro"
            tone="muted"
            weight="700"
            style={{ flex: flexOf(i), textAlign: i === 0 ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: 0.5 }}
            numberOfLines={1}
          >
            {h}
          </Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View
          key={ri}
          style={{
            flexDirection: 'row',
            paddingHorizontal: t.spacing.lg,
            paddingVertical: t.spacing.md,
            borderBottomWidth: ri < rows.length - 1 ? 0.5 : 0,
            borderBottomColor: t.c.line,
          }}
        >
          {row.map((cell, ci) => (
            <Text
              key={ci}
              variant="caption"
              weight={ci === 0 ? '600' : '500'}
              style={{ flex: flexOf(ci), textAlign: ci === 0 ? 'left' : 'right', fontVariant: ['tabular-nums'] }}
              numberOfLines={1}
            >
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </Card>
  );
}
