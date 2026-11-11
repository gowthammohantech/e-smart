import { describe, expect, it } from 'vitest';
import { estimateCostUsd, priceOf } from '../src/providers/modelPrices';

describe('model price table', () => {
  it('reads a model as servers name it, without mistaking one model for another', () => {
    expect(priceOf('gpt-5-mini')).toMatchObject({ input: 0.25, output: 2 });
    expect(priceOf('gpt-5-mini-2025-08-07')).toMatchObject({ input: 0.25 });
    expect(priceOf('openai/gpt-5')).toMatchObject({ input: 1.25 });
    expect(priceOf('claude-opus-5-5')).toMatchObject({ input: 4 });
    expect(priceOf('claude-opus-5')).toMatchObject({ input: 5 });
    expect(priceOf('claude-sonnet-4-5-20250929')).toMatchObject({ input: 3 });
    expect(priceOf('gpt-5-turbo-custom')).toBeNull();
    expect(priceOf('llama-3.3-70b-versatile')).toBeNull();
  });

  it('prices cache reads and writes apart from fresh input', () => {
    // Haiku 4.5: $1 in, $5 out; cache reads 0.1x, writes 1.25x.
    expect(estimateCostUsd('claude-haiku-4-5', { input: 1_000_000, output: 100_000, cacheRead: 1_000_000, cacheWrite: 1_000_000 })).toBeCloseTo(1 + 0.5 + 0.1 + 1.25, 9);
    expect(estimateCostUsd('my-local-model', { input: 1, output: 1 })).toBeNull();
  });
});
