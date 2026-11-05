import React from 'react';
import { useTranslation } from 'react-i18next';
import { statusLabel } from '@esmart/core/labels';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme , ThemeMode } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { LixiAccess, useUiStore } from '../../../store/uiStore';
import { AppLanguage, SUPPORTED_LANGUAGES } from '@esmart/i18n/config';
import { SwitchField } from '@esmart/ui/components/Field';
import { LixiMark } from '@esmart/ui/components/LixiOrb';
import { fromMajor } from '@esmart/core/lib/money';
import { useBaseCurrency } from '../../../store/selectors';
import { useToast } from '@esmart/ui/components/Toast';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

const LIXI_WAYS = [
  { key: 'holdTab', label: 'settings:appearance.way.holdTab', description: 'settings:appearance.way.holdTabHint' },
  { key: 'swipeUp', label: 'settings:appearance.way.swipeUp', description: 'settings:appearance.way.swipeUpHint' },
  { key: 'floatingOrb', label: 'settings:appearance.way.floatingOrb', description: 'settings:appearance.way.floatingOrbHint' },
  { key: 'pullDown', label: 'settings:appearance.way.pullDown', description: 'settings:appearance.way.pullDownHint' },
] as const satisfies readonly { key: keyof LixiAccess; label: string; description: string }[];

const MODES = [
  { value: 'system', label: 'settings:language.matchDevice', description: 'settings:appearance.mode.systemHint', icon: 'cellphone-cog' },
  { value: 'dark', label: 'settings:appearance.mode.dark', description: 'settings:appearance.mode.darkHint', icon: 'weather-night' },
  { value: 'light', label: 'settings:appearance.mode.light', description: 'settings:appearance.mode.lightHint', icon: 'white-balance-sunny' },
] as const satisfies readonly { value: ThemeMode; label: string; description: string; icon: IconName }[];

/**
 * Each language is listed in its own script, with its English name underneath —
 * so somebody who cannot read the current UI language can still find theirs.
 */
const LANGUAGE_OPTIONS: {
  value: AppLanguage;
  label: string;
  description: string;
  icon: IconName;
}[] = [
  { value: 'system', label: '', description: '', icon: 'cellphone-cog' },
  ...SUPPORTED_LANGUAGES.map((l) => ({
    value: l.code as AppLanguage,
    label: l.native,
    description: l.label,
    icon: 'translate' as IconName,
  })),
];

type RadioRowProps = {
  label: string;
  description: string;
  icon: IconName;
  active: boolean;
  last: boolean;
  onPress: () => void;
};

/** One option in a card-shaped radio list. Shared by the theme and language lists. */
function RadioRow({ label, description, icon, active, last, onPress }: RadioRowProps) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        padding: t.spacing.lg,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: t.c.line,
        backgroundColor: pressed ? t.c.card2 : 'transparent',
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: active ? t.c.chip : t.c.mutedSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={19} color={active ? t.c.primary : t.c.muted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="600">
          {label}
        </Text>
        <Text variant="caption" tone="muted">
          {description}
        </Text>
      </View>
      {active ? <Icon name="check-circle" size={20} color={t.c.primary} /> : null}
    </Pressable>
  );
}

export default function Appearance() {
  const t = useTheme();
  const { t: tr } = useTranslation(['domain', 'nav', 'settings']);
  const baseCurrency = useBaseCurrency();
  const themeMode = useUiStore((s) => s.themeMode);
  const setThemeMode = useUiStore((s) => s.setThemeMode);
  const language = useUiStore((s) => s.language);
  const setLanguage = useUiStore((s) => s.setLanguage);
  const lixiAccess = useUiStore((s) => s.lixiAccess);
  const setLixiAccess = useUiStore((s) => s.setLixiAccess);
  const hintsLearned = useUiStore((s) => s.lixiHintsLearned);
  const resetLixiHints = useUiStore((s) => s.resetLixiHints);
  const toast = useToast();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.appearance') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card padded={false}>
          {MODES.map((m, i) => (
            <RadioRow
              key={m.value}
              label={tr(m.label)}
              description={tr(m.description)}
              icon={m.icon}
              active={themeMode === m.value}
              last={i === MODES.length - 1}
              onPress={() => setThemeMode(m.value)}
            />
          ))}
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {tr('settings:language.sectionLabel')}
        </Text>

        <Card padded={false}>
          {LANGUAGE_OPTIONS.map((o, i) => (
            <RadioRow
              key={o.value}
              label={o.value === 'system' ? tr('settings:language.matchDevice') : o.label}
              description={o.value === 'system' ? tr('settings:language.matchDeviceHint') : o.description}
              icon={o.icon}
              active={language === o.value}
              last={i === LANGUAGE_OPTIONS.length - 1}
              onPress={() => setLanguage(o.value)}
            />
          ))}
        </Card>

        <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
          {tr('settings:language.note')}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <LixiMark size={20} />
          <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('settings:appearance.lixiWays')}</Text>
        </View>

        <Card style={{ gap: t.spacing.xs }}>
          {LIXI_WAYS.map((w) => (
            <SwitchField
              key={w.key}
              label={tr(w.label)}
              description={tr(w.description)}
              value={lixiAccess[w.key]}
              onValueChange={(on) => setLixiAccess(w.key, on)}
            />
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
              hitSlop={8}
              style={{ alignSelf: 'flex-start', marginTop: t.spacing.xs }}
            >
              <Text variant="caption" weight="700" style={{ color: t.c.primary }}>{tr('settings:appearance.showTipsAgain')}</Text>
            </Pressable>
          ) : null}
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('settings:appearance.preview')}</Text>

        <StatRow>
          <StatTile
            label={tr('settings:appearance.sampleSales')}
            value={fromMajor(482500, baseCurrency)}
            icon="trending-up"
            caption={tr('settings:appearance.sampleInvoices', { count: 12 })}
          />
          <StatTile
            label={tr('settings:appearance.sampleOverdue')}
            value={fromMajor(64300, baseCurrency)}
            tone="bad"
            icon="alert-circle-outline"
            caption={tr('settings:appearance.sampleInvoices', { count: 3 })}
          />
        </StatRow>

        <Card style={{ gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
            <Badge label={statusLabel(tr, 'paid')} tone="success" />
            <Badge label={statusLabel(tr, 'partiallyPaid')} tone="warning" />
            <Badge label={statusLabel(tr, 'overdue')} tone="danger" />
            <Badge label={statusLabel(tr, 'draft')} tone="neutral" />
            <Badge label={statusLabel(tr, 'issued')} tone="info" />
          </View>
          <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>{tr('settings:appearance.statusColourNote')}</Text>
        </Card>
      </ScrollView>
    </View>
  );
}
