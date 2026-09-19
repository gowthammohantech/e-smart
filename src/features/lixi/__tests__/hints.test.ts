import { nextHint } from '../hints';

const on = { swipeUp: true, holdTab: true };
const fresh = { swipeUp: false, holdTab: false };

describe('Lixi gesture tips', () => {
  it('starts with swipe-up, then takes turns', () => {
    expect(nextHint(fresh, on, null)).toBe('swipeUp');
    expect(nextHint(fresh, on, 'swipeUp')).toBe('holdTab');
    expect(nextHint(fresh, on, 'holdTab')).toBe('swipeUp');
  });

  it('keeps repeating the one tip left once the other is learned', () => {
    const swiped = { swipeUp: true, holdTab: false };
    expect(nextHint(swiped, on, 'holdTab')).toBe('holdTab');
    expect(nextHint(swiped, on, null)).toBe('holdTab');
  });

  it('skips a gesture that is switched off', () => {
    expect(nextHint(fresh, { swipeUp: false, holdTab: true }, 'holdTab')).toBe('holdTab');
  });

  it('has nothing to show once both are learned or off', () => {
    expect(nextHint({ swipeUp: true, holdTab: true }, on, null)).toBeNull();
    expect(nextHint(fresh, { swipeUp: false, holdTab: false }, null)).toBeNull();
  });
});
