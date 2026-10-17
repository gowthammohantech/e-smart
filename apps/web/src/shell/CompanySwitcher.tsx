import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { Avatar } from '@esmart/ui/components/Avatar';
import { Menu, MenuDivider, MenuItem, MenuSection, useMenuAnchor } from '@esmart/ui/components/Menu';
import { useAppStore } from '@esmart/app/store/appStore';
import { useActiveCompany, useBranches } from '@esmart/app/store/selectors';

/**
 * The business you're working in, as a card at the top of the sidebar: name,
 * branch and currency, and the GSTIN when registered. It opens the menu that
 * switches business or branch. Folded, only the avatar shows.
 */
export function CompanySwitcher({ compact }: { compact: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'common', 'onboarding']);
  const router = useRouter();

  const company = useActiveCompany();
  const companies = useAppStore((s) => s.companies);
  const branches = useBranches();
  const activeBranchId = useAppStore((s) => s.activeBranchId);
  const setActiveCompany = useAppStore((s) => s.setActiveCompany);
  const setActiveBranch = useAppStore((s) => s.setActiveBranch);
  const { setAnchor, rect, open, close } = useMenuAnchor();

  const branch = branches.find((b) => b.id === activeBranchId);
  const tax = company?.taxRegistration;
  const gstin = tax?.identifier ? `${tax.identifierLabel} ${tax.identifier}` : null;

  return (
    <>
      <Pressable
        ref={setAnchor}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${tr('common:business.switch')}: ${company?.name ?? ''}`}
        style={(state) => {
          const { pressed, hovered, focused } = state as WebPressState;
          return [
            compact
              ? { alignSelf: 'center', padding: t.spacing.xs, borderRadius: t.radius.md }
              : {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.sm,
                  padding: t.spacing.sm,
                  borderRadius: t.radius.md,
                  borderWidth: 1,
                  borderColor: t.c.line,
                },
            { backgroundColor: pressed || hovered ? t.c.paper : compact ? 'transparent' : t.c.card },
            focusRing(t, focused),
          ];
        }}
      >
        <Avatar name={company?.name ?? '?'} size={compact ? 36 : 34} />
        {compact ? null : (
          <>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="small" weight="700" numberOfLines={1}>
                {company?.name ?? tr('common:component.business')}
              </Text>
              <Text variant="micro" tone="muted" numberOfLines={1}>
                {branch?.name ?? tr('common:component.allBranches')} · {company?.baseCurrency}
              </Text>
              {gstin ? (
                <Text variant="micro" tone="muted" numberOfLines={1}>
                  {gstin}
                </Text>
              ) : null}
            </View>
            <MaterialCommunityIcons name="unfold-more-horizontal" size={16} color={t.c.muted} />
          </>
        )}
      </Pressable>

      <Menu anchor={rect} onClose={close} width={300}>
        <MenuSection title={tr('nav:shell.businesses')} />
        {companies.map((c) => (
          <MenuItem
            key={c.id}
            icon="domain"
            label={c.name}
            description={`${tr(`onboarding:businessType.${c.businessType}` as 'onboarding:businessType.other')} · ${c.baseCurrency}`}
            selected={c.id === company?.id}
            onPress={() => {
              setActiveCompany(c.id);
              close();
            }}
          />
        ))}
        {branches.length > 0 ? (
          <>
            <MenuDivider />
            <MenuSection title={tr('nav:shell.branches')} />
            {branches.map((b) => (
              <MenuItem
                key={b.id}
                icon={b.isPrimary ? 'office-building-outline' : 'warehouse'}
                label={b.name}
                description={b.code}
                selected={b.id === activeBranchId}
                onPress={() => {
                  setActiveBranch(b.id);
                  close();
                }}
              />
            ))}
          </>
        ) : null}
        <MenuDivider />
        <MenuItem
          icon="cog-outline"
          label={tr('nav:more.entry.businessProfile')}
          onPress={() => {
            close();
            router.push('/(app)/settings/company' as never);
          }}
        />
      </Menu>
    </>
  );
}
