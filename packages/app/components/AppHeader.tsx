import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Text } from '@esmart/ui/components/Text';
import { CompanyLogo } from '@esmart/ui/components/CompanyLogo';
import { TOAST_ANCHOR_ID, useToast } from '@esmart/ui/components/Toast';
import { PageHeader } from '@esmart/ui/components/PageHeader';
import { tabForPath } from '../navigation/tabs';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { useAppStore } from '../store/appStore';
import { ConnectionBadge } from './ConnectionBadge';
import { useActiveCompany, useBranches, useUnreadCount } from '../store/selectors';
import { countLabel } from '@esmart/core/lib/format';
import { inkOn } from '@esmart/ui/theme/contrast';

/**
 * Tab-level header: company/branch switcher on the left, sync state, global
 * search and notifications on the right.
 */
export function AppHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'nav', 'onboarding']);
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // The desktop sidebar already has search and notifications.
  const desktop = useIsDesktop();

  const company = useActiveCompany();
  const branches = useBranches();
  const companies = useAppStore((s) => s.companies);
  const activeBranchId = useAppStore((s) => s.activeBranchId);
  const setActiveCompany = useAppStore((s) => s.setActiveCompany);
  const setActiveBranch = useAppStore((s) => s.setActiveBranch);
  const unread = useUnreadCount();

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);

  const branch = branches.find((b) => b.id === activeBranchId);
  const hasBranches = branches.length > 0;
  const branchName = branch?.name ?? tr('common:component.allBranches');
  const pathname = usePathname();

  // The desktop top bar already has the company switcher, connection state,
  // search and notifications; a tab page only needs its title.
  if (desktop) {
    return (
      <PageHeader
        title={title ?? tr(`nav:tab.${tabForPath(pathname)}` as 'nav:tab.index')}
        subtitle={subtitle}
      />
    );
  }

  // Customers and Reports have no slot in the phone's tab bar; they are opened
  // from More, so (like every other page opened from More) they get a way back.
  const tab = tabForPath(pathname);
  const showBack = tab === 'contacts' || tab === 'reports';
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(app)/(tabs)/more' as never));

  const iconButton = (
    icon: IconName,
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
      <Icon name={icon} size={19} color={t.c.text} />
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
          <Text style={{ color: inkOn(t.c.bad), fontSize: 9, fontWeight: '700' }}>{countLabel(badge)}</Text>
        </View>
      ) : null}
    </Pressable>
  );

  return (
    <View
      style={{
        paddingTop: desktop ? t.spacing.xl : insets.top + t.spacing.sm,
        paddingHorizontal: t.spacing.lg,
        paddingBottom: t.spacing.md,
        gap: t.spacing.sm,
        // Solid, so nothing shows through it (on a phone browser the page scrolls under it).
        backgroundColor: t.c.bg,
        zIndex: 1,
      }}
    >
      {/* A phone browser's toast centres on this row (Toast.web.tsx). */}
      <View nativeID={TOAST_ANCHOR_ID} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
        {showBack ? iconButton('arrow-left', tr('common:action.back'), goBack) : null}
        {/* The business's logo beside its name; a page with its own title shows just that. */}
        {!title && company ? (
          <Pressable
            onPress={() => router.push('/(app)/settings/company' as never)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={tr('nav:title.businessProfile')}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <CompanyLogo uri={company.logoUri} name={company.name} size={36} />
          </Pressable>
        ) : null}
        {/* Siblings, not nested: on web each Pressable is a <button>, and a
            button inside a button is invalid HTML and steals the inner press. */}
        {title ? (
          // A hub's own title is just its name; the business and branch it shows
          // sit on the line below, and that line opens the switcher.
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <Text variant="title" weight="700" numberOfLines={1} accessibilityRole="header" style={{ maxWidth: '100%' }}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="caption" tone="muted" numberOfLines={1} style={{ maxWidth: '100%' }}>
                {subtitle}
              </Text>
            ) : null}
            <Pressable
              onPress={() => (companies.length > 1 || !hasBranches ? setSwitcherOpen(true) : setBranchOpen(true))}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={
                companies.length > 1 || !hasBranches
                  ? tr('common:component.switchBusiness', { name: company?.name ?? '' })
                  : tr('common:component.switchBranch', { branch: branchName })
              }
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 2, maxWidth: '100%', opacity: pressed ? 0.7 : 1 })}
            >
              <Text variant="caption" tone="muted" weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>
                {hasBranches ? `${company?.name ?? ''} · ${branchName}` : company?.name ?? ''}
              </Text>
              <Icon name="chevron-down" size={14} color={t.c.muted} />
            </Pressable>
          </View>
        ) : (
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <Pressable
              onPress={() => setSwitcherOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={tr('common:component.switchBusiness', { name: company?.name ?? '' })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                maxWidth: '100%',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text variant="title" weight="700" numberOfLines={1} style={{ flexShrink: 1 }}>
                {company?.name ?? tr('common:component.business')}
              </Text>
              <Icon name="chevron-down" size={18} color={t.c.muted} />
            </Pressable>
            {/* A business without branches has nothing to pick here: the line just says the currency. */}
            {hasBranches ? (
              <Pressable
                onPress={() => setBranchOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={tr('common:component.switchBranch', { branch: branchName })}
                style={({ pressed }) => ({ maxWidth: '100%', opacity: pressed ? 0.7 : 1 })}
              >
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {`${branchName} · ${company?.baseCurrency ?? ''}`}
                </Text>
              </Pressable>
            ) : (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {company?.baseCurrency ?? ''}
              </Text>
            )}
          </View>
        )}

        {/* On a narrow phone the status badge gives way (shrinks) before the buttons do. */}
        <ConnectionBadge style={{ flexShrink: 1, alignSelf: 'center' }} />

        {desktop ? null : (
          <>
            {iconButton('magnify', tr('common:component.search'), () => router.push('/(app)/search'))}
            {iconButton(
              'bell-outline',
              unread > 0
                ? tr('nav:tabBadgeA11y', { label: tr('common:component.notifications'), count: countLabel(unread) })
                : tr('common:component.notifications'),
              () => router.push('/(app)/notifications'),
              unread,
            )}
          </>
        )}
      </View>

      <SelectSheet
        visible={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        title={tr('common:business.switch')}
        subtitle={tr('common:business.switchHint')}
        options={companies.map((c) => ({
          value: c.id,
          label: c.name,
          description: `${tr(`onboarding:businessType.${c.businessType}` as 'onboarding:businessType.other')} · ${c.baseCurrency}`,
          leading: <CompanyLogo uri={c.logoUri} name={c.name} size={32} />,
        }))}
        value={company?.id}
        onSelect={(id) => {
          const next = companies.find((c) => c.id === id);
          if (!next || id === company?.id) return;
          setActiveCompany(id);
          toast.show(tr('common:toast.switchedBusiness', { name: next.name }), 'info', { icon: 'swap-horizontal', detail: next.baseCurrency, varies: true });
        }}
        searchable={false}
      />

      <SelectSheet
        visible={branchOpen}
        onClose={() => setBranchOpen(false)}
        title={tr('common:business.branch')}
        options={branches.map((b) => ({
          value: b.id,
          label: b.name,
          description: b.isPrimary ? `${b.code} · ${tr('common:component.primaryBranch')}` : b.code,
          icon: b.isPrimary ? 'office-building-outline' : 'warehouse',
        }))}
        value={activeBranchId}
        onSelect={(id) => {
          const next = branches.find((b) => b.id === id);
          if (!next || id === activeBranchId) return;
          setActiveBranch(id);
          toast.show(tr('common:toast.switchedBranch', { name: next.name }), 'info', { icon: next.isPrimary ? 'office-building-outline' : 'warehouse', detail: next.code, varies: true });
        }}
        searchable={false}
      />
    </View>
  );
}
