import { nextHint } from '../hints';

const on = { swipeUp: true, holdTab: true };
const fresh = { swipeTabs: false, swipeUp: false, holdTab: false };

describe('Gesture tips', () => {
  it('starts with swiping between tabs, then takes turns in order', () => {
    expect(nextHint(fresh, on, null)).toBe('swipeTabs');
    expect(nextHint(fresh, on, 'swipeTabs')).toBe('swipeUp');
    expect(nextHint(fresh, on, 'swipeUp')).toBe('holdTab');
    expect(nextHint(fresh, on, 'holdTab')).toBe('swipeTabs');
  });

  it('keeps repeating the one tip left once the others are learned', () => {
    const learned = { swipeTabs: true, swipeUp: true, holdTab: false };
    expect(nextHint(learned, on, 'holdTab')).toBe('holdTab');
    expect(nextHint(learned, on, null)).toBe('holdTab');
  });

  it('skips a Lixi gesture that is switched off', () => {
    expect(nextHint(fresh, { swipeUp: false, holdTab: true }, 'swipeTabs')).toBe('holdTab');
  });

  it('treats a tip missing from older saved state as not yet learned', () => {
    expect(nextHint({ swipeUp: true, holdTab: true }, on, null)).toBe('swipeTabs');
  });

  it('has nothing to show once every tip is learned or off', () => {
    expect(nextHint({ swipeTabs: true, swipeUp: true, holdTab: true }, on, null)).toBeNull();
    expect(nextHint({ ...fresh, swipeTabs: true }, { swipeUp: false, holdTab: false }, null)).toBeNull();
  });
});
