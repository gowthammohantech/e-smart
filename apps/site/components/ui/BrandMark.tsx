import { brand } from '@/content/site';

/**
 * The Elixir mark beside the wordmark, in the variant drawn for the active
 * theme ("-dark" for dark backgrounds); scripts/copy-brand.mjs copies them in.
 */
export function BrandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const mark = size === 'lg' ? 'h-11' : 'h-8';
  const text = size === 'lg' ? 'text-2xl' : 'text-[17px]';
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src="/brand/elixir-mark.png" alt="" width={265} height={378} className={`${mark} w-auto dark:hidden`} />
      <img src="/brand/elixir-mark-dark.png" alt="" width={265} height={378} className={`${mark} hidden w-auto dark:block`} />
      <span className={`font-display font-medium tracking-tight text-fg ${text}`}>
        {brand.short} <span className="text-primary">Smart</span>
      </span>
    </span>
  );
}
