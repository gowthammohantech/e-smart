import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Platform, Pressable, ScrollView, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useBreakpoint } from '@esmart/ui/theme/breakpoints';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { BrandLogo } from '@esmart/ui/components/BrandLogo';
import { canOpen } from '@esmart/core/domain/plan';
import { countLabel } from '@esmart/core/lib/format';
import { TABS, tabForPath, tabPath, type TabName } from '@esmart/app/navigation/tabs';
import { appHref, section, type MenuPage, type PageGroup, type SidebarGroup } from '@esmart/app/navigation/menu';
import { useMenuBadges } from '@esmart/app/navigation/moreGroups';
import { usePlan } from '@esmart/app/store/selectors';
// A page swap the open form can't see coming; it asks first when there are unsaved changes.
import { leaveGuarded } from '@esmart/app/components/useLeaveGuard';
import { SIDEBAR_COMPACT_WIDTH, SIDEBAR_WIDTH, sidebarWidth as width, useSidebarCollapsed } from './sidebarState';
import { SETTINGS_HREF, sectionHref } from './navLinks';
import { TOP_BAR_HEIGHT } from './shell/TopBar';

export { SIDEBAR_COMPACT_WIDTH, SIDEBAR_WIDTH };

type Rect = { x: number; y: number; width: number; height: number };
type GroupKey = Exclude<SidebarGroup, null>;
/** A live count beside an entry, or `true` for a dot when it isn't a number (offline). */
type BadgeValue = string | true | undefined;

const WEB = Platform.OS === 'web';
const ICON_SIZE = 18;
const ROW_HEIGHT = 36;
const PANEL_ROW_HEIGHT = 34;
const PANEL_COLUMN_WIDTH = 224;

/** The bands the sections sit in, split by a rule; Home sits alone at the top. */
const GROUPS: (GroupKey | null)[] = [null, 'transactions', 'finance', 'manage'];

/** react-native-web passes `fixed` through; the native types don't know it. */
const FIXED = 'fixed' as ViewStyle['position'];

const isOn = (pathname: string, route: string) => pathname === route || pathname.startsWith(`${route}/`);

