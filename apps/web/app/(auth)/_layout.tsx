import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import AuthLayout from '@esmart/app/screens/(auth)/_layout';
import { useBreakpoint } from '../../src/layout';
import { AuthBrandPanel } from '../../src/shell/AuthBrandPanel';

/**
 * Sign-in on a desktop is a split screen: the brand panel on the left, the
 * form column on the right (AuthShell lays itself out for this). A window too
 * narrow for both drops the panel; a phone-width window is the phone flow.
 */
export default function WebAuthLayout() {
  const t = useTheme();
  const breakpoint = useBreakpoint();
  if (breakpoint === 'phone') return <AuthLayout />;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.c.paper }}>
      {breakpoint === 'tablet' ? null : (
        // A fixed share, capped, so a very wide window widens the form side
        // rather than stretching the panel's copy apart.
        <View style={{ width: '40%', maxWidth: 680 }}>
          <AuthBrandPanel />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <AuthLayout />
      </View>
    </View>
  );
}
