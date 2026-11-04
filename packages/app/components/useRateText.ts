import { useState } from 'react';

/**
 * A rate field's text, kept as typed. Showing the parsed number back on every
 * keystroke turned "94." into "94", so the decimal point never stayed. The
 * typed text shows while it still reads as the value; when the value changes
 * from elsewhere (another currency picked), the field shows the new value.
 */
export function useRateText(value: number, onChange: (rate: number) => void): { value: string; onChangeText: (text: string) => void } {
  const [text, setText] = useState<string | null>(null);
  return {
    value: text !== null && (Number(text) || 0) === value ? text : String(value),
    onChangeText: (typed) => {
      // Digits and one decimal point.
      const clean = typed.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
      setText(clean);
      onChange(Number(clean) || 0);
    },
  };
}
