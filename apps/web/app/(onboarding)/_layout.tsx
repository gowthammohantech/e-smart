import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import OnboardingLayout from '@esmart/app/screens/(onboarding)/_layout';
import { useIsDesktop } from '../../src/layout';
import { OnboardingRail } from '../../src/shell/OnboardingRail';

/**
 * Onboarding on a desktop is a wizard: the step rail on the left, the step
 * on the right (WizardShell lays itself out for this). Narrow windows get the
 * phone flow.
 */
export default function WebOnboardingLayout() {
  const t = useTheme();
  const desktop = useIsDesktop();
  if (!desktop) return <OnboardingLayout />;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.c.bg }}>
      <OnboardingRail />
      <View style={{ flex: 1 }}>
        <OnboardingLayout />
      </View>
    </View>
  );
}