/** The logo at the top of the sidebar: a link to Home, as a logo is on most sites. */
function HomeLogo({ compact }: { compact: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useTranslation(['nav']);
  const home = tabPath('index');
  return (
    <Pressable
      // A real link, so it can be middle-clicked or opened in a new tab; a plain click navigates in the app.
      {...({ href: home } as object)}
      onPress={(e) => {
        e.preventDefault();
        leaveGuarded(() => router.navigate(home as never));
      }}
      accessibilityRole="link"
      accessibilityLabel={tr('nav:tab.index')}
      hitSlop={6}
      style={(state) => ({ borderRadius: 6, ...focusRing(t, (state as WebPressState).focused) })}
    >
      {compact ? <BrandLogo variant="mark" height={28} /> : <BrandLogo height={34} />}
    </Pressable>
  );
}

function BadgePill({ value, floating }: { value: Exclude<BadgeValue, undefined>; floating?: boolean }) {
  const t = useTheme();
  const dot = value === true;
  return (
    <View
      style={{
        position: floating ? 'absolute' : 'relative',
        top: floating ? (dot ? 6 : 2) : undefined,
        right: floating ? (dot ? 12 : 6) : undefined,
        minWidth: dot ? 8 : 18,
        height: dot ? 8 : 18,
        borderRadius: 9,
        paddingHorizontal: dot ? 0 : 5,
        backgroundColor: t.c.bad,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {dot ? null : (
        <Text variant="micro" tone="onPrimary" weight="700">
          {value}
        </Text>
      )}
    </View>
  );
}

function NavItem({
  icon,
  label,
  active,
  badge,
  href,
  onPress,
  compact,
  expanded,
  dropsDown,
  onHoverIn,
  onHoverOut,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  badge?: BadgeValue;
  /** A real link, so it can be middle-clicked or opened in a new tab. Without one it's a button. */
  href?: string;
  onPress?: (rect: Rect) => void;
  compact?: boolean;
  /** For a section with pages: whether they're showing now. */
  expanded?: boolean;
  /** Its pages drop down under it (rather than opening a panel beside it). */
  dropsDown?: boolean;
  onHoverIn?: (rect: Rect) => void;
  onHoverOut?: () => void;
}) {
  const t = useTheme();
  const router = useRouter();
  const row = useRef<View>(null);
  const measure = (then?: (rect: Rect) => void) =>
    row.current?.measureInWindow((x, y, w, h) => then?.({ x, y, width: w, height: h }));
  const opensPanel = expanded !== undefined;
  return (
    <View ref={row}>
      <Pressable
        // react-native-web renders `href` as a real link, so middle-click and
        // "open in new tab" work; a plain click still navigates in the app.
        {...(href ? ({ href } as object) : null)}
        {...(opensPanel && !dropsDown ? ({ 'aria-haspopup': 'dialog' } as object) : null)}
        onPress={(e) => {
          if (href) {
            e.preventDefault();
            leaveGuarded(() => router.navigate(href as never));
          }
          if (onPress) measure(onPress);
        }}
        onHoverIn={onHoverIn ? () => measure(onHoverIn) : undefined}
        onHoverOut={onHoverOut}
        onFocus={onHoverIn ? () => measure(onHoverIn) : undefined}
        onBlur={onHoverOut}
        accessibilityRole={href ? 'link' : 'button'}
        accessibilityLabel={label}
        accessibilityState={{ selected: active, ...(opensPanel ? { expanded } : null) }}
        style={(state) => {
          const { pressed, hovered, focused } = state as WebPressState;
          return {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: compact ? 'center' : 'flex-start',
            gap: t.spacing.md - 2,
            paddingHorizontal: compact ? 0 : t.spacing.md - 2,
            height: ROW_HEIGHT,
            borderRadius: t.radius.md,
            // The page you're on is tinted, not filled: the blue marks it
            // without outshouting the page's own primary button.
            backgroundColor: active ? t.c.chip : (expanded && !dropsDown) || pressed || hovered ? t.c.mutedSoft : 'transparent',
            ...focusRing(t, focused),
          };
        }}
      >
        <Icon name={icon} size={ICON_SIZE} color={active ? t.c.primary : t.c.muted} />
        {compact ? null : (
          <Text
            variant="small"
            weight={active ? '600' : '500'}
            style={{ flex: 1, color: active ? t.c.primary : t.c.text, opacity: active ? 1 : 0.86 }}
            numberOfLines={1}
          >
            {label}
          </Text>
        )}
        {badge ? <BadgePill value={badge} floating={compact} /> : null}
        {opensPanel && !compact ? (
          <Icon name={dropsDown && expanded ? 'chevron-down' : 'chevron-right'} size={16} color={expanded ? t.c.text : t.c.muted} />
        ) : null}
      </Pressable>
    </View>
  );
}

function Rule() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line, marginHorizontal: t.spacing.sm, marginVertical: t.spacing.sm }} />;
}

