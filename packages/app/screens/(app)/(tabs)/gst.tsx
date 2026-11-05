import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { AppHeader } from '../../../components/AppHeader';
import { HubTiles } from '@esmart/ui/components/HubTiles';
import { ComplianceHub } from '../../../features/compliance/ComplianceHub';
import { useCanOpen } from '../../../store/selectors';
import { SETTINGS, appHref } from '../../../navigation/menu';
import { useSectionTiles } from '../../../navigation/useSectionTiles';

/**
 * The Sales plan's GST tab: the GST pages and their setup, then the same
 * compliance register the full plan reaches from More or the sidebar.
 */
export default function GstTab() {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance', 'nav']);
  const canOpen = useCanOpen();
  // The register below is the compliance page itself; its setup sits in Settings.
  const setup = SETTINGS.find((g) => g.key === 'gstSetup')!.pages[0];
  const pages = useSectionTiles('gst', {}, ['compliance']);
  const tiles = [
    ...pages,
    ...(canOpen(setup.route) ? [{ key: 'setup', label: tr('nav:more.group.gstSetup'), icon: 'cog-outline' as const, route: appHref(setup.route) }] : []),
  ];

  return (
    <View style={{ flex: 1 }}>
      <AppHeader title={tr('nav:tab.gst')} subtitle={tr('compliance:hub.subtitle')} />
      <ComplianceHub
        bottomInset={120}
        header={
          <View style={{ marginBottom: t.spacing.lg }}>
            <HubTiles tiles={tiles} />
          </View>
        }
      />
    </View>
  );
}
