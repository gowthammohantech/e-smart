import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Pressable, ScrollView, useWindowDimensions, View, type ViewStyle } from 'react-native';
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
import {
  SIDEBAR_COMPACT_WIDTH,
  SIDEBAR_WIDTH,
  sidebarWidth as width,
  useExpandedSections,
  useSidebarCollapsed,
} from './sidebarState';
import { SECTION_LINKS, SETTINGS_HREF, type SubLink } from './navLinks';
import { CompanySwitcher } from './shell/CompanySwitcher';

export { SIDEBAR_COMPACT_WIDTH, SIDEBAR_WIDTH };

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
type Rect = { x: number; y: number; width: number; height: number };
type GroupKey = 'transactions' | 'compliance' | 'manage';

const ICON_SIZE = 22;
const ROW_HEIGHT = 42;
const SUB_ROW_HEIGHT = 34;

/**
 * The sections under small headings. Home sits alone at the top; a section
 * added to TABS later and not listed here lands under Manage.
 */
const GROUPS: { key: GroupKey | null; tabs: TabName[] }[] = [
  { key: null, tabs: ['index'] },
  { key: 'transactions', tabs: ['sales', 'purchases', 'inventory'] },
  { key: 'compliance', tabs: ['gst'] },
  { key: 'manage', tabs: ['contacts', 'reports'] },
];

function groupOf(name: TabName): GroupKey | null {
  return GROUPS.find((g) => g.tabs.includes(name))?.key ?? 'manage';
}

/** react-native-web passes `fixed` through; the native types don't know it. */
const FIXED = 'fixed' as ViewStyle['position'];

function NavItem({
  icon,
  label,
  active,
  badge,
  href,
  onPress,
  compact,
  trailing,
  onHoverIn,
  onHoverOut,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  badge?: number;
  /** A real link, so it can be middle-clicked or opened in a new tab. */
  href?: string;
  onPress?: () => void;
  compact?: boolean;
  /** A control on the row's right, outside the link (a link can't hold a button). */
  trailing?: React.ReactNode;
  onHoverIn?: (rect: Rect) => void;
  onHoverOut?: () => void;
}) {
  const t = useTheme();
  const router = useRouter();
  const row = useRef<View>(null);
  const measure = () => row.current?.measureInWindow((x, y, w, h) => onHoverIn?.({ x, y, width: w, height: h }));
  return (
    <View ref={row}>
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
        onHoverIn={onHoverIn ? measure : undefined}
        onHoverOut={onHoverOut}
        onFocus={onHoverIn ? measure : undefined}
        onBlur={onHoverOut}
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
            paddingLeft: compact ? 0 : t.spacing.md,
            paddingRight: compact ? 0 : trailing ? 40 : t.spacing.md,
            height: ROW_HEIGHT,
            borderRadius: t.radius.md,
            backgroundColor: active
              ? pressed
                ? t.c.primaryPressed
                : t.c.primary
              : pressed || hovered
                ? t.c.mutedSoft
                : 'transparent',
            ...focusRing(t, focused),
          };
        }}
      >
        <MaterialCommunityIcons name={icon} size={ICON_SIZE} color={active ? t.c.onPrimary : t.c.muted} />
        {compact ? null : (
          <Text weight={active ? '600' : '500'} tone={active ? 'onPrimary' : 'muted'} style={{ flex: 1 }} numberOfLines={1}>
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
      {trailing && !compact ? (
        <View style={{ position: 'absolute', top: 0, bottom: 0, right: t.spacing.xs, justifyContent: 'center' }}>{trailing}</View>
      ) : null}
    </View>
  );
}

/** Opens or closes a section's page list without leaving the current page. */
function ExpandToggle({ open, onPrimary, label, onPress }: { open: boolean; onPrimary: boolean; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open }}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressState;
        return {
          width: 30,
          height: 30,
          borderRadius: t.radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed || hovered ? (onPrimary ? t.c.primaryPressed : t.c.mutedSoft) : 'transparent',
          ...focusRing(t, focused),
        };
      }}
    >
      <MaterialCommunityIcons
        name={open ? 'chevron-down' : 'chevron-right'}
        size={18}
        color={onPrimary ? t.c.onPrimary : t.c.muted}
      />
    </Pressable>
  );
}