/** Beside a folded sidebar, a row's name on hover or focus. */
function Tooltip({ rect, label }: { rect: Rect; label: string }) {
  const t = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: FIXED,
          top: rect.y + 4,
          left: rect.x + rect.width + 10,
          minHeight: rect.height - 8,
          paddingHorizontal: t.spacing.md,
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
      <Text variant="small" weight="600" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** One page under a section, inline or in its panel: the link, its badge, and a "+" that starts a new one. */
function PanelItem({
  page,
  label,
  active,
  badge,
  onNavigate,
}: {
  page: MenuPage;
  label: string;
  active: boolean;
  badge: BadgeValue;
  onNavigate?: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();
  const go = (route: string) => leaveGuarded(() => {
    router.navigate(appHref(route) as never);
    onNavigate?.();
  });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Pressable
        {...({ href: page.route } as object)}
        onPress={(e) => {
          e.preventDefault();
          go(page.route);
        }}
        accessibilityRole="link"
        accessibilityState={{ selected: active }}
        style={(state) => {
          const { pressed, hovered, focused } = state as WebPressState;
          return {
            flex: 1,
            minWidth: 0,
            height: PANEL_ROW_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            paddingHorizontal: t.spacing.sm,
            borderRadius: t.radius.sm,
            backgroundColor: active ? t.c.chip : pressed || hovered ? t.c.mutedSoft : 'transparent',
            ...focusRing(t, focused),
          };
        }}
      >
        <Icon name={page.icon} size={16} color={active ? t.c.primary : t.c.muted} />
        <Text variant="small" weight={active ? '600' : '500'} tone={active ? 'primary' : undefined} numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
        {badge ? <BadgePill value={badge} /> : null}
      </Pressable>
      {page.createRoute ? (
        <Pressable
          {...({ href: page.createRoute } as object)}
          onPress={(e) => {
            e.preventDefault();
            go(page.createRoute!);
          }}
          accessibilityRole="link"
          accessibilityLabel={tr('nav:shell.createIn', { label })}
          style={(state) => {
            const { pressed, hovered, focused } = state as WebPressState;
            return {
              width: 28,
              height: 28,
              borderRadius: t.radius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed || hovered ? t.c.chip : 'transparent',
              ...focusRing(t, focused),
            };
          }}
        >
          {(state) => <Icon name="plus" size={16} color={(state as WebPressState).hovered ? t.c.primary : t.c.muted} />}
        </Pressable>
      ) : (
        // Keeps the rows' right edges in line.
        <View style={{ width: 28 }} />
      )}
    </View>
  );
}

/** A section's pages the plan opens, split into lists by category and the actions (Scan a bill). */
function sectionLayout(tab: TabName, plan: ReturnType<typeof usePlan>) {
  const pages = section(tab).pages.filter((p) => canOpen(plan, p.route));
  const columns: { group: PageGroup | null; pages: MenuPage[] }[] = [];
  pages
    .filter((p) => !p.action)
    .forEach((p) => {
      const key = p.group ?? null;
      const col = columns.find((c) => c.group === key);
      if (col) col.pages.push(p);
      else columns.push({ group: key, pages: [p] });
    });
  return { columns, actions: pages.filter((p) => p.action) };
}

/**
 * A section's pages, dropped down under its row in the sidebar: an overview
 * link, then the pages under their category headings, then its actions, on a
 * guide line in from the section's icon.
 */
function SectionDropdown({ tab, pathname }: { tab: TabName; pathname: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'reports']);
  const plan = usePlan();
  const badges = useMenuBadges();
  const { columns, actions } = sectionLayout(tab, plan);
  const name = tr(`nav:tab.${tab}` as 'nav:tab.index');
  const hub: MenuPage = { key: `hub-${tab}`, labelKey: '', icon: 'view-dashboard-outline', route: tabPath(tab) };
  return (
    <View
      role="group"
      aria-label={tr('nav:shell.openPanel', { label: name })}
      style={{
        // The line runs down from the middle of the section's icon.
        marginLeft: t.spacing.md - 2 + ICON_SIZE / 2,
        paddingLeft: t.spacing.xs,
        borderLeftWidth: 1,
        borderLeftColor: t.c.line,
        marginTop: t.spacing.xxs,
        marginBottom: t.spacing.xs,
        gap: 1,
      }}
    >
      {/* No overview when the plan can't open the section's own page. */}
      {canOpen(plan, hub.route) ? (
        <PanelItem page={hub} label={tr('nav:shell.overview', { label: name })} active={pathname === hub.route} badge={undefined} />
      ) : null}
      {columns.map((col) => (
        <View key={col.group ?? 'all'} role="group" aria-label={col.group ? tr(`nav:menuGroup.${col.group}`) : undefined} style={{ gap: 1 }}>
          {col.group ? (
            <Text
              variant="micro"
              weight="600"
              tone="muted"
              numberOfLines={1}
              style={{ textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: t.spacing.sm, paddingTop: t.spacing.sm, paddingBottom: 2 }}
            >
              {tr(`nav:menuGroup.${col.group}`)}
            </Text>
          ) : null}
          {col.pages.map((p) => (
            <PanelItem
              key={p.key}
              page={p}
              label={tr(p.labelKey as 'nav:title.invoices')}
              active={isOn(pathname, p.route)}
              badge={p.badge ? badges[p.badge] : undefined}
            />
          ))}
        </View>
      ))}
      {actions.length ? <View style={{ height: t.spacing.xs }} /> : null}
      {actions.map((a) => (
        <PanelItem key={a.key} page={a} label={tr(a.labelKey as 'nav:title.invoices')} active={isOn(pathname, a.route)} badge={undefined} />
      ))}
    </View>
  );
}

