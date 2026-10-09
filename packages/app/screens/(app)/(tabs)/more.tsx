import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useSignOut } from '../../../features/session/useSignOut';
import { AppHeader } from '../../../components/AppHeader';
import { SectionHeader } from '@esmart/ui/components/Screen';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { Avatar } from '@esmart/ui/components/Avatar';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Badge } from '@esmart/ui/components/Badge';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useToast } from '@esmart/ui/components/Toast';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useCurrentUser } from '../../../store/selectors';
import { useMoreGroups } from '../../../navigation/moreGroups';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';

export default function MoreTab() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'nav']);
  const router = useRouter();
  const toast = useToast();

  const user = useCurrentUser();
  const company = useActiveCompany();
  const signOut = useSignOut();
  const resetDemoData = useAppStore((s) => s.resetDemoData);

  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const groups = useMoreGroups();
  // A desktop shows the groups as a grid of cards, a settings hub.
  const desktop = useIsDesktop();

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <AppHeader title={tr('nav:more.header.title')} subtitle={tr('nav:more.header.subtitle')} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        <Card
          onPress={() => router.push('/(app)/settings/profile')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}
        >
          <Avatar name={user?.name ?? 'You'} size={50} color={user?.avatarColor} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="title">{user?.name}</Text>
            <Text variant="caption" tone="muted">
              {user?.email}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 3 }}>
              <Badge label={user?.role ?? 'owner'} tone="info" size="sm" />
              <Badge label={company?.name ?? ''} tone="neutral" size="sm" />
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
        </Card>

        <View style={desktop ? { flexDirection: 'row', flexWrap: 'wrap', columnGap: t.spacing.xl } : undefined}>
        {groups.map((g) => (
          <View key={g.title} style={desktop ? { flexBasis: 360, flexGrow: 1 } : undefined}>
            <SectionHeader title={g.title} />
            <Card padded={false}>
              {g.entries.map((e, i) => (
                <ListRow
                  key={e.label}
                  title={e.label}
                  icon={e.icon}
                  chevron
                  divider={i < g.entries.length - 1}
                  onPress={() => router.push(e.route as never)}
                  right={e.badge ? <Badge label={e.badge} tone="danger" size="sm" count /> : undefined}
                />
              ))}
            </Card>
          </View>
        ))}
        </View>

        <SectionHeader title={tr('nav:more.group.prototype')} />
        <Card padded={false}>
          <ListRow
            title={tr('nav:more.reset.row')}
            subtitle={tr('nav:more.reset.rowSubtitle')}
            icon="restore"
            iconColor={t.c.warn}
            onPress={() => setConfirmReset(true)}
          />
          <ListRow
            title={tr('nav:more.signOut.row')}
            icon="logout"
            iconColor={t.c.bad}
            destructive
            divider={false}
            onPress={() => setConfirmSignOut(true)}
          />
        </Card>

        <Text variant="micro" tone="muted" center style={{ marginTop: t.spacing.xl }}>
          {tr('nav:more.build', { version: '1.0.0' })}
        </Text>
      </ScrollView>

      <ConfirmDialog
        visible={confirmReset}
        title={tr('nav:more.reset.title')}
        message={tr('nav:more.reset.message')}
        confirmLabel={tr('nav:more.reset.confirm')}
        destructive
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          resetDemoData();
          setConfirmReset(false);
          toast.show(tr('nav:more.reset.done'), 'success');
        }}
      />

      <ConfirmDialog
        visible={confirmSignOut}
        title={tr('nav:more.signOut.title')}
        message={tr('nav:more.signOut.message')}
        confirmLabel={tr('nav:more.signOut.confirm')}
        destructive
        icon="logout"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setConfirmSignOut(false);
          signOut();
        }}
      />
    </View>
  );
}
