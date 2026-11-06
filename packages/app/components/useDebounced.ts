import { useEffect, useState } from 'react';

/** `value`, once it has stayed the same for `ms`: what's typed in a search box, before asking the server. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