/**
 * Beside a folded sidebar, a section's pages: its overview, then its pages under
 * their categories in columns, each with a "+" to start a new one, and the
 * section's actions (Scan a bill). Escape, a click outside or picking a page
 * closes it.
 */
function SectionPanel({
  tab,
  rect,
  left,
  pathname,
  onClose,
}: {
  tab: TabName;
  rect: Rect;
  left: number;
  pathname: string;
  onClose: (restoreFocus: boolean) => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'reports']);
  const router = useRouter();
  const plan = usePlan();
  const badges = useMenuBadges();
  const window = useWindowDimensions();
  const panel = useRef<View>(null);
  const [height, setHeight] = useState(0);

  const name = tr(`nav:tab.${tab}` as 'nav:tab.index');
  const { columns, actions } = sectionLayout(tab, plan);
  // Four categories sit two by two; up to three sit side by side.
  const across = columns.length <= 3 ? columns.length : 2;
  const top = Math.max(8, Math.min(rect.y - 6, window.height - height - 8));

  // Focus moves into the panel, so the keyboard carries on where the eye goes; Escape closes it.
  useEffect(() => {
    if (!WEB || typeof document === 'undefined') return undefined;
    (panel.current as unknown as HTMLElement | null)?.querySelector<HTMLElement>('a,[role="button"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const done = () => onClose(false);
  const hub = tabPath(tab);

  return (
    <>
      {/* Catches a click beside the panel; the sidebar stays live, so another section opens straight away. */}
      <Pressable
        onPress={done}
        accessible={false}
        style={{ position: FIXED, top: 0, bottom: 0, right: 0, left, zIndex: 39, cursor: 'auto' }}
      />
      <View
        ref={panel}
        role="dialog"
        aria-label={tr('nav:shell.openPanel', { label: name })}
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
        style={[
          {
            position: FIXED,
            top,
            left: left + 8,
            width: across * PANEL_COLUMN_WIDTH + (across - 1) * t.spacing.md + t.spacing.sm * 2,
            maxHeight: window.height - 16,
            padding: t.spacing.sm,
            gap: t.spacing.xs,
            backgroundColor: t.c.paper,
            borderRadius: t.radius.lg,
            borderWidth: 1,
            borderColor: t.c.line,
            zIndex: 40,
            // Hidden until measured, so it never flashes in the wrong place.
            opacity: height ? 1 : 0,
          },
          t.shadow.sheet,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          {/* The plan can't open the section's own page: its name heads the panel, not a link to it. */}
          {!canOpen(plan, hub) ? (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, height: ROW_HEIGHT, paddingHorizontal: t.spacing.sm }}>
              <Icon name={section(tab).activeIcon} size={ICON_SIZE} color={t.c.primary} />
              <Text variant="body" weight="600" numberOfLines={1} style={{ flex: 1 }}>
                {name}
              </Text>
            </View>
          ) : (
          <Pressable
            {...({ href: hub } as object)}
            onPress={(e) => {
              e.preventDefault();
              leaveGuarded(() => {
                router.navigate(hub as never);
                done();
              });
            }}
            accessibilityRole="link"
            accessibilityState={{ selected: pathname === hub }}
            style={(state) => {
              const { pressed, hovered, focused } = state as WebPressState;
              return {
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.sm,
                height: ROW_HEIGHT,
                paddingHorizontal: t.spacing.sm,
                borderRadius: t.radius.sm,
                backgroundColor: pressed || hovered ? t.c.mutedSoft : 'transparent',
                ...focusRing(t, focused),
              };
            }}
          >
            <Icon name={section(tab).activeIcon} size={ICON_SIZE} color={t.c.primary} />
            <Text variant="body" weight="600" numberOfLines={1} style={{ flex: 1 }}>
              {tr('nav:shell.overview', { label: name })}
            </Text>
            <Icon name="arrow-right" size={16} color={t.c.muted} />
          </Pressable>
          )}
          {actions.map((a) => (
            <Pressable
              key={a.key}
              {...({ href: a.route } as object)}
              onPress={(e) => {
                e.preventDefault();
                leaveGuarded(() => {
                  router.navigate(appHref(a.route) as never);
                  done();
                });
              }}
              accessibilityRole="link"
              style={(state) => {
                const { pressed, hovered, focused } = state as WebPressState;
                return {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.xs,
                  height: 30,
                  paddingHorizontal: t.spacing.sm,
                  borderRadius: t.radius.sm,
                  borderWidth: 1,
                  borderColor: hovered ? t.c.lineStrong : t.c.line,
                  backgroundColor: pressed || hovered ? t.c.card2 : 'transparent',
                  ...focusRing(t, focused),
                };
              }}
            >
              <Icon name={a.icon} size={16} color={t.c.primary} />
              <Text variant="small" weight="600" numberOfLines={1}>
                {tr(a.labelKey as 'nav:title.invoices')}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ height: 1, backgroundColor: t.c.line, marginHorizontal: -t.spacing.sm }} />
        <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: t.spacing.md, rowGap: t.spacing.sm }}>
          {columns.map((col) => (
            <View key={col.group ?? 'all'} style={{ width: PANEL_COLUMN_WIDTH, gap: 2 }} role="group" aria-label={col.group ? tr(`nav:menuGroup.${col.group}`) : name}>
              {col.group ? (
                <Text
                  variant="micro"
                  weight="600"
                  tone="muted"
                  style={{ textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: t.spacing.sm, paddingTop: t.spacing.xs, paddingBottom: 2 }}
                >
                  {tr(`nav:menuGroup.${col.group}`)}
                </Text>
              ) : null}
              {col.pages.map((p) => (
                <PanelItem
                  key={p.key}
                  page={p}
                  label={tr(p.labelKey as 'nav:title.invoices')}
                  active={isOn(pathname, p.route)}
                  badge={p.badge ? badges[p.badge] : undefined}
                  onNavigate={done}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </>
  );
}

/** A section's badges, summed: the count when they're counts, a dot otherwise. */
function rollUp(pages: MenuPage[], badges: ReturnType<typeof useMenuBadges>): BadgeValue {
  const values = pages.map((p) => (p.badge ? badges[p.badge] : undefined)).filter((v): v is string => !!v);
  if (!values.length) return undefined;
  const total = values.reduce((n, v) => n + (Number(v) || 0), 0);
  return total > 0 ? countLabel(total) : true;
}

/**
 * The desktop replacement for the tab bar: the pages you visited last, then
 * the sections in bands. A section's pages drop down under it, one section
 * at a time, under their category headings; a closed row carries their
 * badges. Folded to icons, hovering a row shows its name and a section opens
 * its pages in a panel beside the sidebar. The business and branch,
 * search, notifications and Lixi live in the top bar. A plan that can't open
 * a section doesn't list it, exactly as the tab bar hides it.
 */
export function Sidebar() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'reports']);
  const pathname = usePathname();
  const plan = usePlan();
  const badges = useMenuBadges();
  const breakpoint = useBreakpoint();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  // A narrow window, such as a tablet, starts icons-only and opens by hand
  // for a moment: picking a page folds it again to give the room back. A
  // wider one stays as it was folded.
  const narrow = breakpoint === 'tablet';
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const folded = narrow ? openedOn !== pathname : collapsed;
  const toggleFolded = narrow ? () => setOpenedOn(folded ? pathname : null) : toggleCollapsed;

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

  // One section's pages drop down at a time. Arriving in a section opens its
  // list, so you can see where you are; its row's chevron closes it again.
  const [dropped, setDropped] = useState<{ tab: TabName | null; at: TabName }>({ tab: current, at: current });
  if (dropped.at !== current) setDropped({ tab: current, at: current });

  // Folded, there's no room below a row: a section's pages open in a panel beside it, closed by moving to another page.
  const [panel, setPanel] = useState<{ tab: TabName; rect: Rect; on: string; opener: HTMLElement | null } | null>(null);
  const opener = panel?.opener ?? null;
  const closePanel = React.useCallback(
    (restoreFocus: boolean) => {
      // Escape hands focus back to the section's row, as a menu does to its button.
      if (restoreFocus) opener?.focus();
      setPanel(null);
    },
    [opener],
  );

  // Folded, hovering a row names it.
  const [tip, setTip] = useState<{ label: string; rect: Rect; on: string } | null>(null);
  const tipProps = (label: string) =>
    compact ? { onHoverIn: (rect: Rect) => setTip({ label, rect, on: pathname }), onHoverOut: () => setTip(null) } : {};

  const labelFor = (name: TabName) => tr(`nav:tab.${name}` as 'nav:tab.index');
  // A section shows while the plan can open any of its pages (Stock on Free has Items & services).
  const visible = TABS.filter((tab) => tab.name !== 'more' && sectionHref(plan, tab.name));
  const groups = GROUPS.map((key) => ({ key, tabs: visible.filter((tab) => section(tab.name).sidebarGroup === key) })).filter((g) => g.tabs.length > 0);

  return (
    <Animated.View
      role="navigation"
      aria-label={tr('nav:shell.mainNavigation')}
      style={{
        width,
        backgroundColor: t.c.card,
        borderRightWidth: 1,
        borderRightColor: t.c.line,
        // Above the page, so the panel sits over it.
        zIndex: 10,
      }}
    >
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <View
          style={{
            height: TOP_BAR_HEIGHT,
            justifyContent: 'center',
            paddingHorizontal: compact ? t.spacing.sm : t.spacing.lg,
            alignItems: compact ? 'center' : 'flex-start',
          }}
        >
          <HomeLogo compact={!!compact} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: t.spacing.sm, gap: t.spacing.xxs }}>
          {groups.map((group, i) => (
            <React.Fragment key={group.key ?? 'top'}>
              {i > 0 ? <Rule /> : null}
              {group.tabs.map((tab) => {
                const active = current === tab.name && !inSettings;
                const label = labelFor(tab.name);
                const pages = section(tab.name).pages.filter((p) => canOpen(plan, p.route));
                const open = compact ? panel?.tab === tab.name && panel.on === pathname : dropped.tab === tab.name;
                return (
                  <React.Fragment key={tab.name}>
                  <NavItem
                    icon={active ? tab.activeIcon : tab.icon}
                    label={label}
                    active={active}
                    compact={compact}
                    // Open, the pages show their own badges.
                    badge={open && !compact ? undefined : rollUp(pages, badges)}
                    dropsDown={!compact}
                    {...(pages.length > 0
                      ? {
                          expanded: open,
                          onPress: (rect: Rect) => {
                            setTip(null);
                            if (!compact) {
                              setDropped({ tab: open ? null : tab.name, at: current });
                              return;
                            }
                            setPanel(
                              open
                                ? null
                                : { tab: tab.name, rect, on: pathname, opener: WEB && typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null },
                            );
                          },
                        }
                      : { href: tabPath(tab.name) })}
                    {...tipProps(label)}
                  />
                  {open && !compact && pages.length > 0 ? <SectionDropdown tab={tab.name} pathname={pathname} /> : null}
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
            borderTopWidth: 1,
            borderTopColor: t.c.line,
          }}
        >
          <View style={compact ? undefined : { flex: 1 }}>
            <NavItem
              icon="cog-outline"
              label={tr('nav:shell.settings')}
              active={inSettings || current === 'more'}
              href={SETTINGS_HREF}
              compact={compact}
              {...tipProps(tr('nav:shell.settings'))}
            />
          </View>
          <Pressable
            onPress={toggleFolded}
            accessibilityRole="button"
            accessibilityLabel={tr(folded ? 'nav:shell.expandSidebar' : 'nav:shell.collapseSidebar')}
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
            <Icon name={folded ? 'chevron-double-right' : 'chevron-double-left'} size={18} color={t.c.muted} />
          </Pressable>
        </View>
      </View>
      {tip && compact && !panel && tip.on === pathname ? <Tooltip rect={tip.rect} label={tip.label} /> : null}
      {/* Opened on another page: stale, so not shown. */}
      {panel && compact && panel.on === pathname ? (
        <SectionPanel
          tab={panel.tab}
          rect={panel.rect}
          left={compact ? SIDEBAR_COMPACT_WIDTH : SIDEBAR_WIDTH}
          pathname={pathname}
          onClose={closePanel}
        />
      ) : null}
    </Animated.View>
  );
}
