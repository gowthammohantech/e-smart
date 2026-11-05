import React from 'react';
import { Text as RNText, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { PickerField, TextField } from '../Field';

// Unmounted after each test, so an icon font that loads late doesn't render into a torn-down environment.
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

describe('Field accessibility', () => {
  it('marks a required input and hides the asterisk from screen readers', () => {
    const root = render(<TextField label="Name" required value="" onChangeText={() => {}} />);
    const input = root.root.findByType(TextInput);
    expect(input.props['aria-required']).toBe(true);
    expect(input.props['aria-invalid']).toBeUndefined();
    expect(input.props['aria-describedby']).toBeUndefined();
    const star = root.root.findAll((n) => n.type === RNText && n.props.children === ' *');
    expect(star.length).toBeGreaterThan(0);
    expect(star[0].props['aria-hidden']).toBe(true);
  });

  it('links an error to its input and announces it as an alert', () => {
    const root = render(<TextField label="Name" required error="Enter a name" value="" onChangeText={() => {}} />);
    const input = root.root.findByType(TextInput);
    expect(input.props['aria-invalid']).toBe(true);
    const describedBy = input.props['aria-describedby'];
    expect(describedBy).toMatch(/^field-msg-/);
    const message = root.root.find((n) => n.type === RNText && n.props.id === describedBy);
    expect(message.props.children).toBe('Enter a name');
  });

  it('points at the hint when there is no error', () => {
    const root = render(<TextField label="SKU" hint="Left blank, one is made" value="" onChangeText={() => {}} />);
    const input = root.root.findByType(TextInput);
    const message = root.root.find((n) => n.type === RNText && n.props.id === input.props['aria-describedby']);
    expect(message.props.children).toBe('Left blank, one is made');
  });

  it('says a required picker is required in its label', () => {
    const root = render(<PickerField label="Unit" required value="Box" onPress={() => {}} error="Pick a unit" />);
    const button = root.root.find((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Unit'));
    expect(button.props.accessibilityLabel).toBe('Unit, required: Box');
    expect(button.props['aria-invalid']).toBe(true);
  });
});
