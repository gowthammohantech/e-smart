import type { LixiAccess, LixiHintKey, LixiHintsLearned } from '@/store/uiStore';

/** When the first tip shows after the tabs open, how often after that, and for how long. */
export const HINT_FIRST_MS = 20_000;
export const HINT_EVERY_MS = 3 * 60_000;
export const HINT_SHOW_MS = 6_000;

export const HINT_TEXT: Record<LixiHintKey, string> = {
  swipeUp: 'Swipe up on the bar to ask Lixi',
  holdTab: 'Hold any tab to ask Lixi about it',
};

const ORDER: LixiHintKey[] = ['swipeUp', 'holdTab'];

/**
 * The tip to show next: one whose gesture is switched on and not yet learned,
 * taking turns with the one shown last. Null when there is nothing left to teach.
 */
export function nextHint(
  learned: LixiHintsLearned,
  access: Pick<LixiAccess, LixiHintKey>,
  last: LixiHintKey | null,
): LixiHintKey | null {
  const open = ORDER.filter((key) => access[key] && !learned[key]);
  if (open.length === 0) return null;
  return open.find((key) => key !== last) ?? open[0];
}
