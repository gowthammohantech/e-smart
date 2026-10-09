import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Pressable, ScrollView, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useBreakpoint } from '@esmart/ui/theme/breakpoints';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { BrandLogo } from '@esmart/ui/components/BrandLogo';
import { canOpen } from '@esmart/core/domain/plan';
import { countLabel } from '@esmart/core/lib/format';
import { TABS, tabForPath, tabPath, type TabName } from '@esmart/app/navigation/tabs';
import { usePlan } from '@esmart/app/store/selectors';
import { SIDEBAR_COMPACT_WIDTH, SIDEBAR_WIDTH, sidebarWidth as width, useSidebarCollapsed } from './sidebarState';

export { SIDEBAR_COMPACT_WIDTH, SIDEBAR_WIDTH };

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

function NavItem({
  icon,
  label,
  active,
  badge,
  href,
  onPress,
  compact,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  badge?: number;
  /** A real link, so it can be middle-clicked or opened in a new tab. */
  href?: string;
  onPress?: () => void;
  compact?: boolean;
}) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Pressable
      // react-native-web renders `href` as a real link, so middle-click and
      // "open in new tab" work; a plain click still navigates in the app.
      {...(href ? ({ href } as object) : null)}
      onPress={(e) => {
        if (href) {
          e.preventDefault();
          router.navigate(href as never);
        }
        onPress?.();
      }}
      accessibilityRole={href ? 'link' : 'button'}
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressState;
        return {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: compact ? 'center' : 'flex-start',
        gap: t.spacing.md,
        paddingHorizontal: compact ? 0 : t.spacing.md,
        height: 40,
        borderRadius: t.radius.md,
        backgroundColor: active ? t.c.card : pressed || hovered ? t.c.card2 : 'transparent',
        ...focusRing(t, focused),
        };
      }}
    >
      <MaterialCommunityIcons name={icon} size={20} color={active ? t.c.primary : t.c.muted} />
      {compact ? null : (
        <Text weight={active ? '600' : '500'} tone={active ? 'default' : 'muted'} style={{ flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
      )}
      {badge ? (
        <View
          style={{
            position: compact ? 'absolute' : 'relative',
            top: compact ? 2 : undefined,
            right: compact ? 6 : undefined,
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            paddingHorizontal: 6,
            backgroundColor: t.c.bad,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="micro" tone="onPrimary" weight="700">
            {countLabel(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

type SubLink = { href: string; labelKey: string };

/**
 * The pages under each section, so a desktop user reaches a list in one
 * click. Only the open section shows them.
 */
const SECTION_LINKS: Partial<Record<TabName, SubLink[]>> = {
  sales: [
    { href: '/sales/invoices', labelKey: 'nav:title.invoices' },
    { href: '/sales/quotes', labelKey: 'nav:title.quotations' },
    { href: '/sales/orders', labelKey: 'nav:title.salesOrders' },
    { href: '/sales/deliveries', labelKey: 'nav:title.deliveryNotes' },
    { href: '/sales/returns', labelKey: 'nav:title.salesReturns' },
    { href: '/payments/received', labelKey: 'nav:title.paymentsReceived' },
    { href: '/receivables', labelKey: 'nav:title.receivables' },
  ],
  purchases: [
    { href: '/purchases/bills', labelKey: 'nav:title.purchaseBills' },
    { href: '/purchases/orders', labelKey: 'nav:title.purchaseOrders' },
    { href: '/purchases/receipts', labelKey: 'nav:title.goodsReceipts' },
    { href: '/purchases/returns', labelKey: 'nav:title.purchaseReturns' },
    { href: '/payments/made', labelKey: 'nav:title.paymentsMade' },
    { href: '/payables', labelKey: 'nav:title.payables' },
    { href: '/expenses', labelKey: 'nav:title.expenses' },
  ],
  inventory: [
    { href: '/catalog/items', labelKey: 'nav:title.itemsAndServices' },
    { href: '/inventory/movements', labelKey: 'nav:title.stockMovements' },
    { href: '/inventory/low-stock', labelKey: 'nav:title.lowStock' },
  ],
  gst: [
    { href: '/compliance', labelKey: 'nav:more.entry.gstCompliance' },
    { href: '/gst/gstr1', labelKey: 'nav:title.gstr1' },
  ],
};

function SubItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Pressable
      {...({ href } as object)}
      onPress={(e) => {
        e.preventDefault();
        router.navigate(href as never);
      }}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressState;
        return {
          height: 32,
          justifyContent: 'center',
          marginLeft: 22,
          paddingLeft: 20,
          borderLeftWidth: 2,
          borderLeftColor: active ? t.c.primary : t.c.line,
          borderTopRightRadius: t.radius.sm,
          borderBottomRightRadius: t.radius.sm,
          backgroundColor: pressed || hovered ? t.c.card2 : 'transparent',
          ...focusRing(t, focused),
        };
      }}
    >
      <Text variant="small" weight={active ? '700' : '500'} tone={active ? 'primary' : 'muted'} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The desktop replacement for the tab bar: the same destinations, always in
 * view, with the open section's pages listed under it. Search, notifications
 * and Lixi live in the top bar. A plan that can't open a section doesn't
 * list it, exactly as the tab bar hides it.
 */
export function Sidebar() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const pathname = usePathname();
  const plan = usePlan();
  const breakpoint = useBreakpoint();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  // A narrow window is always icons-only; a wider one can be folded by hand.
  const narrow = breakpoint === 'tablet';
  const folded = narrow || collapsed;

  // The width eases between the two sizes. Going narrower, the labels stay
  // until the sidebar has finished closing; going wider, they appear as it
  // opens, so nothing jumps.
  const [settled, setSettled] = useState(folded);
  useEffect(() => {
    const anim = Animated.timing(width, {
      toValue: folded ? SIDEBAR_COMPACT_WIDTH : SIDEBAR_WIDTH,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) setSettled(folded);
    });
    return () => anim.stop();
  }, [folded]);
  const compact = folded && settled;

  const current = tabForPath(pathname);
  const inSettings = pathname.startsWith('/settings');

  return (
    <Animated.View
      style={{
        width,
        backgroundColor: t.c.paper,
        borderRightWidth: 1,
        borderRightColor: t.c.line,
        // Above the page, so the fold button can straddle the edge.
        zIndex: 10,
      }}
    >
      {narrow ? null : (
        <Pressable
          onPress={toggleCollapsed}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={(state) => {
            const { hovered, focused } = state as WebPressState;
            return {
              position: 'absolute',
              top: 72,
              right: -16,
              width: 32,
              height: 32,
              borderRadius: t.radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: hovered ? t.c.card2 : t.c.card,
              borderWidth: 1,
              borderColor: t.c.line,
              zIndex: 20,
              ...focusRing(t, focused),
            };
          }}
        >
          <MaterialCommunityIcons name={collapsed ? 'chevron-right' : 'chevron-left'} size={20} color={t.c.text} />
        </Pressable>
      )}
      <View style={{ flex: 1, overflow: 'hidden' }}>
      <View
        style={{
          height: 60,
          justifyContent: 'center',
          paddingHorizontal: compact ? t.spacing.sm : t.spacing.lg,
          alignItems: compact ? 'center' : 'flex-start',
          borderBottomWidth: 1,
          borderBottomColor: t.c.line,
        }}
      >
        {compact ? <BrandLogo variant="mark" height={30} /> : <BrandLogo height={42} />}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: t.spacing.sm, gap: 2 }}>
        {TABS.filter((tab) => canOpen(plan, tabPath(tab.name)) && tab.name !== 'more').map((tab) => {
          const active = current === tab.name && !inSettings;
          const links = (SECTION_LINKS[tab.name] ?? []).filter((l) => canOpen(plan, l.href));
          return (
            <React.Fragment key={tab.name}>
              <NavItem
                icon={active ? tab.activeIcon : tab.icon}
                label={tr(`nav:tab.${tab.name}` as 'nav:tab.index')}
                active={active}
                href={tabPath(tab.name)}
                compact={compact}
              />
              {active && !compact && links.length > 0 ? (
                <View style={{ paddingVertical: 2 }}>
                  {links.map((l) => (
                    <SubItem
                      key={l.href}
                      href={l.href}
                      label={tr(l.labelKey as 'nav:title.invoices')}
                      active={pathname === l.href || pathname.startsWith(`${l.href}/`)}
                    />
                  ))}
                </View>
              ) : null}
            </React.Fragment>
          );
        })}
      </ScrollView>
      <View style={{ padding: t.spacing.sm, borderTopWidth: 1, borderTopColor: t.c.line, gap: 2 }}>
        <NavItem
          icon="cog-outline"
          label={tr('nav:shell.settings')}
          active={inSettings || current === 'more'}
          href="/settings/company"
          compact={compact}
        />
      </View>
      </View>
    </Animated.View>
  );
}
