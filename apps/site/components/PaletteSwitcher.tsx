'use client';

import { PALETTE_KEYS, PALETTES, setPalette } from '@/lib/palette';
import { usePaletteKey } from '@/lib/hooks';

/** A floating control for comparing the two palettes. Also: ?palette=indigo. */
export function PaletteSwitcher() {
  const active = usePaletteKey();
  return (
    <div
      role="radiogroup"
      aria-label="Colour palette"
      className="fixed right-4 bottom-4 z-50 flex gap-1 rounded-full border border-line bg-surface/90 p-1 text-xs backdrop-blur-md"
    >
      {PALETTE_KEYS.map((key) => {
        const on = key === active;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setPalette(key)}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors ${on ? 'bg-primary text-white' : 'text-muted hover:text-fg'}`}
          >
            <span className="size-2.5 rounded-full border border-white/40" style={{ background: PALETTES[key].three.primary }} />
            {PALETTES[key].label}
          </button>
        );
      })}
    </div>
  );
}
