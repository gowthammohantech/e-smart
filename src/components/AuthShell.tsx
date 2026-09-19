import React from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { BrandLogo } from './BrandLogo';

export function AuthShell({
  title,
  subtitle,
  children,
  hideBack,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  hideBack?: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + t.spacing.lg,
          paddingHorizontal: t.spacing.xl,
          paddingBottom: insets.bottom + t.spacing.xxxl,
          gap: t.spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!hideBack && router.canGoBack() ? (
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={tr('common:component.goBack')}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: t.c.card2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons name="arrow-left" size={19} color={t.c.text} />
          </Pressable>
        ) : null}

        <View style={{ gap: t.spacing.sm }}>
          <View style={{ marginBottom: t.spacing.sm }}>
            <BrandLogo height={36} />
          </View>
          <Text variant="h2">{title}</Text>
          {subtitle ? (
            <Text variant="body" tone="muted" style={{ lineHeight: 21 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={{ gap: t.spacing.lg }}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
