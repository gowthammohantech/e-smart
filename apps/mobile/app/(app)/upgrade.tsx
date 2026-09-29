import React from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme/ThemeProvider';
import { EmptyState } from '@/components/EmptyState';
import { FULL_PLAN, Module, planInfo } from '@/domain/plan';
import { moduleLabel } from '@/i18n/labels';
import { usePlan } from '@/store/selectors';

/**
 * Where a Sales-plan user lands when they open something only the full plan
 * has — a deep link, an old notification, a Lixi suggestion. Their records
 * are still there; this only explains why the screen is not.
 */
export default function Upgrade() {
  const t = useTheme();
  const { t: tr } = useTranslation(['domain', 'plan']);
  const router = useRouter();
  const { module } = useLocalSearchParams<{ module?: Module }>();
  const plan = planInfo(usePlan());
  const target = planInfo(FULL_PLAN);
  const label = module ? moduleLabel(tr, module) : tr('plan:upgrade.thisFeature');

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg, padding: t.spacing.lg }}>
      <Stack.Screen options={{ title: label }} />
      <EmptyState
        icon="lock-outline"
        title={tr('plan:upgrade.lockedTitle', { module: label, plan: target.name })}
        message={tr('plan:upgrade.lockedMessage', { currentPlan: plan.name })}
        actionLabel={tr('plan:upgrade.seePlans')}
        onAction={() => router.replace('/(app)/settings/plan')}
      />
    </View>
  );
}
