import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { useServerSave } from '../../../components/useServerSave';
import { useAppStore } from '../../../store/appStore';
import { useComplianceSettings } from '../../../store/selectors';
import { Integration } from '@esmart/core/types';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

const GROUPS = [
  { key: 'payments', title: 'settings:integrations.group.payments', blurb: 'settings:integrations.group.paymentsHint' },
  { key: 'compliance', title: 'settings:integrations.group.compliance', blurb: 'settings:integrations.group.complianceHint' },
  { key: 'messaging', title: 'settings:integrations.group.messaging', blurb: 'settings:integrations.group.messagingHint' },
  { key: 'accounting', title: 'settings:integrations.group.accounting', blurb: 'settings:integrations.group.accountingHint' },
  { key: 'storage', title: 'settings:integrations.group.storage', blurb: 'settings:integrations.group.storageHint' },
] as const satisfies readonly { key: Integration['category']; title: string; blurb: string }[];

/** The government portals open their own login screen on the tab for that portal. */
const PORTAL_OF: Record<string, 'einvoice' | 'ewaybill'> = { int_einvoice: 'einvoice', int_eway: 'ewaybill' };

export default function Integrations() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'settings']);
  const { run: serverSave } = useServerSave();
  const router = useRouter();

  // The store holds every business opened this session: only this one's.
  const companyId = useAppStore((s) => s.activeCompanyId);
  const allIntegrations = useAppStore((s) => s.integrations);
  const integrations = useMemo(() => allIntegrations.filter((i) => i.companyId === companyId), [allIntegrations, companyId]);
  const toggleIntegration = useAppStore((s) => s.toggleIntegration);
  const compliance = useComplianceSettings();
  // A portal has a login once its username is saved (the password is never sent back).
  const hasLogin = (id: string) => (id === 'int_einvoice' ? !!compliance.irpUsername : id === 'int_eway' ? !!compliance.ewbUsername : true);

  const openConfig = (i: Integration) => {
    const portal = PORTAL_OF[i.id];
    router.push((portal ? { pathname: i.configRoute, params: { portal } } : i.configRoute) as never);
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.integrations') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card variant="flat" style={{ marginBottom: t.spacing.lg }}>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            {tr('settings:integrations.intro')}
          </Text>
        </Card>

        {GROUPS.map((g) => {
          const rows = integrations.filter((i) => i.category === g.key);
          if (rows.length === 0) return null;
          return (
            <View key={g.key} style={{ marginBottom: t.spacing.xl }}>
              <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
                {tr(g.title)}
              </Text>
              <Text variant="caption" tone="muted" style={{ marginBottom: t.spacing.sm }}>
                {tr(g.blurb)}
              </Text>
              <Card padded={false}>
                {rows.map((i, idx) => (
                  <View
                    key={i.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.spacing.md,
                      padding: t.spacing.lg,
                      borderBottomWidth: idx < rows.length - 1 ? 0.5 : 0,
                      borderBottomColor: t.c.line,
                    }}
                  >
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: t.radius.sm,
                        backgroundColor: i.connected ? t.c.chip : t.c.mutedSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon
                        name={i.icon as IconName}
                        size={19}
                        color={i.connected ? t.c.primary : t.c.muted}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text variant="body" weight="600">
                          {i.name}
                        </Text>
                        {i.connected ? <Badge label={tr('settings:integrations.connected')} tone="success" size="sm" /> : null}
                        {!i.connected && i.available === false ? <Badge label={tr('settings:integrations.comingSoon')} tone="neutral" size="sm" /> : null}
                      </View>
                      <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
                        {i.description}
                      </Text>
                      {i.configRoute ? (
                        <Pressable
                          onPress={() => openConfig(i)}
                          accessibilityRole="button"
                          accessibilityLabel={tr('settings:integrations.configureNamed', { name: i.name })}
                          // A 44pt target, though it reads as a link.
                          style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, minHeight: 44, paddingRight: t.spacing.md, marginVertical: -t.spacing.sm }}
                        >
                          <Text variant="caption" tone="primary" weight="600">{tr('settings:integrations.configure')}</Text>
                          <Icon name="chevron-right" size={14} color={t.c.primary} />
                        </Pressable>
                      ) : null}
                    </View>
                    <Switch
                      value={i.connected}
                      // Coming soon: nothing to switch on yet (one already connected can still be switched off).
                      disabled={!i.connected && i.available === false}
                      onValueChange={() => {
                        // A portal with no login yet cannot be switched on: ask for the login instead. With one saved,
                        // the switch simply turns it on or off.
                        if (!i.connected && !hasLogin(i.id)) {
                          openConfig(i);
                          return;
                        }
                        // Connected or disconnected only once the server has it.
                        void serverSave(
                          () => toggleIntegration(i.id),
                          i.connected ? tr('settings:integrations.disconnectedNamed', { name: i.name }) : tr('settings:integrations.connectedNamed', { name: i.name }),
                          { icon: i.connected ? 'link-variant-off' : 'link-variant' },
                        );
                      }}
                      trackColor={{ true: t.c.primary, false: t.c.line }}
                      thumbColor="#FFFFFF"
                      // On the web the "on" thumb defaults to green; keep it white like the rest.
                      {...(Platform.OS === 'web' ? ({ activeThumbColor: '#FFFFFF' } as object) : null)}
                      accessibilityLabel={i.connected ? tr('settings:integrations.disconnectNamed', { name: i.name }) : tr('settings:integrations.connectNamed', { name: i.name })}
                    />
                  </View>
                ))}
              </Card>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
