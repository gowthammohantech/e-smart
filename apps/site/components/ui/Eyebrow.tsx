import { Sparkle } from './Sparkle';

export function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-line bg-primary-tint px-3 py-1.5 text-xs leading-none font-medium text-primary ${className}`}
    >
      <Sparkle />
      {children}
    </span>
  );
}
