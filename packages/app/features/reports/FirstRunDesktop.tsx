import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Illustration } from '@esmart/ui/components/Illustration';
import { SectionHeader } from '@esmart/ui/components/Screen';
import { quickActions } from '../../components/QuickActions';
import type { Company } from '@esmart/core/types';
import { useActiveCompany, useCanOpen, useCurrentUser } from '../../store/selectors';
import { SetupChecklist } from './SetupChecklist';

/**
 * Home for a business with nothing in it yet, on a desktop browser: a welcome
 * with the next move, the setup checklist with what's done ticked,
 * and the quick actions as a grid. The phone keeps its own single column.
 */
export function FirstRunDesktop() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'reports']);
  const router = useRouter();
  const canOpen = useCanOpen();
  const user = useCurrentUser();
  // Briefly undefined while signing out, before the router leaves this screen.
  const company = useActiveCompany() as Company | undefined;


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
              {tr('reports:home.welcomeBody', { company: company?.name ?? '' })}
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

      {/* The same checklist Home keeps showing until setup is done. */}
      <SetupChecklist />

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
                      <Icon name={a.icon} size={19} color={a.color ? t.c.onPrimary : t.c.primary} />
                    </View>
                    <Text variant="body" weight="500" style={{ flex: 1 }} numberOfLines={1}>
                      {a.label}
                    </Text>
                    <Icon name="chevron-right" size={18} color={t.c.muted} />
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
