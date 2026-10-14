import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Illustration } from '@esmart/ui/components/Illustration';
import { SectionHeader } from '@esmart/ui/components/Screen';
import { quickActions } from '../../components/QuickActions';
import { useActiveCompany, useCanOpen, useCurrentUser, useDocuments, useItems, useParties } from '../../store/selectors';

type Step = {
  key: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: string;
  done: boolean;
};

/**
 * Home for a business with nothing in it yet, on a desktop browser: a welcome
 * with the next move, the setup steps side by side with what's done ticked,
 * and the quick actions as a grid. The phone keeps its own single column.
 */
export function FirstRunDesktop() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'reports']);
  const router = useRouter();
  const canOpen = useCanOpen();
  const user = useCurrentUser();
  const company = useActiveCompany();
  const customers = useParties('customer');
  const items = useItems({ activeOnly: true });
  const invoices = useDocuments('invoice');

  const steps = ([
    { key: 'customer', icon: 'account-plus-outline', route: '/(app)/contacts/customers/new', done: customers.length > 0 },
    { key: 'item', icon: 'tag-plus-outline', route: '/(app)/catalog/items/new', done: items.length > 0 },
    { key: 'invoice', icon: 'file-document-edit-outline', route: '/(app)/sales/invoices/new', done: invoices.length > 0 },
  ] as Step[]).filter((s) => canOpen(s.route));
  const doneCount = steps.filter((s) => s.done).length;

  const actions = quickActions(tr, t.c.primary).filter((a) => canOpen(a.route));
  // Three to a row, the last row padded so every card keeps the same width.
  const rows: (typeof actions[number] | null)[][] = [];
  for (let i = 0; i < actions.length; i += 3) {
    const row: (typeof actions[number] | null)[] = actions.slice(i, i + 3);
    while (row.length < 3) row.push(null);
    rows.push(row);
  }

  const pressStyle = (state: WebPressState) => ({
    backgroundColor: state.hovered || state.pressed ? t.c.card2 : t.c.card,
    ...focusRing(t, state.focused),
  });

  return (
    <View style={{ gap: t.spacing.xl }}>
      <Card style={{ padding: t.spacing.xxl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxl }}>
          <View style={{ flex: 1, gap: t.spacing.md, alignItems: 'flex-start' }}>
            <Badge label={tr('reports:home.gettingStarted')} tone="info" icon="rocket-launch-outline" />
            <Text variant="h1">{tr('reports:home.welcome', { name: user?.name?.split(' ')[0] ?? '' }).trim()}</Text>
            <Text variant="body" tone="muted" style={{ maxWidth: 520, lineHeight: 22 }}>
              {tr('reports:home.welcomeBody', { company: company.name })}
            </Text>
            <View style={{ flexDirection: 'row', gap: t.spacing.md, marginTop: t.spacing.sm }}>
              <Button title={tr('reports:home.step.invoice.title')} icon="file-document-edit-outline" onPress={() => router.push('/(app)/sales/invoices/new')} />
              {canOpen('/(app)/contacts/customers/new') ? (
                <Button title={tr('common:quickAction.addCustomer')} icon="account-plus-outline" variant="secondary" onPress={() => router.push('/(app)/contacts/customers/new')} />
              ) : null}
            </View>
          </View>
          <Illustration name="empty-dashboard" size="hero" />
        </View>
      </Card>

      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionHeader title={tr('reports:home.setUpSteps')} />
          <Text variant="caption" tone="muted" weight="600">
            {tr('reports:home.stepsDone', { done: doneCount, total: steps.length })}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: t.spacing.lg }}>
          {steps.map((s, i) => (
            <Pressable
              key={s.key}
              onPress={() => router.push(s.route as never)}
              accessibilityRole="button"
              accessibilityLabel={tr(`reports:home.step.${s.key}.title` as 'reports:home.step.invoice.title')}
              style={(state) => ({
                flex: 1,
                gap: t.spacing.md,
                padding: t.spacing.lg,
                borderRadius: t.radius.lg,
                borderWidth: 1,
                borderColor: s.done ? t.c.good : t.c.line,
                ...pressStyle(state as WebPressState),
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ width: 40, height: 40, borderRadius: t.radius.md, backgroundColor: s.done ? t.c.goodSoft : t.c.chip, alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name={s.done ? 'check' : s.icon} size={20} color={s.done ? t.c.good : t.c.primary} />
                </View>
                <Text variant="caption" tone="muted" weight="600">
                  {tr('reports:home.stepNumber', { n: i + 1 })}
                </Text>
              </View>
              <View style={{ gap: 4 }}>
                <Text variant="body" weight="600">
                  {tr(`reports:home.step.${s.key}.title` as 'reports:home.step.invoice.title')}
                </Text>
                <Text variant="small" tone="muted" style={{ lineHeight: 19 }}>
                  {tr(`reports:home.step.${s.key}.body` as 'reports:home.step.invoice.body')}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <SectionHeader title={tr('reports:home.quickActions')} />
        <View style={{ gap: t.spacing.md }}>
          {rows.map((row, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: t.spacing.md }}>
              {row.map((a, i) =>
                a ? (
                  <Pressable
                    key={a.key}
                    onPress={() => router.push(a.route as never)}
                    accessibilityRole="button"
                    accessibilityLabel={a.label}
                    style={(state) => ({
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.spacing.md,
                      padding: t.spacing.md,
                      borderRadius: t.radius.lg,
                      borderWidth: 1,
                      borderColor: t.c.line,
                      ...pressStyle(state as WebPressState),
                    })}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: t.radius.md, backgroundColor: a.color ? t.c.primary : t.c.chip, alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialCommunityIcons name={a.icon} size={19} color={a.color ? t.c.onPrimary : t.c.primary} />
                    </View>
                    <Text variant="body" weight="500" style={{ flex: 1 }} numberOfLines={1}>
                      {a.label}
                    </Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
                  </Pressable>
                ) : (
                  // Sized like a card (padding and border count towards flex) so the columns line up.
                  <View key={`pad-${i}`} style={{ flex: 1, padding: t.spacing.md, borderWidth: 1, borderColor: 'transparent' }} />
                ),
              )}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
