import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export function Fab({
  icon = 'plus',
  label,
  onPress,
  bottom = 0,
}: {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  label?: string;
  onPress: () => void;
  bottom?: number;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ position: 'absolute', right: t.spacing.lg, bottom: bottom + insets.bottom + t.spacing.lg }}>
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={label ?? 'Create'}
        style={({ pressed }) => [
          {
            height: 56,
            minWidth: 56,
            paddingHorizontal: label ? t.spacing.xl : 0,
            borderRadius: 28,
            backgroundColor: t.c.primary,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          },
          t.shadow.fab,
        ]}
      >
        <MaterialCommunityIcons name={icon} size={26} color={t.c.onPrimary} />
        {label ? (
          <Text weight="600" style={{ color: t.c.onPrimary }}>
            {label}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}
