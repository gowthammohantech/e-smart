import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { Badge } from './Badge';
import { SelectSheet } from './pickers/SelectSheet';
import { useAppStore } from '@/store/appStore';
import { useActiveCompany, useBranches, useUnreadCount } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';

/**
 * Tab-level header: company/branch switcher on the left, sync state, global
 * search and notifications on the right.
 */
export function AppHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const company = useActiveCompany();
  const branches = useBranches();
  const companies = useAppStore((s) => s.companies);
  const activeBranchId = useAppStore((s) => s.activeBranchId);
  const setActiveCompany = useAppStore((s) => s.setActiveCompany);
  const setActiveBranch = useAppStore((s) => s.setActiveBranch);
  const unread = useUnreadCount();
  const offline = useUiStore((s) => s.offlineMode);
  const pendingSync = useAppStore((s) => s.syncQueue.length);

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);

  const branch = branches.find((b) => b.id === activeBranchId);

  const iconButton = (
    icon: keyof typeof MaterialCommunityIcons.glyphMap,
    label: string,
    onPress: () => void,
    badge?: number,
  ) => (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: t.c.card,
        borderWidth: t.scheme === 'dark' ? 1 : 0,
        borderColor: t.c.line,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <MaterialCommunityIcons name={icon} size={19} color={t.c.text} />
      {badge && badge > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            minWidth: 15,
            height: 15,
            borderRadius: 8,
            paddingHorizontal: 3,
            backgroundColor: t.c.bad,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '700' }}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );

  return (
    <View
      style={{
        paddingTop: insets.top + t.spacing.sm,
        paddingHorizontal: t.spacing.lg,
        paddingBottom: t.spacing.md,
        backgroundColor: t.c.bg,
        gap: t.spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
        <Pressable
          onPress={() => setSwitcherOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Switch business. Current: ${company?.name}`}
          style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1 })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="title" weight="700" numberOfLines={1} style={{ flexShrink: 1 }}>
              {title ?? company?.name ?? tr('common:component.business')}
            </Text>
            {!title ? <MaterialCommunityIcons name="chevron-down" size={18} color={t.c.muted} /> : null}
          </View>
          <Pressable
            onPress={() => setBranchOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={tr('common:component.switchBranch', {
              branch: branch?.name ?? tr('common:component.allBranches'),
            })}
          >
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {subtitle ?? `${branch?.name ?? tr('common:component.allBranches')} · ${company?.baseCurrency ?? ''}`}
            </Text>
          </Pressable>
        </Pressable>

        {offline ? <Badge label={tr('common:component.offline')} tone="warning" icon="cloud-off-outline" size="sm" /> : null}
        {!offline && pendingSync > 0 ? (
          <Badge label={`${pendingSync} queued`} tone="info" icon="sync" size="sm" />
        ) : null}

        {iconButton('magnify', tr('common:component.search'), () => router.push('/(app)/search'))}
        {iconButton('bell-outline', tr('common:component.notifications'), () => router.push('/(app)/notifications'), unread)}
      </View>

      <SelectSheet
        visible={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        title="Switch business"
        subtitle="Each business keeps its own books, numbering and reports."
        options={companies.map((c) => ({
          value: c.id,
          label: c.name,
          description: `${c.businessType} · ${c.baseCurrency}`,
          icon: 'domain',
        }))}
        value={company?.id}
        onSelect={setActiveCompany}
        searchable={false}
      />

      <SelectSheet
        visible={branchOpen}
        onClose={() => setBranchOpen(false)}
        title="Branch"
        options={branches.map((b) => ({
          value: b.id,
          label: b.name,
          description: `${b.code}${b.isPrimary ? ' · Primary' : ''}`,
          icon: b.isPrimary ? 'office-building-outline' : 'warehouse',
        }))}
        value={activeBranchId}
        onSelect={setActiveBranch}
        searchable={false}
      />
    </View>
  );
}
