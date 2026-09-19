import React from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { EmptyState } from '@/components/EmptyState';
import { FULL_PLAN, MODULE_LABELS, Module, planInfo } from '@/domain/plan';
import { usePlan } from '@/store/selectors';

/**
 * Where a Sales-plan user lands when they open something only the full plan
 * has — a deep link, an old notification, a Lixi suggestion. Their records
 * are still there; this only explains why the screen is not.
 */
export default function Upgrade() {
  const t = useTheme();
  const router = useRouter();
  const { module } = useLocalSearchParams<{ module?: Module }>();
  const plan = planInfo(usePlan());
  const target = planInfo(FULL_PLAN);
  const label = (module && MODULE_LABELS[module]) || 'This feature';

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg, padding: t.spacing.lg }}>
      <Stack.Screen options={{ title: label }} />
      <EmptyState
        icon="lock-outline"
        title={`${label} is on ${target.name}`}
        message={`${plan.name} covers selling and GST. Upgrade to buy, stock and track expenses in the same books — anything you recorded before stays as it was.`}
        actionLabel="See plans"
        onAction={() => router.replace('/(app)/settings/plan')}
      />
    </View>
  );
}
