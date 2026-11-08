import React from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Button } from '@esmart/ui/components/Button';
import { FULL_PLAN, Module, planInfo } from '@esmart/core/domain/plan';
import { moduleLabel } from '@esmart/core/labels';
import { usePlan } from '../../store/selectors';

/**
 * Where a Sales-plan user lands when they open something only the full plan
 * has — a deep link, an old notification, a Lixi suggestion. Their records
 * are still there; this only explains why the screen is not.
 */
export default function Upgrade() {
  const t = useTheme();
  const { t: tr } = useTranslation(['domain', 'plan', 'common']);
  const router = useRouter();
  const { module } = useLocalSearchParams<{ module?: Module }>();
  const plan = planInfo(usePlan());
  const target = planInfo(FULL_PLAN);
  const label = module ? moduleLabel(tr, module) : tr('plan:upgrade.thisFeature');

  return (
    <View style={{ flex: 1, padding: t.spacing.lg, justifyContent: 'center' }}>
      <Stack.Screen options={{ title: label }} />
      <EmptyState
        illustration="locked"
        title={tr('plan:upgrade.lockedTitle', { module: label, plan: target.name })}
        message={tr('plan:upgrade.lockedMessage', { currentPlan: plan.name })}
      />
      {/* The way on is the page's main action, not a small link under the message. */}
      <View style={{ width: '100%', maxWidth: 360, alignSelf: 'center', gap: t.spacing.sm }}>
        <Button title={tr('plan:upgrade.seePlans')} icon="star-circle-outline" onPress={() => router.replace('/(app)/settings/plan')} fullWidth />
        {router.canGoBack() ? <Button title={tr('common:component.goBack')} variant="ghost" onPress={() => router.back()} fullWidth /> : null}
      </View>
    </View>
  );
}
