/** The four-point sparkle used in eyebrows and the brand lockup. */
export function Sparkle({ className = 'size-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0Z" />
    </svg>
  );
}

/** The sunburst that separates marquee words. */
export function Sunburst({ className = 'size-10' }: { className?: string }) {
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden fill="currentColor">
      {rays.map((deg) => (
        <rect key={deg} x="22.5" y="2" width="3" height="18" rx="1.5" transform={`rotate(${deg} 24 24)`} />
      ))}
    </svg>
  );
}
