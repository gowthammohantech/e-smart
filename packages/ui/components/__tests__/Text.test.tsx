import React from 'react';
import { StyleSheet, Text as RNText, type TextStyle } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { Text } from '../Text';

/**
 * Callers override size and tracking all over the app (tab labels, badges,
 * uppercase captions). Those overrides must go through the same per-script
 * metrics as the variants, or Tamil gets a variant's leading on a small label
 * and Latin tracking that pulls vowel signs off their letters.
 */
function rendered(script: 'latin' | 'tamil', style: TextStyle): TextStyle {
  let root!: ReactTestRenderer;
  act(() => {
    root = create(
      <ThemeProvider mode="light" script={script}>
        <Text style={style}>அ</Text>
      </ThemeProvider>,
    );
  });
  return StyleSheet.flatten(root.root.findByType(RNText).props.style);
}

describe('Text style overrides', () => {
  it('derives the Tamil line height from an overridden font size', () => {
    expect(rendered('tamil', { fontSize: 10 }).lineHeight).toBe(15);
  });

  it('keeps an explicit line height', () => {
    expect(rendered('tamil', { fontSize: 9, lineHeight: 12 }).lineHeight).toBe(12);
  });

  it('drops overridden tracking for Tamil', () => {
    expect(rendered('tamil', { letterSpacing: 0.8 }).letterSpacing).toBe(0);
  });

  it('leaves Latin exactly as the caller wrote it', () => {
    const style = rendered('latin', { fontSize: 10, letterSpacing: 0.8 });
    expect(style.lineHeight).toBeUndefined();
    expect(style.letterSpacing).toBe(0.8);
  });
});
