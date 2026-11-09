import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Segmented } from '@esmart/ui/components/Field';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useListsReady } from '../../../store/selectors';
import { Skeleton, SkeletonGroup } from '@esmart/ui/components/Skeleton';
import { useCompanyUsage } from '../../../remote/queries';
import { PLANS, planInfo, userLimit } from '@esmart/core/domain/plan';
import { planBlurb, planFeatures } from '../../../features/plan/planCopy';
import { formatNumber } from '@esmart/core/lib/format';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

type Cycle = 'monthly' | 'yearly';

/**
 * The phone apps don't sell plans (App Store and Play billing rules), so they show no prices, no
 * billing cycle and nothing about paying: what each plan includes, and which one the business is on.
 */
const SHOWS_PRICES = Platform.OS === 'web';

export default function PlanBilling() {
  const t = useTheme();
  const { t: tr } = useTranslation(['plan']);

  const [cycle, setCycle] = useState<Cycle>('yearly');
  const companies = useAppStore((s) => s.companies);
  // Only people who have accepted count; a pending invitation is not a user yet.
  const teamSize = useAppStore((s) => s.users.filter((u) => u.status === 'active' && u.companyIds.includes(s.activeCompanyId)).length);
  const pendingInvites = useAppStore((s) => s.users.filter((u) => u.status === 'invited' && u.companyIds.includes(s.activeCompanyId)).length);
  const usageQuery = useCompanyUsage();
  const usage = usageQuery.data;
  // Until the team has loaded the store holds only you: a placeholder, not "1 of N".
  const teamReady = useListsReady();
  const company = useActiveCompany();
  const currentPlan = company.plan;
  const current = planInfo(currentPlan);
  const seatLimit = userLimit(currentPlan);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('plan:billing.title') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card style={{ gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <Icon name="star-circle-outline" size={22} color={t.c.primary} />
            <Text variant="title" weight="700" style={{ flex: 1 }}>
              {current.name}
            </Text>
            <Badge label={tr('plan:billing.active')} tone="success" />
          </View>
          {SHOWS_PRICES ? (
            <Text variant="caption" tone="muted">
              {current.yearly === 0
                ? tr('plan:billing.freeForever')
                : tr('plan:billing.renews', { price: `₹${formatNumber(current.yearly, 0, 'indian')}` })}
            </Text>
          ) : null}
          <View style={{ height: 1, backgroundColor: t.c.line }} />
          {[
            // Real counts. The plan's limits aren't served by the API yet (docs/PRODUCTION_READINESS.md).
            { label: tr('plan:billing.usageBusinesses'), value: String(companies.length) },
            // null: not known yet, drawn as a placeholder.
            { label: tr('plan:billing.usageInvoices'), value: usage ? String(usage.counts.invoices) : usageQuery.isError ? '—' : null },
            {
              label: tr('plan:billing.usageUsers'),
              value: !teamReady ? null : seatLimit === null ? String(teamSize) : tr('plan:billing.ofTotal', { used: teamSize, total: seatLimit }),
            },
            ...(teamReady && pendingInvites > 0 ? [{ label: tr('plan:billing.usagePending'), value: String(pendingInvites) }] : []),
          ].map((r: { label: string; value: string | null }) => (
            <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="small" tone="muted">
                {r.label}
              </Text>
              {r.value === null ? (
                <SkeletonGroup>
                  <Skeleton height={14} width={48} />
                </SkeletonGroup>
              ) : (
                <Text variant="small" weight="600">
                  {r.value}
                </Text>
              )}
            </View>
          ))}
        </Card>

        {SHOWS_PRICES ? (
          <Segmented
            options={[
              { value: 'monthly', label: tr('plan:billing.monthly') },
              { value: 'yearly', label: tr('plan:billing.yearlySave') },
            ]}
            value={cycle}
            onChange={(v) => setCycle(v as Cycle)}
          />
        ) : null}

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
                <View style={{ alignItems: 'flex-end', display: SHOWS_PRICES ? 'flex' : 'none' }}>
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
                    <Icon name="check" size={15} color={t.c.good} />
                    <Text variant="small" tone="muted" style={{ flex: 1 }}>
                      {f}
                    </Text>
                  </View>
                ))}
              </View>

              {isCurrent ? <Button title={tr('plan:billing.currentPlan')} variant="ghost" disabled fullWidth /> : null}
            </Card>
          );
        })}

        {SHOWS_PRICES ? (
          <Text variant="caption" tone="muted" center style={{ lineHeight: 18 }}>
            {tr('plan:billing.footnote')}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
