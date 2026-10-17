import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import LixiScreen from '@esmart/app/screens/(app)/lixi';
import { openLixiPanel } from '../../src/lixiPanel';
import { useIsDesktop } from '../../src/layout';

/**
 * On a desktop Lixi lives in the side panel, so anything that navigates to
 * /lixi (a shortcut, a deep link, a "hold a tab" question) opens the panel
 * and steps back off this route. Narrower windows get the phone screen.
 */
function LixiToPanel() {
  const router = useRouter();
  const { ask } = useLocalSearchParams<{ ask?: string }>();
  useEffect(() => {
    openLixiPanel(ask);
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)');
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function WebLixi() {
  return useIsDesktop() ? <LixiToPanel /> : <LixiScreen />;
}
