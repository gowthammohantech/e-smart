import React, { useState } from 'react';
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
import { useDocuments } from '@/store/selectors';

type Cycle = 'monthly' | 'yearly';

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    monthly: 0,
    yearly: 0,
    blurb: 'Get going and see if it fits.',
    features: ['1 business', '20 invoices a month', 'Basic reports', 'Single user'],
  },
  {
    key: 'basic',
    name: 'Smart Basic',
    monthly: 399,
    yearly: 3990,
    blurb: 'For a shop or a solo trader.',
    features: ['1 business, 2 users', 'Unlimited invoices', 'GST-ready documents', 'Receivables & reminders', 'Basic stock'],
  },
  {
    key: 'pro',
    name: 'Smart Pro',
    monthly: 899,
    yearly: 8990,
    blurb: 'For a growing business with staff.',
    features: ['3 businesses, 6 users', 'Branches & transfers', 'E-invoice & e-way bill', 'Multi-currency', 'OCR capture', 'All reports'],
    popular: true,
  },
  {
    key: 'business',
    name: 'Smart Business',
    monthly: 1799,
    yearly: 17990,
    blurb: 'Multiple locations and heavier volume.',
    features: ['Unlimited businesses & users', 'Role-based access', 'Priority compliance support', 'Backup & audit export', 'Assistant'],
  },
];

export default function PlanBilling() {
  const t = useTheme();
  const toast = useToast();

  const [cycle, setCycle] = useState<Cycle>('yearly');
  const companies = useAppStore((s) => s.companies);
  const invoices = useDocuments('invoice');
  const currentPlan = 'pro';

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Plan & billing' }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40, gap: t.spacing.lg }} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <MaterialCommunityIcons name="star-circle-outline" size={22} color={t.c.primary} />
            <Text variant="title" weight="700" style={{ flex: 1 }}>
              Smart Pro
            </Text>
            <Badge label="Active" tone="success" />
          </View>
          <Text variant="caption" tone="muted">
            Renews on 1 April · ₹8,990 a year
          </Text>
          <View style={{ height: 1, backgroundColor: t.c.line }} />
          {[
            { label: 'Businesses', value: `${companies.length} of 3` },
            { label: 'Invoices this year', value: String(invoices.length) },
            { label: 'Users', value: '4 of 6' },
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
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: 'Yearly · save 2 months' },
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
                    {p.popular ? <Badge label="Popular" tone="info" size="sm" /> : null}
                  </View>
                  <Text variant="caption" tone="muted">
                    {p.blurb}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="h3" weight="700">
                    {price === 0 ? 'Free' : `₹${price.toLocaleString('en-IN')}`}
                  </Text>
                  {price > 0 ? (
                    <Text variant="micro" tone="muted">
                      per {cycle === 'monthly' ? 'month' : 'year'}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={{ gap: 7 }}>
                {p.features.map((f) => (
                  <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                    <MaterialCommunityIcons name="check" size={15} color={t.c.good} />
                    <Text variant="small" tone="muted" style={{ flex: 1 }}>
                      {f}
                    </Text>
                  </View>
                ))}
              </View>

              <Button
                title={isCurrent ? 'Current plan' : price === 0 ? 'Downgrade' : 'Choose this plan'}
                variant={isCurrent ? 'ghost' : 'primary'}
                disabled={isCurrent}
                onPress={() => toast.show(`${p.name} selected — billing is not live in this prototype`, 'info')}
                fullWidth
              />
            </Card>
          );
        })}

        <Text variant="caption" tone="muted" center style={{ lineHeight: 18 }}>
          Elixir Books Smart is priced separately from Elixir Books ERP. Prices shown are illustrative.
        </Text>
      </ScrollView>
    </View>
  );
}
