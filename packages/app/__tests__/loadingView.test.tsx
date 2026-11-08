import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider } from '@esmart/ui/theme/ThemeProvider';
import { LoadingView, type LoadingVariant } from '../components/LoadingView';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((r) => r.unmount()));
});

async function render(variant: LoadingVariant) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <ThemeProvider mode="light" script="latin">
        <LoadingView variant={variant} title="Invoice" />
      </ThemeProvider>,
    );
  });
  mounted.push(root);
  return root;
}

const progress = (root: ReactTestRenderer) => root.root.findAll((n) => typeof n.type !== 'string' && n.props.accessibilityRole === 'progressbar');

describe('LoadingView', () => {
  it.each<LoadingVariant>(['detail', 'form', 'items-form', 'report', 'list', 'page'])('draws the %s shape as one loading region', async (variant) => {
    const root = await render(variant);
    expect(progress(root)).toHaveLength(1);
    // Placeholders, not a spinner.
    expect(root.root.findAll((n) => n.props.importantForAccessibility === 'no-hide-descendants').length).toBeGreaterThan(3);
  });

  it('keeps a spinner for screens with no fixed shape', async () => {
    const root = await render('spinner');
    expect(progress(root)).toHaveLength(1);
    expect(root.root.findAll((n) => n.props.importantForAccessibility === 'no-hide-descendants')).toHaveLength(0);
  });
});
