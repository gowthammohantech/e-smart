import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

/**
 * A rendered document in the browser: the print HTML in a sandboxed frame,
 * the way it will look on paper. (react-native-webview has no web build.)
 */
export function HtmlPreview({ html, style }: { html: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flex: 1, backgroundColor: '#FFFFFF' }, style]}>
      <iframe
        title="Document preview"
        srcDoc={html}
        sandbox="allow-same-origin allow-modals"
        style={{ border: 'none', width: '100%', height: '100%', flex: 1 }}
      />
    </View>
  );
}

/**
 * Prints just this document from a hidden frame, so the browser's dialog
 * offers it alone (and "Save as PDF") rather than the whole app page.
 */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        setTimeout(() => frame.remove(), 1000);
      }
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
