import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BrandMark } from '@/components/ui/BrandMark';
import { cookbookNav } from '@/lib/cookbook';

/** The application cookbook: its own quiet shell, no 3D backdrop or scroll effects. */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const parts = cookbookNav();
  return (
    <div className="min-h-screen bg-bg">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <a href="/" aria-label="Elixir Books Smart, home">
              <BrandMark />
            </a>
            <span aria-hidden className="hidden h-5 w-px bg-line sm:block" />
            <a href="/docs" className="hidden text-sm font-medium text-fg/80 hover:text-primary sm:block">
              Cookbook
            </a>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" className="text-sm text-fg/80 hover:text-primary">
              Back to site
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1400px] gap-6 px-4 pt-[96px] sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
        <DocsSidebar parts={parts} />
        <main className="min-w-0 pb-24">{children}</main>
      </div>
    </div>
  );
}
