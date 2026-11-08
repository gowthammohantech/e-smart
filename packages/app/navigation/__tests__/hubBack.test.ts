import { hubFor } from '../hubBack';

describe('the way back from a screen opened by link', () => {
  it('goes to the list a record belongs to', () => {
    expect(hubFor('/sales/invoices/inv_42')).toBe('/(app)/sales/invoices');
    expect(hubFor('/sales/invoices/inv_42?tab=pay')).toBe('/(app)/sales/invoices');
  });
  it("goes from a section's list to the section hub", () => {
    expect(hubFor('/sales/invoices')).toBe('/(app)/(tabs)/sales');
  });
  it('goes from a page outside the menu to the section it is filed under', () => {
    expect(hubFor('/settings/does-not-exist')).toBe('/(app)/(tabs)/more');
  });
});
