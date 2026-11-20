import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { useUiStore } from '../../store/uiStore';
import { useAppStore } from '../../store/appStore';
import { useSetupSteps } from './setupSteps';

/**
 * Home's setup checklist: a progress bar and each step, ticked when done,
 * opening where it's done. It stays until everything is ticked or the person
 * hides it (per business, on this device). Renders nothing then, or while the
 * counts load, so Home doesn't flash a checklist it will take away.
 */
export function SetupChecklist() {
  const t = useTheme();
  const { t: tr } = useTranslation(['reports']);
  const router = useRouter();
  const desktop = useIsDesktop();
  const companyId = useAppStore((s) => s.activeCompanyId);
  const dismissed = useUiStore((s) => s.setupDismissed.includes(companyId));
  const dismiss = useUiStore((s) => s.dismissSetup);
  const { steps, doneCount, complete, loading } = useSetupSteps();
  // A short pulse when the checklist shows, so a new person sees it is what to do before the first invoice.
  const pulse = useRef(new Animated.Value(0)).current;
  const shown = !(loading || complete || dismissed || !steps.length);
  useEffect(() => {
    if (!shown) return;
    const run = Animated.sequence(
      Array.from({ length: 3 }, () => Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 600, useNativeDriver: false }),
      ])),
    );
    run.start();
    return () => run.stop();
  }, [shown, pulse]);
  if (loading || complete || dismissed || !steps.length) return null;

  const progress = doneCount / steps.length;
  return (
    <Animated.View
      style={{
        borderRadius: t.radius.lg + 2,
        borderWidth: 2,
        borderColor: pulse.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', t.c.primary] }),
        backgroundColor: pulse.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', t.c.chip] }),
      }}
    >
    <Card style={{ gap: t.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
        <Text variant="title" weight="600" style={{ flex: 1 }} role="heading" aria-level={2}>
          {tr('reports:home.setUpSteps')}
        </Text>
        <Text variant="caption" tone="muted" weight="600">
          {tr('reports:home.checklist.progress', { done: doneCount, total: steps.length })}
        </Text>
        <Pressable
          onPress={() => dismiss(companyId)}
          accessibilityRole="button"
          accessibilityLabel={tr('reports:home.checklist.dismiss')}
          hitSlop={8}
          style={(state) => [{ padding: 4, borderRadius: t.radius.sm }, focusRing(t, (state as WebPressState).focused)]}
        >
          <Icon name="close" size={16} color={t.c.muted} />
        </Pressable>
      </View>

      <View
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
        aria-label={tr('reports:home.checklist.progress', { done: doneCount, total: steps.length })}
        style={{ height: 6, borderRadius: 3, backgroundColor: t.c.card2, overflow: 'hidden' }}
      >
        <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: t.c.good, borderRadius: 3 }} />
      </View>

      <View style={desktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm } : { gap: 2 }}>
        {steps.map((s) => {
          const title = tr(`reports:home.step.${s.key}.title` as 'reports:home.step.invoice.title');
          return (
            <Pressable
              key={s.key}
              onPress={() => router.push(s.route as never)}
              accessibilityRole="button"
              accessibilityLabel={s.done ? `${title}, ${tr('reports:home.checklist.done')}` : title}
              accessibilityState={{ checked: s.done }}
              style={(state) => {
                const { hovered, pressed, focused } = state as WebPressState;
                return [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.spacing.md,
                    paddingVertical: t.spacing.sm,
                    paddingHorizontal: t.spacing.sm,
                    borderRadius: t.radius.md,
                    backgroundColor: hovered || pressed ? t.c.card2 : 'transparent',
                    // Three to a row on a desktop.
                    ...(desktop ? { width: '32.5%' as const } : null),
                  },
                  focusRing(t, focused),
                ];
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: s.done ? t.c.goodSoft : t.c.chip,
                }}
              >
                <Icon name={s.done ? 'check' : s.icon} size={15} color={s.done ? t.c.good : t.c.primary} />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text variant="small" weight="600" tone={s.done ? 'muted' : 'default'} numberOfLines={1}>
                  {title}
                </Text>
                {!s.done ? (
                  <Text variant="caption" tone="muted" numberOfLines={2}>
                    {tr(`reports:home.step.${s.bodyKey ?? `${s.key}.body`}` as 'reports:home.step.invoice.body')}
                  </Text>
                ) : null}
              </View>
              {!s.done ? <Icon name="chevron-right" size={16} color={t.c.muted} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Card>
    </Animated.View>
  );
}
