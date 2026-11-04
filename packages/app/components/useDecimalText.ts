import { useState } from 'react';

/**
 * Text field props for a decimal number held elsewhere. The field keeps what
 * was typed, so "83." stays on screen while the number is already 83, and
 * picks up the number again when it changes from outside (a rate resolved
 * for a new date or party).
 */
export function useDecimalText(value: number, onChange: (n: number) => void) {
  const [text, setText] = useState(String(value));
  const shown = Number(text) === value ? text : String(value);
  return {
    value: shown,
    onChangeText: (v: string) => {
      const clean = v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
      setText(clean);
      onChange(Number(clean) || 0);
    },
  };
}
