import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the person has asked the system to reduce motion. Follows the setting
 * live, so flipping it while the app is open stops (or restarts) every loop
 * without a relaunch. Starts `false` until the first read resolves.
 */
export function useReducedMotion() {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => !cancelled && setReduce(r))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  return reduce;
}
