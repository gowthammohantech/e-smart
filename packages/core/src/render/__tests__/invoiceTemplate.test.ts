import { DEFAULT_ACCENT, DEFAULT_DECLARATION, resolveTemplate } from '../invoiceTemplate';

describe('resolving a template', () => {
  it('is the standard page when the business has none', () => {
    const t = resolveTemplate(undefined);
    expect(t.layout).toBe('standard');
    expect(t.accentColor).toBe(DEFAULT_ACCENT);
    expect(t.showHsnSummary).toBe(false);
    expect(t.showBank).toBe(true);
  });

  it("takes the layout's own defaults, with the business's choices on top", () => {
    const t = resolveTemplate({ layout: 'detailed', showPanTan: false, accentColor: '#0B6E4F' });
    expect(t.logoPosition).toBe('right');
    expect(t.showShipTo).toBe(true);
    expect(t.showPanTan).toBe(false);
    expect(t.accentColor).toBe('#0B6E4F');
    expect(resolveTemplate({ layout: 'modern' }).accentColor).toBe('#C8930B');
  });

  it("lets one document's layout win over the business's", () => {
    expect(resolveTemplate({ layout: 'classic' }, 'modern').layout).toBe('modern');
    expect(resolveTemplate({ layout: 'classic' }, null).layout).toBe('classic');
  });

  it('ignores an unknown layout or logo side and trims the declaration', () => {
    const t = resolveTemplate({ layout: 'fancy' as never, logoPosition: 'top' as never, declarationText: '   ' });
    expect(t.layout).toBe('standard');
    expect(t.logoPosition).toBe('left');
    expect(t.declarationText).toBe(DEFAULT_DECLARATION);
    expect(resolveTemplate({ declarationText: 'x'.repeat(400) }).declarationText).toHaveLength(300);
  });
});
