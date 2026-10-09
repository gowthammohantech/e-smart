import { View } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { PageActionsProvider, PageHeader } from '@esmart/ui/components/PageHeader';
import { usePlanGuard } from '@esmart/app/navigation/usePlanGuard';
import { Sidebar } from '../../src/Sidebar';
import { TopBar } from '../../src/shell/TopBar';
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
            <View style={{ flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, flexDirection: 'row', gap: t.spacing.lg }}>
              {/* Kept in place (null when hidden) so the Stack never remounts. */}
              {inSettings ? <SettingsNav /> : null}
              <View style={{ flex: 1, maxWidth: inSettings ? 880 : undefined }}>{stack}</View>
            </View>
          </View>
        </View>
      </View>
    </PageActionsProvider>
  );
}
