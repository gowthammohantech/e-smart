import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Segmented } from '@esmart/ui/components/Field';
import { useToast } from '@esmart/ui/components/Toast';
import { useAppStore } from '@esmart/app/store/appStore';
import { useActiveCompany, useDocuments } from '@esmart/app/store/selectors';
import { PLANS, moduleSetFor, planInfo } from '@esmart/core/domain/plan';
import { planBlurb, planFeatures } from '@esmart/app/features/plan/planCopy';
import { formatNumber } from '@esmart/core/lib/format';
import type { PlanTier } from '@esmart/core/types';

type Cycle = 'monthly' | 'yearly';

/**
 * Plan & billing on a desktop: where you stand on top, the tiers side by side
 * beneath it. Same data and the same plan switch as the phone screen
 * (`@esmart/app/screens/(app)/settings/plan`), laid out for a wide window.
 */
export function PlanBillingDesktop() {
  const t = useTheme();
  const { t: tr } = useTranslation(['plan']);
  const toast = useToast();

  const [cycle, setCycle] = useState<Cycle>('yearly');
  const companies = useAppStore((s) => s.companies);
  const invoices = useDocuments('invoice');
  const company = useActiveCompany();
  const setPlan = useAppStore((s) => s.setPlan);
  const currentPlan = company.plan;
  const current = planInfo(currentPlan);

  const choose = (tier: PlanTier) => {
    setPlan(company.id, tier);
    const name = planInfo(tier).name;
    if (moduleSetFor(currentPlan) === 'full' && moduleSetFor(tier) === 'sales') {
      toast.show(tr('plan:billing.downgraded', { plan: name }), 'info');
    } else {
      toast.show(tr('plan:billing.switched', { plan: name }), 'success');
    }
  };

  const usage = [
    {
      label: tr('plan:billing.usageBusinesses'),
      value: tr('plan:billing.ofTotal', { used: companies.length, total: 3 }),
      ratio: companies.length / 3,
    },
    { label: tr('plan:billing.usageInvoices'), value: String(invoices.length), ratio: null },
    {
      label: tr('plan:billing.usageUsers'),
      value: tr('plan:billing.ofTotal', { used: 4, total: 6 }),
      ratio: 4 / 6,
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('plan:billing.title') }} />

      <ScrollView contentContainerStyle={{ paddingBottom: 48, gap: t.spacing.xxl }}>
        {/* Where you stand */}
        <Card style={{ padding: t.spacing.xxl }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.xxl }}>
            <View style={{ flexGrow: 1, flexBasis: 280, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: t.radius.md,
                  backgroundColor: t.c.chip,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MaterialCommunityIcons name="star-circle-outline" size={24} color={t.c.primary} />
              </View>
              <View style={{ gap: 2, flexShrink: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                  <Text variant="h3" weight="700">
                    {current.name}
                  </Text>
                  <Badge label={tr('plan:billing.active')} tone="success" />
                </View>
                <Text variant="small" tone="muted">
                  {current.yearly === 0
                    ? tr('plan:billing.freeForever')
                    : tr('plan:billing.renews', { price: `₹${formatNumber(current.yearly, 0, 'indian')}` })}
                </Text>
              </View>
            </View>

            <View style={{ flexGrow: 2, flexBasis: 420, flexDirection: 'row', gap: t.spacing.xxl }}>
              {usage.map((u) => (
                <View key={u.label} style={{ flex: 1, gap: t.spacing.xs }}>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {u.label}
                  </Text>
                  <Text variant="h3" weight="700">
                    {u.value}
                  </Text>
                  {u.ratio !== null ? (
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.c.card2, overflow: 'hidden' }}>
                      <View
                        style={{
                          width: `${Math.min(100, Math.round(u.ratio * 100))}%`,
                          height: 6,
                          backgroundColor: t.c.primary,
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        </Card>

        {/* Billing cycle */}
        <View style={{ alignItems: 'center' }}>
          <Segmented
            style={{ width: 360, maxWidth: '100%' }}
            options={[
              { value: 'monthly', label: tr('plan:billing.monthly') },
              { value: 'yearly', label: tr('plan:billing.yearlySave') },
            ]}
            value={cycle}
            onChange={(v) => setCycle(v as Cycle)}
          />
        </View>

        {/* The tiers, side by side */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.lg, alignItems: 'stretch' }}>
          {PLANS.map((p) => {
            const isCurrent = p.key === currentPlan;
            const price = cycle === 'monthly' ? p.monthly : p.yearly;
            return (
              <Card
                key={p.key}
                style={{
                  flexGrow: 1,
                  flexBasis: 220,
                  gap: t.spacing.lg,
                  padding: t.spacing.xl,
                  borderWidth: isCurrent ? 1.5 : t.scheme === 'dark' ? 1 : 0,
                  borderColor: isCurrent ? t.c.primary : t.c.line,
                }}
              >
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 }}>
                    <Text variant="title" weight="700">
                      {p.name}
                    </Text>
                    {p.popular ? <Badge label={tr('plan:billing.popular')} tone="info" size="sm" /> : null}
                  </View>
                  <Text variant="caption" tone="muted" style={{ minHeight: 32 }}>
                    {planBlurb(tr, p)}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text variant="h1" weight="700">
                    {price === 0 ? tr('plan:billing.free') : `₹${formatNumber(price, 0, 'indian')}`}
                  </Text>
                  {price > 0 ? (
                    <Text variant="small" tone="muted">
                      {cycle === 'monthly' ? tr('plan:billing.perMonth') : tr('plan:billing.perYear')}
                    </Text>
                  ) : null}
                </View>

                <View style={{ height: 1, backgroundColor: t.c.line }} />

                <View style={{ gap: t.spacing.sm, flex: 1 }}>
                  {planFeatures(tr, p).map((f) => (
                    <View key={f} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.sm }}>
                      <MaterialCommunityIcons name="check-circle" size={16} color={t.c.good} style={{ marginTop: 1 }} />
                      <Text variant="small" style={{ flex: 1 }}>
                        {f}
                      </Text>
                    </View>
                  ))}
                </View>

                <Button
                  title={
                    isCurrent
                      ? tr('plan:billing.currentPlan')
                      : price === 0
                        ? tr('plan:billing.downgrade')
                        : tr('plan:billing.choose')
                  }
                  variant={isCurrent ? 'ghost' : p.popular ? 'primary' : 'secondary'}
                  disabled={isCurrent}
                  onPress={() => choose(p.key)}
                  fullWidth
                />
              </Card>
            );
          })}
        </View>

        <Text variant="caption" tone="muted" center style={{ lineHeight: 18 }}>
          {tr('plan:billing.footnote')}
        </Text>
      </ScrollView>
    </View>
  );
}
