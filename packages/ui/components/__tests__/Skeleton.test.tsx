import React from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { Skeleton, SkeletonGroup, SkeletonRows, SkeletonStatGrid } from '../Skeleton';
import { StatTile } from '../StatTile';

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((r) => r.unmount()));
  jest.restoreAllMocks();
});

async function render(node: React.ReactNode) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <ThemeProvider mode="light" script="latin">
        {node}
      </ThemeProvider>,
    );
  });
  mounted.push(root);
  return root;
}

/** Gives every measured block a width, as a real layout pass would. */
function layOut(root: ReactTestRenderer, width = 200) {
  act(() => {
    root.root
      .findAll((n) => typeof n.type !== 'string' && n.type === View && typeof n.props.onLayout === 'function')
      .forEach((n) => n.props.onLayout({ nativeEvent: { layout: { width, height: 16, x: 0, y: 0 } } }));
  });
}

const sweeps = (root: ReactTestRenderer) => root.root.findAll((n) => n.props.pointerEvents === 'none' && typeof n.type !== 'string').length;

describe('Skeleton', () => {
  it('is hidden from assistive tech', async () => {
    const root = await render(<Skeleton height={12} />);
    const block = root.root.find((n) => n.props.importantForAccessibility === 'no-hide-descendants');
    expect(block.props.accessibilityElementsHidden).toBe(true);
    expect(block.props['aria-hidden']).toBe(true);
  });

  it('sweeps a highlight once it knows its width', async () => {
    const root = await render(<Skeleton height={12} />);
    expect(sweeps(root)).toBe(0);
    layOut(root);
    expect(sweeps(root)).toBeGreaterThan(0);
  });

  it('stands still under Reduce Motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const root = await render(<Skeleton height={12} />);
    layOut(root);
    expect(sweeps(root)).toBe(0);
  });
});

describe('SkeletonGroup', () => {
  it('announces one loading region, not one per block', async () => {
    const root = await render(
      <SkeletonGroup>
        <SkeletonRows rows={4} kind="document" />
        <SkeletonStatGrid tiles={3} />
      </SkeletonGroup>,
    );
    const regions = root.root.findAll((n) => typeof n.type !== 'string' && n.props.accessibilityRole === 'progressbar');
    expect(regions).toHaveLength(1);
    expect(regions[0].props.accessibilityLabel).toBe('Loading');
  });
});

describe('StatTile loading', () => {
  it('keeps the label and swaps the figure for a placeholder', async () => {
    const root = await render(<StatTile label="Receivables" value="₹1,20,000" loading />);
    const text = JSON.stringify(root.toJSON());
    expect(text).toContain('Receivables');
    expect(text).not.toContain('1,20,000');
  });
});
