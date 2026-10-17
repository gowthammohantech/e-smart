/** Deterministic PRNG so the demo dataset is identical on every install. */
export function makeRng(seed = 20260101) {
  let s = seed >>> 0;
  return {
    next(): number {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    },
    int(min: number, max: number): number {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    pick<T>(arr: T[]): T {
      return arr[Math.floor(this.next() * arr.length) % arr.length];
    },
    bool(pTrue = 0.5): boolean {
      return this.next() < pTrue;
    },
  };
}

export type Rng = ReturnType<typeof makeRng>;
