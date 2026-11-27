import { useState } from 'react';

/**
 * Text field props for a decimal number held elsewhere. The field keeps what
 * was typed, so "83." stays on screen while the number is already 83, and
 * picks up the number again when it changes from outside (a rate resolved
 * for a new date or party).
 *
 * `emptyAs`: what an empty (or zero) box counts as. The box stays empty while the number is that,
 * so a rate can be cleared to retype it and still be worked out at, say, 1 meanwhile.
 */
export function useDecimalText(value: number, onChange: (n: number) => void, emptyAs?: number) {
  const [text, setText] = useState(String(value));
  const blank = emptyAs !== undefined && !(Number(text) > 0) && value === emptyAs;
  const shown = Number(text) === value || blank ? text : String(value);
  return {
    value: shown,
    onChangeText: (v: string) => {
      const clean = v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
      setText(clean);
      onChange(Number(clean) || emptyAs || 0);
    },
  };
}
