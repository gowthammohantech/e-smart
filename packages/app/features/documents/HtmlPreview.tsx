import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

/** A rendered document (invoice, quote…) from its print HTML. */
export function HtmlPreview({ html, style }: { html: string; style?: StyleProp<ViewStyle> }) {
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      style={[{ flex: 1, backgroundColor: '#FFFFFF' }, style]}
      scalesPageToFit
      showsVerticalScrollIndicator={SHOW_SCROLLBAR}
    />
  );
}

/** Opens the system print dialog for just this document. */
export function printHtml(html: string): Promise<void> {
  return Print.printAsync({ html });
}
