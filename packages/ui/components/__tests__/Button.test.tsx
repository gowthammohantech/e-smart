import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { Button } from '../Button';
import { ConfirmDialog } from '../ConfirmDialog';

jest.mock('expo-haptics', () => ({ impactAsync: () => Promise.resolve(), ImpactFeedbackStyle: { Light: 'light' } }));

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((r) => r.unmount()));
});

function render(node: React.ReactElement) {
  let root!: ReactTestRenderer;
  act(() => {
    root = create(
      <ThemeProvider mode="light" script="latin">
        {node}
      </ThemeProvider>,
    );
  });
  mounted.push(root);
  return root;
}

// The pressable itself: the host node that carries the button's role and press handler.
const pressOf = (root: ReactTestRenderer) =>
  root.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0].props.onPress;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('Button double taps', () => {
  it('runs an async action once while it is still running', async () => {
    const d = deferred();
    const onPress = jest.fn(() => d.promise);
    const root = render(<Button title="Save" onPress={onPress} />);
    const press = pressOf(root) as () => void;
    // Both taps land before any re-render.
    act(() => {
      press();
      press();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve();
      await d.promise;
    });
    act(() => (pressOf(root) as () => void)());
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('lets a plain action run on every press', () => {
    const onPress = jest.fn();
    const root = render(<Button title="Add" onPress={onPress} />);
    const press = pressOf(root) as () => void;
    act(() => {
      press();
      press();
    });
    expect(onPress).toHaveBeenCalledTimes(2);
  });
});

describe('ConfirmDialog double taps', () => {
  it('confirms once per showing', () => {
    const onConfirm = jest.fn();
    const root = render(<ConfirmDialog visible title="Finalise?" confirmLabel="Finalise" onConfirm={onConfirm} onCancel={() => {}} />);
    const confirm = root.root.findAllByType(Button).find((b) => b.props.title === 'Finalise')!;
    act(() => {
      confirm.props.onPress();
      confirm.props.onPress();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
