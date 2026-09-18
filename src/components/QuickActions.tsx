import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type Action = {
  key: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: string;
  color?: string;
};

/** The six quick actions named in the PRD. */
export function quickActions(primary: string): Action[] {
  return [
    { key: 'invoice', label: 'New invoice', icon: 'file-document-edit-outline', route: '/(app)/sales/invoices/new', color: primary },
    { key: 'quote', label: 'New quote', icon: 'file-percent-outline', route: '/(app)/sales/quotes/new' },
    { key: 'receive', label: 'Receive payment', icon: 'cash-plus', route: '/(app)/payments/new?direction=received' },
    { key: 'expense', label: 'Add expense', icon: 'receipt-text-outline', route: '/(app)/expenses/new' },
    { key: 'customer', label: 'Add customer', icon: 'account-plus-outline', route: '/(app)/contacts/customers/new' },
    { key: 'item', label: 'Add item', icon: 'tag-plus-outline', route: '/(app)/catalog/items/new' },
  ];
}

export function QuickActions() {
  const t = useTheme();
  const router = useRouter();
  const actions = quickActions(t.c.primary);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: t.spacing.md, paddingRight: t.spacing.lg }}
    >
      {actions.map((a) => (
        <Pressable
          key={a.key}
          onPress={() => router.push(a.route as never)}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          style={({ pressed }) => ({
            width: 84,
            alignItems: 'center',
            gap: 7,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: t.radius.lg,
              backgroundColor: a.color ? t.c.primary : t.c.card,
              borderWidth: a.color ? 0 : t.scheme === 'dark' ? 1 : 0,
              borderColor: t.c.line,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons name={a.icon} size={23} color={a.color ? t.c.onPrimary : t.c.text} />
          </View>
          <Text variant="micro" tone="muted" center numberOfLines={2}>
            {a.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
