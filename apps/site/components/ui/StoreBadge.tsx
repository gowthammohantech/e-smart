type Props = { store: 'apple' | 'google'; top: string; name: string; href: string };

function StoreGlyph({ store }: { store: Props['store'] }) {
  if (store === 'apple') {
    return (
      <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
        <path d="M16.37 12.62c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.38-.91-2.4-3.62ZM14.1 5.86c.63-.77 1.06-1.83.94-2.9-.91.04-2.02.61-2.67 1.37-.58.68-1.1 1.77-.96 2.81 1.02.08 2.06-.52 2.69-1.28Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <path fill="#34C88A" d="M3.6 2.3 13.4 12l-9.8 9.7c-.4-.2-.6-.7-.6-1.2V3.5c0-.5.2-1 .6-1.2Z" />
      <path fill="#F0B429" d="m16.8 15.4-3.4-3.4 3.4-3.4 3.9 2.2c1.1.6 1.1 1.8 0 2.4l-3.9 2.2Z" />
      <path fill="#FF6B6B" d="M16.8 15.4 13.4 12l-9.8 9.7c.4.2.9.2 1.5-.1l11.7-6.2Z" />
      <path fill="#4DA3FF" d="M16.8 8.6 5.1 2.4c-.6-.3-1.1-.3-1.5-.1l9.8 9.7 3.4-3.4Z" />
    </svg>
  );
}

export function StoreBadge({ store, top, name, href }: Props) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-3 rounded-full border border-line bg-surface/60 py-2 pr-5 pl-4 text-fg transition-colors hover:border-line-strong"
    >
      <StoreGlyph store={store} />
      <span className="flex flex-col leading-tight">
        <span className="text-[10px] text-muted">{top}</span>
        <span className="text-sm font-semibold">{name}</span>
      </span>
    </a>
  );
}
