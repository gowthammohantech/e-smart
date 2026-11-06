'use client';

import { Moon, Sun } from 'lucide-react';

import { useThemeKey } from '@/lib/hooks';
import { setTheme } from '@/lib/theme';

/** Switches between the light and dark theme; the choice is remembered. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useThemeKey();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`grid size-10 place-items-center rounded-btn border border-line text-fg transition-colors hover:border-line-strong hover:text-primary ${className}`}
    >
      {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
