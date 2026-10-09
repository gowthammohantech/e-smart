import React from 'react';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
}: {
  title: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  loading?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const hosted = usePageAction(desktop ? { label: title, icon, onPress } : null);
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
      <Button title={title} icon={icon} onPress={onPress} loading={loading} fullWidth size="lg" />
    </View>
  );
}