function SubItem({
  href,
  label,
  active,
  indent,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  /** Left padding: under the section label in the sidebar, flush in a fly-out. */
  indent: number;
  onNavigate?: () => void;
}) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Pressable
      {...({ href } as object)}
      onPress={(e) => {
        e.preventDefault();
        router.navigate(href as never);
        onNavigate?.();
      }}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressState;
        return {
          height: SUB_ROW_HEIGHT,
          justifyContent: 'center',
          paddingLeft: indent,
          paddingRight: t.spacing.md,
          borderRadius: t.radius.sm,
          backgroundColor: active ? t.c.chip : pressed || hovered ? t.c.mutedSoft : 'transparent',
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

function GroupHeading({ label, compact }: { label: string; compact: boolean }) {
  const t = useTheme();
  if (compact) {
    return <View style={{ height: 1, backgroundColor: t.c.line, marginHorizontal: t.spacing.sm, marginVertical: t.spacing.sm }} />;
  }
  return (
    <Text
      variant="micro"
      weight="700"
      tone="muted"
      numberOfLines={1}
      style={{
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        paddingHorizontal: t.spacing.md,
        paddingTop: t.spacing.md,
        paddingBottom: t.spacing.xs,
      }}
    >
      {label}
    </Text>
  );
}

/**
 * Beside a folded sidebar: a section's name on hover, and its pages when it
 * has any, so they're one click away without unfolding.
 */
function Flyout({
  rect,
  label,
  links,
  pathname,
  onHoverIn,
  onHoverOut,
  onNavigate,
}: {
  rect: Rect;
  label: string;
  links: { href: string; label: string }[];
  pathname: string;
  onHoverIn: () => void;
  onHoverOut: () => void;
  onNavigate: () => void;
}) {
  const t = useTheme();
  const window = useWindowDimensions();
  const estHeight = (links.length ? 44 : ROW_HEIGHT) + links.length * (SUB_ROW_HEIGHT + 2);
  const top = Math.max(8, Math.min(rect.y, window.height - estHeight - 8));
  return (
    <Pressable
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      // Only the menu needs the pointer; a bare tooltip must not catch it.
      pointerEvents={links.length ? 'auto' : 'none'}
      accessibilityRole={links.length ? 'menu' : undefined}
      style={[
        {
          position: FIXED,
          top,
          left: rect.x + rect.width + 10,
          minWidth: links.length ? 200 : undefined,
          padding: links.length ? t.spacing.xs : 0,
          paddingHorizontal: links.length ? t.spacing.xs : t.spacing.md,
          minHeight: links.length ? undefined : rect.height - 8,
          marginTop: links.length ? 0 : 4,
          justifyContent: 'center',
          backgroundColor: t.c.paper,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: t.c.line,
          zIndex: 30,
        },
        t.shadow.sheet,
      ]}
    >
      <Text
        variant="small"
        weight="700"
        numberOfLines={1}
        style={links.length ? { paddingHorizontal: t.spacing.sm, paddingVertical: t.spacing.sm } : undefined}
      >
        {label}
      </Text>
      {links.map((l) => (
        <SubItem
          key={l.href}
          href={l.href}
          label={l.label}
          active={pathname === l.href || pathname.startsWith(`${l.href}/`)}
          indent={t.spacing.sm}
          onNavigate={onNavigate}
        />
      ))}
    </Pressable>
  );
}

/**
 * The desktop replacement for the tab bar: the business you're in, then the
 * same destinations under small group headings. Each section's pages fold
 * open under it and stay as you left them. Folded to icons, hovering a
 * section shows its name and pages beside it. Search, notifications and Lixi
 * live in the top bar. A plan that can't open a section doesn't list it,
 * exactly as the tab bar hides it.
 */
export function Sidebar() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const pathname = usePathname();
  const plan = usePlan();
  const breakpoint = useBreakpoint();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const sections = useExpandedSections();
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

  // Arriving in a section lists its pages, so you can see where you are.
  const openSection = sections.open;
  useEffect(() => {
    if (!inSettings && SECTION_LINKS[current]?.length) openSection(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on arrival
  }, [current, inSettings]);

  // The fly-out closes a beat after the pointer leaves, so it can cross the
  // gap from the icon to the menu.
  const [flyout, setFlyout] = useState<{ tab: TabName | null; label: string; rect: Rect; on: string } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setFlyout(null), 160);
  };
  useEffect(() => cancelClose, []);

  const linksFor = (name: TabName) =>
    (SECTION_LINKS[name] ?? [])
      .filter((l: SubLink) => canOpen(plan, l.href))
      .map((l: SubLink) => ({ href: l.href, label: tr(l.labelKey as 'nav:title.invoices') }));
  const labelFor = (name: TabName) => tr(`nav:tab.${name}` as 'nav:tab.index');

  const visible = TABS.filter((tab) => tab.name !== 'more' && canOpen(plan, tabPath(tab.name)));
  const groups = GROUPS.map((g) => ({ key: g.key, tabs: visible.filter((tab) => groupOf(tab.name) === g.key) })).filter(
    (g) => g.tabs.length > 0,
  );

  return (
    <Animated.View
      style={{
        width,
        backgroundColor: t.c.card2,
        borderRightWidth: 1,
        borderRightColor: t.c.line,
        // Above the page, so the fly-out sits over it.
        zIndex: 10,
      }}
    >
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <View
          style={{
            height: 60,
            justifyContent: 'center',
            paddingHorizontal: compact ? t.spacing.sm : t.spacing.lg,
            alignItems: compact ? 'center' : 'flex-start',
          }}
        >
          {compact ? <BrandLogo variant="mark" height={30} /> : <BrandLogo height={42} />}
        </View>
        <View style={{ paddingHorizontal: t.spacing.sm }}>
          <CompanySwitcher compact={compact} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: t.spacing.sm, gap: t.spacing.xs }}>
          {groups.map((group) => (
            <React.Fragment key={group.key ?? 'top'}>
              {group.key ? <GroupHeading label={tr(`nav:shell.group.${group.key}`)} compact={compact} /> : null}
              {group.tabs.map((tab) => {
                const active = current === tab.name && !inSettings;
                const label = labelFor(tab.name);
                const links = linksFor(tab.name);
                const open = links.length > 0 && sections.isOpen(tab.name);
                return (
                  <React.Fragment key={tab.name}>
                    <NavItem
                      icon={active ? tab.activeIcon : tab.icon}
                      label={label}
                      active={active}
                      href={tabPath(tab.name)}
                      compact={compact}
                      trailing={
                        links.length > 0 ? (
                          <ExpandToggle
                            open={open}
                            onPrimary={active}
                            label={tr(open ? 'nav:shell.hidePages' : 'nav:shell.showPages', { label })}
                            onPress={() => sections.toggle(tab.name)}
                          />
                        ) : null
                      }
                      onHoverIn={
                        compact
                          ? (rect) => {
                              cancelClose();
                              setFlyout({ tab: tab.name, label, rect, on: pathname });
                            }
                          : undefined
                      }
                      onHoverOut={compact ? scheduleClose : undefined}
                    />
                    {open && !compact ? (
                      <View style={{ paddingVertical: t.spacing.xxs, gap: t.spacing.xxs }}>
                        {links.map((l) => (
                          <SubItem
                            key={l.href}
                            href={l.href}
                            label={l.label}
                            active={pathname === l.href || pathname.startsWith(`${l.href}/`)}
                            // Lines the text up with the section label above (icon + gap).
                            indent={t.spacing.md + ICON_SIZE + t.spacing.md}
                          />
                        ))}
                      </View>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          ))}
        </ScrollView>
        <View
          style={{
            flexDirection: compact ? 'column' : 'row',
            alignItems: compact ? 'stretch' : 'center',
            padding: t.spacing.sm,
            gap: t.spacing.xs,
          }}
        >
          <View style={compact ? undefined : { flex: 1 }}>
            <NavItem
              icon="cog-outline"
              label={tr('nav:shell.settings')}
              active={inSettings || current === 'more'}
              href={SETTINGS_HREF}
              compact={compact}
              onHoverIn={
                compact
                  ? (rect) => {
                      cancelClose();
                      setFlyout({ tab: null, label: tr('nav:shell.settings'), rect, on: pathname });
                    }
                  : undefined
              }
              onHoverOut={compact ? scheduleClose : undefined}
            />
          </View>
          {narrow ? null : (
            <Pressable
              onPress={toggleCollapsed}
              accessibilityRole="button"
              accessibilityLabel={tr(collapsed ? 'nav:shell.expandSidebar' : 'nav:shell.collapseSidebar')}
              style={(state) => {
                const { pressed, hovered, focused } = state as WebPressState;
                return {
                  width: compact ? undefined : ROW_HEIGHT,
                  height: ROW_HEIGHT,
                  borderRadius: t.radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed || hovered ? t.c.mutedSoft : 'transparent',
                  ...focusRing(t, focused),
                };
              }}
            >
              <MaterialCommunityIcons
                name={collapsed ? 'chevron-double-right' : 'chevron-double-left'}
                size={20}
                color={t.c.muted}
              />
            </Pressable>
          )}
        </View>
      </View>
      {/* Opened on another page or before unfolding: stale, so not shown. */}
      {flyout && compact && flyout.on === pathname ? (
        <Flyout
          rect={flyout.rect}
          label={flyout.label}
          links={flyout.tab ? linksFor(flyout.tab) : []}
          pathname={pathname}
          onHoverIn={cancelClose}
          onHoverOut={scheduleClose}
          onNavigate={() => setFlyout(null)}
        />
      ) : null}
    </Animated.View>
  );
}
