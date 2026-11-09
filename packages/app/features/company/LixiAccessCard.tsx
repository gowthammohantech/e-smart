import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { SwitchField } from '@esmart/ui/components/Field';
import { LixiMark } from '@esmart/ui/components/LixiOrb';
import { useToast } from '@esmart/ui/components/Toast';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { type LixiAccess, useUiStore } from '../../store/uiStore';

const LIXI_WAYS = [
  { key: 'holdTab', label: 'settings:appearance.way.holdTab', description: 'settings:appearance.way.holdTabHint' },
  { key: 'swipeUp', label: 'settings:appearance.way.swipeUp', description: 'settings:appearance.way.swipeUpHint' },
  { key: 'floatingOrb', label: 'settings:appearance.way.floatingOrb', description: 'settings:appearance.way.floatingOrbHint' },
  { key: 'pullDown', label: 'settings:appearance.way.pullDown', description: 'settings:appearance.way.pullDownHint' },
] as const satisfies readonly { key: keyof LixiAccess; label: string; description: string }[];

/**
 * The ways Lixi can be opened on this device, each a switch that saves as it is flipped, and a way
 * to see the gesture tips again. Lives with AI usage, where the rest of Lixi's settings are.
 */
export function LixiAccessCard() {
  const t = useTheme();
  const { t: tr } = useTranslation(['settings', 'nav']);
  const toast = useToast();
  const lixiAccess = useUiStore((s) => s.lixiAccess);
  const setLixiAccess = useUiStore((s) => s.setLixiAccess);
  const hintsLearned = useUiStore((s) => s.lixiHintsLearned);
  const resetLixiHints = useUiStore((s) => s.resetLixiHints);
  // Holding a tab, swiping up, the floating orb and pulling down are phone gestures; a desktop opens Lixi from its side panel.
  const desktop = useIsDesktop();
  if (desktop) return null;

  return (
    <View style={{ gap: t.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
        <LixiMark size={20} />
        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {tr('settings:appearance.lixiWays')}
        </Text>
      </View>
      <Card style={{ gap: t.spacing.xs }}>
        {LIXI_WAYS.map((w) => (
          <SwitchField key={w.key} label={tr(w.label)} description={tr(w.description)} value={lixiAccess[w.key]} onValueChange={(on) => setLixiAccess(w.key, on)} />
        ))}
        <Text variant="caption" tone="muted" style={{ marginTop: t.spacing.xs }}>
          {tr('settings:appearance.allOffNote', { more: tr('nav:more.header.title'), askLixi: tr('nav:more.entry.askLixi') })}
        </Text>
        {hintsLearned.swipeTabs || hintsLearned.swipeUp || hintsLearned.holdTab ? (
          <Pressable
            onPress={() => {
              resetLixiHints();
              toast.show(tr('settings:appearance.tipsReset'), 'success', { icon: 'lightbulb-on-outline' });
            }}
            accessibilityRole="button"
            style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: t.spacing.xs }}
          >
            <Text variant="caption" weight="700" style={{ color: t.c.primary }}>
              {tr('settings:appearance.showTipsAgain')}
            </Text>
          </Pressable>
        ) : null}
      </Card>
    </View>
  );
}
