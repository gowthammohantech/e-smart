import { fontSize, typeMetrics } from '@/theme/tokens';

/**
 * The type scale is tuned for Latin, and Tamil needs different metrics. The
 * property that matters most is the one this pins first: turning the script
 * axis on must not move a single English pixel.
 */
const tracking = (script: keyof typeof typeMetrics, px: number) => px * typeMetrics[script].tracking || 0;
const lineHeight = (script: keyof typeof typeMetrics, size: number) => {
  const ratio = typeMetrics[script].lineHeight;
  return ratio ? Math.round(size * ratio) : undefined;
};

describe('per-script type metrics', () => {
  it('leaves Latin exactly as it was', () => {
    // The display sizes carry negative tracking; Latin keeps every value.
    expect(tracking('latin', -0.8)).toBe(-0.8);
    expect(tracking('latin', -0.2)).toBe(-0.2);
    expect(tracking('latin', 0.4)).toBe(0.4);
    // No explicit lineHeight, so the platform default stands.
    expect(lineHeight('latin', fontSize.body)).toBeUndefined();
    expect(lineHeight('latin', fontSize.display)).toBeUndefined();
  });

  it('drops the negative tracking for Tamil', () => {
    // At −0.8 the vowel signs collide with the letters they belong to.
    expect(tracking('tamil', -0.8)).toBe(0);
    expect(tracking('tamil', 0.4)).toBe(0);
  });

  it('gives Tamil leading at every size in the scale', () => {
    for (const size of Object.values(fontSize)) {
      const tamil = lineHeight('tamil', size);
      expect({ size, tamil }).toEqual({ size, tamil: expect.any(Number) });
      // Enough room for marks above and below without looking double-spaced.
      expect(tamil!).toBeGreaterThan(size);
      expect(tamil!).toBeLessThanOrEqual(Math.round(size * 1.6));
    }
  });
});
