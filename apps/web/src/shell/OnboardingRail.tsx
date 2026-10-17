import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { BrandLogo } from '@esmart/ui/components/BrandLogo';
import { onboardingSteps, useOnboardingStore, type OnboardingStepKey } from '@esmart/app/store/onboardingStore';
import { useCurrentUser } from '@esmart/app/store/selectors';
import { useSignOut } from '@esmart/app/features/session/useSignOut';

export const ONBOARDING_RAIL_WIDTH = 300;

/**
 * The desktop onboarding wizard's left rail: every step the chosen plan
 * needs, ticked off as the user goes. Finished steps can be revisited.
 */
export function OnboardingRail() {
  const t = useTheme();
  const { t: tr } = useTranslation(['onboarding', 'nav']);
  const router = useRouter();
  const pathname = usePathname();
  const plan = useOnboardingStore((s) => s.draft.plan);
  const user = useCurrentUser();
  const signOut = useSignOut();

  const steps = onboardingSteps(plan);
  const segment = pathname.split('/').filter(Boolean).pop() ?? '';
  const current = segment === 'done' ? steps.length : steps.indexOf(segment as OnboardingStepKey);

  return (
    <View
      style={{
        width: ONBOARDING_RAIL_WIDTH,
        backgroundColor: t.c.paper,
        borderRightWidth: 1,
        borderRightColor: t.c.line,
        padding: t.spacing.xxl,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ gap: t.spacing.xxl }}>
        <BrandLogo height={36} />
        <Text variant="caption" tone="muted" weight="700" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {tr('onboarding:rail.title')}
        </Text>

        <View>
          {steps.map((key, i) => {
            const done = i < current;
            const active = i === current;
            const last = i === steps.length - 1;
            return (
              <Pressable
                key={key}
                disabled={!done}
                onPress={() => router.navigate(`/(onboarding)/${key}`)}
                accessibilityRole="link"
                accessibilityState={{ selected: active, disabled: !done }}
                accessibilityLabel={tr(`onboarding:step.${key}`)}
                style={(state) => {
                  const { hovered, focused } = state as WebPressState;
                  return [
                    { flexDirection: 'row', gap: t.spacing.md, borderRadius: t.radius.md, opacity: done && hovered ? 0.75 : 1 },
                    focusRing(t, focused),
                  ];
                }}
              >
                <View style={{ alignItems: 'center' }}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: done ? t.c.primary : active ? t.c.chip : 'transparent',
                      borderWidth: done ? 0 : 2,
                      borderColor: active ? t.c.primary : t.c.line,
                    }}
                  >
                    {done ? (
                      <MaterialCommunityIcons name="check" size={16} color={t.c.onPrimary} />
                    ) : (
                      <Text variant="caption" weight="700" tone={active ? 'primary' : 'muted'}>
                        {i + 1}
                      </Text>
                    )}
                  </View>
                  {last ? null : (
                    <View style={{ width: 2, flex: 1, minHeight: 22, backgroundColor: done ? t.c.primary : t.c.line }} />
                  )}
                </View>
                <View style={{ flex: 1, paddingTop: 3, paddingBottom: last ? 0 : t.spacing.xl, gap: 2 }}>
                  <Text variant="body" weight={active ? '700' : '600'} tone={active || done ? 'default' : 'muted'}>
                    {tr(`onboarding:step.${key}`)}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {tr(`onboarding:stepHint.${key}`)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: t.spacing.sm }}>
        {user ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {tr('onboarding:rail.signedInAs', { name: user.email || user.name })}
          </Text>
        ) : null}
        <Text variant="small" tone="primary" weight="600" accessibilityRole="button" onPress={signOut}>
          {tr('nav:more.signOut.row')}
        </Text>
      </View>
    </View>
  );
}
