import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import AuthLayout from '@esmart/app/screens/(auth)/_layout';
import { useBreakpoint } from '../../src/layout';
import { AuthBrandPanel } from '../../src/shell/AuthBrandPanel';

/**
 * Sign-in on a desktop or tablet-width browser is an even split screen: the
 * brand panel on the left, the form column on the right (AuthShell lays itself
 * out for this). A phone-width window is the phone flow.
 */
export default function WebAuthLayout() {
  const t = useTheme();
  const breakpoint = useBreakpoint();
  if (breakpoint === 'phone') return <AuthLayout />;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.c.paper }}>
      {/* An even half. The panel centres its copy at a fixed reading width,
          so a very wide window adds margin rather than stretching the lines. */}
      <View style={{ flex: 1 }}>
        <AuthBrandPanel />
      </View>
      <View style={{ flex: 1 }}>
        <AuthLayout />
      </View>
    </View>
  );
}
