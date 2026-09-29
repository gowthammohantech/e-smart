import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import type { Translate } from '@/i18n/labels';
import { Text } from './Text';
import { useCanOpen } from '@/store/selectors';

type Action = {
  key: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: string;
  color?: string;
};

/** The six quick actions named in the PRD. Takes the translator, since it is
 * called outside a component as well as inside one. */
export function quickActions(tr: Translate, primary: string): Action[] {
  return [
    { key: 'invoice', label: tr('common:quickAction.newInvoice'), icon: 'file-document-edit-outline', route: '/(app)/sales/invoices/new', color: primary },
    { key: 'quote', label: tr('common:quickAction.newQuote'), icon: 'file-percent-outline', route: '/(app)/sales/quotes/new' },
    { key: 'receive', label: tr('common:quickAction.receivePayment'), icon: 'cash-plus', route: '/(app)/payments/new?direction=received' },
    { key: 'expense', label: tr('common:quickAction.addExpense'), icon: 'receipt-text-outline', route: '/(app)/expenses/new' },
    { key: 'customer', label: tr('common:quickAction.addCustomer'), icon: 'account-plus-outline', route: '/(app)/contacts/customers/new' },
    { key: 'item', label: tr('common:quickAction.addItem'), icon: 'tag-plus-outline', route: '/(app)/catalog/items/new' },
  ];
}

export function QuickActions() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const router = useRouter();
  const canOpen = useCanOpen();
  const actions = quickActions(tr, t.c.primary).filter((a) => canOpen(a.route));

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
