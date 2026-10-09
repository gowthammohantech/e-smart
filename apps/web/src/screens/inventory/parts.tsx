import React from 'react';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { Text, type TextTone } from '@esmart/ui/components/Text';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** The widest a desktop form page gets; wider just spreads the fields apart. */
export const PAGE_MAX_WIDTH = 1100;

/** A form page: a main column and a narrower side column that wraps under it when tight. */
export function TwoColumns({ main, side }: { main: React.ReactNode; side?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: '100%',
        maxWidth: PAGE_MAX_WIDTH,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: t.spacing.lg,
        alignItems: 'flex-start',
      }}
    >
      <View style={{ flexGrow: 3, flexBasis: 460, gap: t.spacing.lg, minWidth: 0 }}>{main}</View>
      {side ? <View style={{ flexGrow: 2, flexBasis: 300, gap: t.spacing.lg, minWidth: 0 }}>{side}</View> : null}
    </View>
  );
}

/** Fields side by side, equal widths. */
export function Row({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.lg, alignItems: 'flex-start' }}>
      {React.Children.map(children, (child) =>
        child ? <View style={{ flexGrow: 1, flexBasis: 200, minWidth: 0 }}>{child}</View> : null,
      )}
    </View>
  );
}

/** A titled card that groups related fields. */
export function Panel({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Card style={{ padding: t.spacing.xl, gap: t.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
        {icon ? (
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: t.radius.sm,
              backgroundColor: t.c.chip,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons name={icon} size={20} color={t.c.primary} />
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 1 }}>
          <Text weight="700">{title}</Text>
          {subtitle ? (
            <Text variant="caption" tone="muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ gap: t.spacing.lg }}>{children}</View>
    </Card>
  );
}

/** A label and its value, one per line, for a summary. */
export function SummaryRow({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: TextTone;
  strong?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: t.spacing.md }}>
      <Text variant={strong ? 'body' : 'small'} tone={strong ? 'default' : 'muted'} weight={strong ? '700' : '400'}>
        {label}
      </Text>
      <Text variant={strong ? 'h3' : 'small'} weight={strong ? '700' : '600'} tone={tone} style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line }} />;
}

/** The buttons that finish a form: at the right, at their own size, not stretched. */
export function FormFooter({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: '100%',
        maxWidth: PAGE_MAX_WIDTH,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: t.spacing.sm,
        paddingTop: t.spacing.sm,
      }}
    >
      {children}
    </View>
  );
}

/** A quiet note, for the explanation a phone screen puts in a flat card. */
export function Note({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md }}>
      <MaterialCommunityIcons name="information-outline" size={18} color={t.c.muted} style={{ marginTop: 1 }} />
      <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
        {children}
      </Text>
    </Card>
  );
}
