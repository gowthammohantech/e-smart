import React from 'react';
import { View } from 'react-native';
import type { IconName } from './Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { useIsDesktop } from '../theme/breakpoints';
import { Button } from './Button';
import { usePageAction } from './PageHeader';

/**
 * The bar under a form that holds its Save button. A phone pins it full
 * width above the home indicator; a desktop lines the buttons up on the
 * right, the way web forms end.
 */
export function FormActions({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  return (
    <View
      style={
        desktop
          ? {
              flexDirection: 'row',
              justifyContent: 'flex-end',
              gap: t.spacing.md,
              paddingVertical: t.spacing.md,
              paddingHorizontal: t.spacing.lg,
              borderTopWidth: 1,
              borderTopColor: t.c.line,
            }
          : {
              padding: t.spacing.lg,
              paddingBottom: insets.bottom + t.spacing.md,
              // Stacked buttons (a save and a "save & add another") keep apart.
              gap: t.spacing.sm,
              borderTopWidth: 1,
              borderTopColor: t.c.line,
              backgroundColor: t.c.paper,
            }
      }
    >
      {children}
    </View>
  );
}

/**
 * A page's one main action ("Add tax rate"): a full-width bar pinned to the
 * bottom of a phone screen, or the primary button in the desktop page header.
 */
export function PrimaryActionBar({
  title,
  icon,
  onPress,
  loading,
  tooltip,
}: {
  title: string;
  icon?: IconName;
  onPress: () => unknown;
  loading?: boolean;
  /** Shown above the button on hover in a desktop browser, e.g. why it is locked. */
  tooltip?: string;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const hosted = usePageAction(desktop ? { label: title, icon, onPress, tooltip, loading } : null);
  if (hosted) return null;
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: t.spacing.lg,
        paddingBottom: insets.bottom + t.spacing.md,
        borderTopWidth: 1,
        borderTopColor: t.c.line,
        backgroundColor: t.c.paper,
      }}
    >
      <Button title={title} icon={icon} onPress={onPress} loading={loading} tooltip={tooltip} fullWidth size="lg" />
    </View>
  );
}
