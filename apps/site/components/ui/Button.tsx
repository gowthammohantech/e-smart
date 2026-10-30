import { ArrowRight } from 'lucide-react';

type Props = {
  href: string;
  children: React.ReactNode;
  variant?: 'filled' | 'outline';
  className?: string;
};

/** A link styled as a button, with the circled arrow from the design. */
export function Button({ href, children, variant = 'filled', className = '' }: Props) {
  const look =
    variant === 'filled'
      ? 'bg-primary text-white hover:bg-primary-pressed'
      : 'border border-primary text-primary hover:bg-primary-tint';
  const dot = variant === 'filled' ? 'bg-white text-primary' : 'bg-primary text-white';
  return (
    <a
      href={href}
      className={`group inline-flex items-center justify-center gap-2.5 rounded-btn px-4 py-2.5 text-sm font-medium transition-colors ${look} ${className}`}
    >
      {children}
      <span className={`grid size-4 place-items-center rounded-full transition-transform group-hover:translate-x-0.5 ${dot}`}>
        <ArrowRight className="size-2.5" strokeWidth={3} aria-hidden />
      </span>
    </a>
  );
}
