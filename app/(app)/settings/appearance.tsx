import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme , ThemeMode } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { StatRow, StatTile } from '@/components/StatTile';
import { LixiAccess, useUiStore } from '@/store/uiStore';
import { AppLanguage, SUPPORTED_LANGUAGES } from '@/i18n/config';
import { SwitchField } from '@/components/Field';
import { LixiMark } from '@/features/lixi/LixiOrb';
import { fromMajor } from '@/lib/money';
import { useBaseCurrency } from '@/store/selectors';
import { useToast } from '@/components/Toast';

const LIXI_WAYS: { key: keyof LixiAccess; label: string; description: string }[] = [
  { key: 'holdTab', label: 'Hold a tab', description: 'Press and hold any tab; Lixi opens already answering about it.' },
  { key: 'swipeUp', label: 'Swipe up on the tab bar', description: 'Pull up from the bar and let go once the orb locks in.' },
  { key: 'floatingOrb', label: 'Floating orb', description: 'A small orb on the screen edge. Drag it anywhere; tap to open.' },
  { key: 'pullDown', label: 'Pull down on Home', description: 'Pull the Home screen down, like refreshing, to ask Lixi.' },
];

const MODES: { value: ThemeMode; label: string; description: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { value: 'system', label: 'Match device', description: 'Follows your phone’s light or dark setting.', icon: 'cellphone-cog' },
  { value: 'dark', label: 'Dark', description: 'The default look, easy on the eyes indoors.', icon: 'weather-night' },
  { value: 'light', label: 'Light', description: 'Higher contrast in bright sunlight.', icon: 'white-balance-sunny' },
];

/**
 * Each language is listed in its own script, with its English name underneath —
 * so somebody who cannot read the current UI language can still find theirs.
 */
const LANGUAGE_OPTIONS: {
  value: AppLanguage;
  label: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { value: 'system', label: '', description: '', icon: 'cellphone-cog' },
  ...SUPPORTED_LANGUAGES.map((l) => ({
    value: l.code as AppLanguage,
    label: l.native,
    description: l.label,
    icon: 'translate' as keyof typeof MaterialCommunityIcons.glyphMap,
  })),
];

type RadioRowProps = {
  label: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
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
        <MaterialCommunityIcons name={icon} size={19} color={active ? t.c.primary : t.c.muted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="600">
          {label}
        </Text>
        <Text variant="caption" tone="muted">
          {description}
        </Text>
      </View>
      {active ? <MaterialCommunityIcons name="check-circle" size={20} color={t.c.primary} /> : null}
    </Pressable>
  );
}

export default function Appearance() {
  const t = useTheme();
  const { t: tr } = useTranslation('settings');
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
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Appearance' }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40, gap: t.spacing.lg }} showsVerticalScrollIndicator={false}>
        <Card padded={false}>
          {MODES.map((m, i) => (
            <RadioRow
              key={m.value}
              label={m.label}
              description={m.description}
              icon={m.icon}
              active={themeMode === m.value}
              last={i === MODES.length - 1}
              onPress={() => setThemeMode(m.value)}
            />
          ))}
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {tr('language.sectionLabel')}
        </Text>

        <Card padded={false}>
          {LANGUAGE_OPTIONS.map((o, i) => (
            <RadioRow
              key={o.value}
              label={o.value === 'system' ? tr('language.matchDevice') : o.label}
              description={o.value === 'system' ? tr('language.matchDeviceHint') : o.description}
              icon={o.icon}
              active={language === o.value}
              last={i === LANGUAGE_OPTIONS.length - 1}
              onPress={() => setLanguage(o.value)}
            />
          ))}
        </Card>

        <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
          {tr('language.note')}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <LixiMark size={20} />
          <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Ways to open Lixi
          </Text>
        </View>

        <Card style={{ gap: t.spacing.xs }}>
          {LIXI_WAYS.map((w) => (
            <SwitchField
              key={w.key}
              label={w.label}
              description={w.description}
              value={lixiAccess[w.key]}
              onValueChange={(on) => setLixiAccess(w.key, on)}
            />
          ))}
          <Text variant="caption" tone="muted" style={{ marginTop: t.spacing.xs }}>
            With every way off, Lixi is still under More → Ask Lixi.
          </Text>
          {hintsLearned.swipeTabs || hintsLearned.swipeUp || hintsLearned.holdTab ? (
            <Pressable
              onPress={() => {
                resetLixiHints();
                toast.show('Gesture tips will show again above the tab bar', 'success');
              }}
              accessibilityRole="button"
              hitSlop={8}
              style={{ alignSelf: 'flex-start', marginTop: t.spacing.xs }}
            >
              <Text variant="caption" weight="700" style={{ color: t.c.primary }}>
                Show gesture tips again
              </Text>
            </Pressable>
          ) : null}
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Preview
        </Text>

        <StatRow>
          <StatTile label="Sales" value={fromMajor(482500, baseCurrency)} icon="trending-up" caption="12 invoices" />
          <StatTile label="Overdue" value={fromMajor(64300, baseCurrency)} tone="bad" icon="alert-circle-outline" caption="3 invoices" />
        </StatRow>

        <Card style={{ gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
            <Badge label="Paid" tone="success" />
            <Badge label="Partly paid" tone="warning" />
            <Badge label="Overdue" tone="danger" />
            <Badge label="Draft" tone="neutral" />
            <Badge label="Issued" tone="info" />
          </View>
          <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
            Status colours stay reserved for state, so they never double as chart series colours.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}
