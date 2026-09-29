import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import OnboardingLayout from '@esmart/app/screens/(onboarding)/_layout';
import { FORM_MAX_WIDTH, useIsDesktop } from '../../src/layout';

/** On a desktop the phone-shaped flow sits in a centred card, not full-bleed. */
export default function WebOnboardingLayout() {
  const t = useTheme();
  const desktop = useIsDesktop();
  if (!desktop) return <OnboardingLayout />;
  return (
    <View style={{ flex: 1, backgroundColor: t.c.canvas, alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl }}>
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: FORM_MAX_WIDTH,
          maxHeight: 900,
          borderRadius: t.radius.lg,
          overflow: 'hidden',
          backgroundColor: t.c.bg,
          borderWidth: 1,
          borderColor: t.c.line,
        }}
      >
        <OnboardingLayout />
      </View>
    </View>
  );
}
