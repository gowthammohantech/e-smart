import { Animated, View } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { PageActionsProvider, PageHeader } from '@esmart/ui/components/PageHeader';
import { usePlanGuard } from '@esmart/app/navigation/usePlanGuard';
import { Sidebar } from '../../src/Sidebar';
import { SIDEBAR_COMPACT_WIDTH, SIDEBAR_WIDTH, sidebarWidth } from '../../src/sidebarState';
import { TopBar } from '../../src/shell/TopBar';
import { LixiPanel } from '../../src/shell/LixiPanel';
import { SettingsNav } from '../../src/shell/SettingsNav';
import { CONTENT_MAX_WIDTH, useIsDesktop } from '../../src/layout';

/**
 * The signed-in shell for the browser. On a desktop: the sidebar on the
 * left, the top bar across, and each page under its own page header (title,
 * back link, actions) in a centred column. A narrow window gets the phone
 * layout. Unlike the mobile shell there is no Siri / Shortcuts sync here.
 */
export default function WebAppLayout() {
  const t = useTheme();
  const desktop = useIsDesktop();
  const pathname = usePathname();
  // Settings pages get their own list of pages beside them (and a narrower,
  // form-width column); everything else uses the full content width.
  const inSettings = pathname.startsWith('/settings');
  // Plan & billing lays its tiers side by side, so it takes the full column.
  const wideSettings = pathname.startsWith('/settings/plan') || pathname.startsWith('/settings/sync');
  usePlanGuard();

  const stack = (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: t.c.bg },
        headerTintColor: t.c.text,
        headerTitleStyle: { color: t.c.text, fontSize: t.fontSize.title, fontWeight: '600' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: t.c.bg },
        animation: 'none',
        ...(desktop
          ? {
              header: ({ options, back, navigation }) => (
                <PageHeader
                  title={typeof options.title === 'string' ? options.title : ''}
                  // A route group's name, like "(tabs)", is not a page title.
                  backLabel={back?.title && !/^\(.*\)$/.test(back.title) ? back.title : undefined}
                  onBack={back ? navigation.goBack : undefined}
                  right={options.headerRight?.({ canGoBack: !!back, tintColor: t.c.text })}
                />
              ),
            }
          : null),
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="lixi" options={{ headerShown: false, presentation: 'modal' }} />
    </Stack>
  );

  if (!desktop) return <View style={{ flex: 1, backgroundColor: t.c.bg }}>{stack}</View>;

  return (
    <PageActionsProvider>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.c.bg }}>
        <Sidebar />
        <View style={{ flex: 1 }}>
          <TopBar />
          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: t.spacing.lg }}>
            {/* A folded sidebar hands its width to the page: the column's cap
                grows by exactly what the sidebar gave up. */}
            <Animated.View
              style={{
                flex: 1,
                width: '100%',
                maxWidth: sidebarWidth.interpolate({
                  inputRange: [SIDEBAR_COMPACT_WIDTH, SIDEBAR_WIDTH],
                  outputRange: [CONTENT_MAX_WIDTH + SIDEBAR_WIDTH - SIDEBAR_COMPACT_WIDTH, CONTENT_MAX_WIDTH],
                  extrapolate: 'clamp',
                }),
                flexDirection: 'row',
                gap: t.spacing.lg,
              }}
            >
              {/* Kept in place (null when hidden) so the Stack never remounts. */}
              {inSettings ? <SettingsNav /> : null}
              <View style={{ flex: 1, maxWidth: inSettings && !wideSettings ? 880 : undefined }}>{stack}</View>
            </Animated.View>
          </View>
        </View>
        <LixiPanel />
      </View>
    </PageActionsProvider>
  );
}
