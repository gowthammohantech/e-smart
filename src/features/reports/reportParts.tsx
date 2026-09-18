import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Money } from '@/lib/money';
import { formatMoney } from '@/lib/format';

export function KeyFigures({ rows }: { rows: { label: string; value: string; tone?: 'good' | 'bad' | 'warn' }[] }) {
  const t = useTheme();
  return (
    <Card style={{ gap: t.spacing.md }}>
      {rows.map((r, i) => (
        <View
          key={r.label}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: i === 0 ? 0 : 0,
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
  return (
    <View style={{ marginTop: t.spacing.xl }}>
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

/** Simple aligned table used by the sales and GSTR-1 reports. */
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
  const flexOf = (i: number) => widths?.[i] ?? 1;

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
