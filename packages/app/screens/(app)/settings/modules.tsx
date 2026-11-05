import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { SwitchField } from '@esmart/ui/components/Field';
import { Text } from '@esmart/ui/components/Text';
import { FormContainer } from '@esmart/ui/components/Layout';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { MODULE_DEPENDS, MODULES, dependentsOf, hasModule, type Module } from '@esmart/core/domain/plan';
import { moduleLabel } from '@esmart/core/labels';
import { useServerSave } from '../../../components/useServerSave';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useCurrentUser, useDisabledModules, usePlan } from '../../../store/selectors';

/**
 * The parts of the app this business uses. Switching one off hides it and refuses its work; its
 * records stay and come back when it is switched on. What a module needs goes with it.
 */
export default function ModulesScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['settings', 'domain']);
  const company = useActiveCompany();
  const plan = usePlan();
  const disabled = useDisabledModules();
  const owner = useCurrentUser()?.role === 'owner';
  const saveCompany = useAppStore((s) => s.saveCompany);
  const { run: serverSave, saving } = useServerSave();
  const inPlan = MODULES.filter((m) => hasModule(plan, m));

  const toggle = (module: Module, on: boolean) => {
    // Off takes what depends on it along; on brings back what it needs.
    const next = new Set(disabled);
    if (on) [module, ...(MODULE_DEPENDS[module] ?? [])].forEach((m) => next.delete(m));
    else [module, ...dependentsOf(module)].forEach((m) => next.add(m));
    void serverSave(() => saveCompany({ ...company, disabledModules: [...next].sort() }), tr(on ? 'settings:modules.on' : 'settings:modules.off', { module: moduleLabel(tr, module) }), { icon: 'toggle-switch-outline' });
  };

  return (
    <FormContainer>
      <Stack.Screen options={{ title: tr('settings:modules.title') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Text variant="small" tone="muted">
          {tr(owner ? 'settings:modules.hint' : 'settings:modules.ownerOnly')}
        </Text>
        <Card style={{ gap: t.spacing.sm }}>
          {inPlan.map((m) => {
            const needs = (MODULE_DEPENDS[m] ?? []).map((d) => moduleLabel(tr, d));
            const takes = dependentsOf(m).filter((d) => inPlan.includes(d)).map((d) => moduleLabel(tr, d));
            return (
              <View key={m}>
                <SwitchField
                  label={moduleLabel(tr, m)}
                  description={[tr(`settings:modules.about.${m}`), needs.length ? tr('settings:modules.needs', { list: needs.join(', ') }) : '', takes.length ? tr('settings:modules.takes', { list: takes.join(', ') }) : ''].filter(Boolean).join(' ')}
                  value={!disabled.includes(m)}
                  onValueChange={(on) => toggle(m, on)}
                  disabled={!owner || saving}
                />
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </FormContainer>
  );
}
