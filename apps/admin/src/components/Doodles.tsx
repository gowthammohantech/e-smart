import { DOODLES, SCATTER } from '@esmart/ui/illustrations/doodles';

/**
 * A few line-art doodles scattered around the page's edges behind the content,
 * the same set the apps draw (packages/ui/illustrations/doodles.ts). Each bobs
 * on its own beat in CSS; decorative only.
 */
export function DoodleScatter() {
  return (
    <div className="doodle-scatter" aria-hidden="true">
      {SCATTER.map((it, i) => (
        <svg
          key={i}
          className={it.name === 'sparkle' ? 'spark' : undefined}
          viewBox="0 0 48 48"
          width={it.size}
          height={it.size}
          style={{ left: `${it.x * 100}%`, top: `${it.y * 100}%`, rotate: `${it.rotate}deg`, animationDelay: `${-i * 0.9}s` }}
        >
          <path d={DOODLES[it.name]} />
        </svg>
      ))}
    </div>
  );
}
