import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import { useActiveCompany, useDocuments } from '@/store/selectors';
import { PLANS, moduleSetFor, planInfo } from '@/domain/plan';
import { planBlurb, planFeatures } from '@/features/plan/planCopy';
import { formatNumber } from '@/lib/format';
import type { PlanTier } from '@/types';

type Cycle = 'monthly' | 'yearly';

export default function PlanBilling() {
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

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('plan:billing.title') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40, gap: t.spacing.lg }} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <MaterialCommunityIcons name="star-circle-outline" size={22} color={t.c.primary} />
            <Text variant="title" weight="700" style={{ flex: 1 }}>
              {current.name}
            </Text>
            <Badge label={tr('plan:billing.active')} tone="success" />
          </View>
          <Text variant="caption" tone="muted">
            {current.yearly === 0
              ? tr('plan:billing.freeForever')
              : tr('plan:billing.renews', { price: `₹${formatNumber(current.yearly, 0, 'indian')}` })}
          </Text>
          <View style={{ height: 1, backgroundColor: t.c.line }} />
          {[
            {
              label: tr('plan:billing.usageBusinesses'),
              value: tr('plan:billing.ofTotal', { used: companies.length, total: 3 }),
            },
            { label: tr('plan:billing.usageInvoices'), value: String(invoices.length) },
            { label: tr('plan:billing.usageUsers'), value: tr('plan:billing.ofTotal', { used: 4, total: 6 }) },
          ].map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="small" tone="muted">
                {r.label}
              </Text>
              <Text variant="small" weight="600">
                {r.value}
              </Text>
            </View>
          ))}
        </Card>

        <Segmented
          options={[
            { value: 'monthly', label: tr('plan:billing.monthly') },
            { value: 'yearly', label: tr('plan:billing.yearlySave') },
          ]}
          value={cycle}
          onChange={(v) => setCycle(v as Cycle)}
        />

        {PLANS.map((p) => {
          const isCurrent = p.key === currentPlan;
          const price = cycle === 'monthly' ? p.monthly : p.yearly;
          return (
            <Card
              key={p.key}
              style={{
                gap: t.spacing.md,
                borderWidth: isCurrent ? 1.5 : t.scheme === 'dark' ? 1 : 0,
                borderColor: isCurrent ? t.c.primary : t.c.line,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <View style={{ gap: 3, flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text variant="title" weight="700">
                      {p.name}
                    </Text>
                    {p.popular ? <Badge label={tr('plan:billing.popular')} tone="info" size="sm" /> : null}
                  </View>
                  <Text variant="caption" tone="muted">
                    {planBlurb(tr, p)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="h3" weight="700">
                    {price === 0 ? tr('plan:billing.free') : `₹${formatNumber(price, 0, 'indian')}`}
                  </Text>
                  {price > 0 ? (
                    <Text variant="micro" tone="muted">
                      {cycle === 'monthly' ? tr('plan:billing.perMonth') : tr('plan:billing.perYear')}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={{ gap: 7 }}>
                {planFeatures(tr, p).map((f) => (
                  <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                    <MaterialCommunityIcons name="check" size={15} color={t.c.good} />
                    <Text variant="small" tone="muted" style={{ flex: 1 }}>
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
                variant={isCurrent ? 'ghost' : 'primary'}
                disabled={isCurrent}
                onPress={() => choose(p.key)}
                fullWidth
              />
            </Card>
          );
        })}

        <Text variant="caption" tone="muted" center style={{ lineHeight: 18 }}>
          {tr('plan:billing.footnote')}
        </Text>
      </ScrollView>
    </View>
  );
}
