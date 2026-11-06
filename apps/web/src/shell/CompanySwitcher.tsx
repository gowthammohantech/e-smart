import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useToast } from '@esmart/ui/components/Toast';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { CompanyLogo } from '@esmart/ui/components/CompanyLogo';
import { Menu, MenuDivider, MenuItem, MenuSection, useMenuAnchor } from '@esmart/ui/components/Menu';
import { useAppStore } from '@esmart/app/store/appStore';
import { useActiveCompany, useBranches } from '@esmart/app/store/selectors';

/** The top bar's picker button: what's chosen, a hint above it, and a chevron. */
const PickerButton = React.forwardRef<
  View,
  {
    label: string;
    caption: string;
    a11yLabel: string;
    leading: React.ReactNode;
    /** Only the leading mark shows, for a narrow window. */
    compact: boolean;
    maxWidth: number;
    onPress: () => void;
  }
>(function PickerButton({ label, caption, a11yLabel, leading, compact, maxWidth, onPress }, ref) {
  const t = useTheme();
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      // The menu it opens is a list to pick from.
      {...({ 'aria-haspopup': 'menu' } as object)}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressState;
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            height: 40,
            maxWidth: compact ? undefined : maxWidth,
            // Its side of the bar is only half what search leaves: short of room, the name shortens rather than running under search.
            flexShrink: 1,
            minWidth: 0,
            paddingLeft: t.spacing.xs + 2,
            paddingRight: t.spacing.sm,
            borderRadius: t.radius.md,
            borderWidth: 1,
            borderColor: hovered ? t.c.lineStrong : t.c.line,
            backgroundColor: pressed || hovered ? t.c.card2 : 'transparent',
          },
          focusRing(t, focused),
        ];
      }}
    >
      {leading}
      {compact ? null : (
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text variant="micro" tone="muted" numberOfLines={1}>
            {caption}
          </Text>
          <Text variant="small" weight="600" numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
      <Icon name="chevron-down" size={16} color={t.c.muted} />
    </Pressable>
  );
});

/**
 * The business you're working in, in the top bar: its logo and name, and a
 * menu that switches to another. The branch has its own picker beside it.
 */
export function CompanyPicker({ compact }: { compact: boolean }) {
  const { t: tr } = useTranslation(['nav', 'common', 'onboarding']);
  const toast = useToast();
  const router = useRouter();

  const company = useActiveCompany();
  const companies = useAppStore((s) => s.companies);
  const setActiveCompany = useAppStore((s) => s.setActiveCompany);
  const { setAnchor, rect, open, close } = useMenuAnchor();

  const tax = company?.taxRegistration;
  const gstin = tax?.identifier ? `${tax.identifierLabel} ${tax.identifier}` : null;
  const name = company?.name ?? tr('common:component.business');

  return (
    <>
      <PickerButton
        ref={setAnchor}
        onPress={open}
        compact={compact}
        maxWidth={240}
        a11yLabel={`${tr('common:business.switch')}: ${company?.name ?? ''}`}
        caption={gstin ?? `${tr('nav:shell.business')} · ${company?.baseCurrency ?? ''}`}
        label={name}
        leading={<CompanyLogo uri={company?.logoUri} name={company?.name ?? '?'} size={28} />}
      />
      <Menu anchor={rect} onClose={close} width={300}>
        <MenuSection title={tr('nav:shell.businesses')} />
        {companies.map((c) => (
          <MenuItem
            key={c.id}
            leading={<CompanyLogo uri={c.logoUri} name={c.name} size={28} />}
            label={c.name}
            description={`${tr(`onboarding:businessType.${c.businessType}` as 'onboarding:businessType.other')} · ${c.baseCurrency}`}
            selected={c.id === company?.id}
            onPress={() => {
              close();
              // Already the active business: nothing switched, so no message.
              if (c.id === company?.id) return;
              setActiveCompany(c.id);
              toast.show(tr('common:toast.switchedBusiness', { name: c.name }), 'info', { icon: 'swap-horizontal', detail: c.baseCurrency, varies: true });
            }}
          />
        ))}
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

/**
 * The branch you're working in, beside the business: its name and a menu of
 * the business's branches. Not shown for a business without branches.
 */
export function BranchPicker({ compact }: { compact: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'common']);
  const toast = useToast();
  const router = useRouter();

  const branches = useBranches();
  const activeBranchId = useAppStore((s) => s.activeBranchId);
  const setActiveBranch = useAppStore((s) => s.setActiveBranch);
  const { setAnchor, rect, open, close } = useMenuAnchor();

  if (branches.length === 0) return null;
  const branch = branches.find((b) => b.id === activeBranchId);
  const iconFor = (primary: boolean): IconName => (primary ? 'office-building-outline' : 'warehouse');

  return (
    <>
      <PickerButton
        ref={setAnchor}
        onPress={open}
        compact={compact}
        maxWidth={200}
        a11yLabel={`${tr('nav:shell.branch')}: ${branch?.name ?? tr('common:component.allBranches')}`}
        caption={branch?.code ?? tr('nav:shell.branch')}
        label={branch?.name ?? tr('common:component.allBranches')}
        leading={
          <View style={{ width: 28, height: 28, borderRadius: t.radius.sm, backgroundColor: t.c.chip, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={iconFor(!!branch?.isPrimary)} size={16} color={t.c.primary} />
          </View>
        }
      />
      <Menu anchor={rect} onClose={close} width={280}>
        <MenuSection title={tr('nav:shell.branches')} />
        {branches.map((b) => (
          <MenuItem
            key={b.id}
            icon={iconFor(b.isPrimary)}
            label={b.name}
            description={b.code}
            selected={b.id === activeBranchId}
            onPress={() => {
              close();
              if (b.id === activeBranchId) return;
              setActiveBranch(b.id);
              toast.show(tr('common:toast.switchedBranch', { name: b.name }), 'info', { icon: iconFor(b.isPrimary), detail: b.code, varies: true });
            }}
          />
        ))}
        <MenuDivider />
        <MenuItem
          icon="cog-outline"
          label={tr('nav:more.entry.branches')}
          onPress={() => {
            close();
            router.push('/(app)/settings/branches' as never);
          }}
        />
      </Menu>
    </>
  );
}
