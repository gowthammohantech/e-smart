import type { LixiAccess, LixiHintKey, LixiHintsLearned } from '@/store/uiStore';

/** When the first tip shows after the tabs open, how often after that, and for how long. */
export const HINT_FIRST_MS = 20_000;
export const HINT_EVERY_MS = 3 * 60_000;
export const HINT_SHOW_MS = 6_000;

export const HINT_TEXT: Record<LixiHintKey, string> = {
  swipeTabs: 'Swipe left or right to switch tabs',
  swipeUp: 'Swipe up on the bar to ask Lixi',
  holdTab: 'Hold any tab to ask Lixi about it',
};

const ORDER: LixiHintKey[] = ['swipeTabs', 'swipeUp', 'holdTab'];

/**
 * The tip to show next: one whose gesture is switched on and not yet learned,
 * taking turns in order after the one shown last. Null when there is nothing
 * left to teach. Swiping between tabs is always on.
 */
export function nextHint(
  learned: Partial<LixiHintsLearned>,
  access: Pick<LixiAccess, 'swipeUp' | 'holdTab'>,
  last: LixiHintKey | null,
): LixiHintKey | null {
  const open = ORDER.filter((key) => (key === 'swipeTabs' || access[key]) && !learned[key]);
  if (open.length === 0) return null;
  const from = last ? ORDER.indexOf(last) : -1;
  return open.find((key) => ORDER.indexOf(key) > from) ?? open[0];
}
