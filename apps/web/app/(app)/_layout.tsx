import { View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { usePlanGuard } from '@esmart/app/navigation/usePlanGuard';
import { Sidebar } from '../../src/Sidebar';
import { CONTENT_MAX_WIDTH, useIsDesktop } from '../../src/layout';

/**
 * The signed-in shell for the browser. On a desktop the sidebar stays put
 * and screens render in a centred column; on a narrow window it is the phone
 * layout. Unlike the mobile shell there is no Siri / Shortcuts sync here.
 */
export default function WebAppLayout() {
  const t = useTheme();
  const desktop = useIsDesktop();
  usePlanGuard();

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.c.bg }}>
      {desktop ? <Sidebar /> : null}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: desktop ? CONTENT_MAX_WIDTH : undefined }}>
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
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="lixi" options={{ headerShown: false, presentation: 'modal' }} />
          </Stack>
        </View>
      </View>
    </View>
  );
}
