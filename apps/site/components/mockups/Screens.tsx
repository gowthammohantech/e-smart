import { Pill } from './Pill';

/**
 * App screens drawn in HTML, standing in for screenshots. Each one is a
 * 280×594 canvas (the phone's screen) and reads the site's palette, so the
 * mockups recolour with the palette switch. The figures are illustrative.
 */

export const SCREEN_W = 280;
export const SCREEN_H = 594;

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-5 pt-3 pb-2 text-[10px] font-semibold text-fg">
      <span>9:41</span>
      <span className="h-4 w-16 rounded-full bg-black" />
      <span className="flex items-center gap-1">
        <span className="h-2 w-3 rounded-[2px] bg-fg/80" />
        <span className="h-2 w-4 rounded-[2px] border border-fg/80" />
      </span>
    </div>
  );
}

function Screen({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex flex-col overflow-hidden bg-bg font-sans text-fg ${className}`}
      style={{ width: SCREEN_W, height: SCREEN_H }}
    >
      <StatusBar />
      {children}
    </div>
  );
}

function TopBar({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between px-4 pt-1 pb-3">
      <div>
        {sub ? <div className="text-[10px] text-muted">{sub}</div> : null}
        <div className="font-display text-[17px] font-medium">{title}</div>
      </div>
      <span className="grid size-7 place-items-center rounded-full bg-primary text-[11px] font-semibold text-white">SR</span>
    </div>
  );
}

/** A deterministic QR-like grid: decorative, not scannable. */
export function FakeQr({ size = 72, seed = 7 }: { size?: number; seed?: number }) {
  const n = 21;
  const cells: [number, number][] = [];
  let s = seed;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      s = (s * 9301 + 49297) % 233280;
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      if (!finder && s / 233280 > 0.52) cells.push([x, y]);
    }
  }
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={7} height={7} fill="#000" />
      <rect x={x + 1} y={y + 1} width={5} height={5} fill="#fff" />
      <rect x={x + 2} y={y + 2} width={3} height={3} fill="#000" />
    </g>
  );
  return (
    <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`} width={size} height={size} className="rounded-[4px] bg-white" aria-hidden>
      {cells.map(([x, y]) => (
        <rect key={`${x}.${y}`} x={x} y={y} width={1} height={1} fill="#000" />
      ))}
      {finder(0, 0)}
      {finder(14, 0)}
      {finder(0, 14)}
    </svg>
  );
}

export function InvoiceScreen() {
  const lines = [
    { item: 'Cotton yarn 40s', hsn: '5205', qty: '120 kg', amt: '28,800.00' },
    { item: 'Polyester blend', hsn: '5509', qty: '45 kg', amt: '11,250.00' },
    { item: 'Freight charges', hsn: '9965', qty: '1', amt: '1,850.00' },
  ];
  return (
    <Screen>
      <TopBar title="INV/25-26/0148" sub="Tax invoice" />
      <div className="mx-4 rounded-xl border border-line bg-surface p-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] text-muted">Billed to</div>
            <div className="text-[12px] font-medium">Sri Murugan Textiles</div>
            <div className="text-[9px] text-dim">33AAKCS4821M1Z5 · Tamil Nadu</div>
          </div>
          <Pill tone="good">E-invoiced</Pill>
        </div>
      </div>
      <div className="mx-4 mt-3 space-y-2">
        {lines.map((l) => (
          <div key={l.item} className="flex items-center justify-between border-b border-line pb-2 text-[11px]">
            <div>
              <div className="font-medium">{l.item}</div>
              <div className="text-[9px] text-dim">
                HSN {l.hsn} · {l.qty}
              </div>
            </div>
            <div className="tabular-nums">₹{l.amt}</div>
          </div>
        ))}
      </div>
      <div className="mx-4 mt-3 space-y-1 text-[10px] text-muted">
        <div className="flex justify-between">
          <span>Taxable value</span>
          <span className="tabular-nums">₹41,900.00</span>
        </div>
        <div className="flex justify-between">
          <span>CGST 6%</span>
          <span className="tabular-nums">₹2,514.00</span>
        </div>
        <div className="flex justify-between">
          <span>SGST 6%</span>
          <span className="tabular-nums">₹2,514.00</span>
        </div>
        <div className="flex justify-between border-t border-line pt-1.5 text-[13px] font-semibold text-fg">
          <span>Total</span>
          <span className="tabular-nums">₹46,928.00</span>
        </div>
      </div>
      <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
        <FakeQr size={64} />
        <div className="min-w-0 text-[9px] leading-snug">
          <div className="text-[10px] font-semibold text-good">IRN generated</div>
          <div className="truncate text-dim">a5c91f07e2…4be8d2</div>
          <div className="text-muted">Ack 1325 0047 8821 · 14 Oct</div>
          <div className="text-muted">Cancel window: 22h 41m</div>
        </div>
      </div>
      <div className="mx-4 mt-auto mb-5 grid grid-cols-2 gap-2 text-[11px] font-medium">
        <span className="rounded-lg border border-line py-2 text-center">Share PDF</span>
        <span className="rounded-lg bg-primary py-2 text-center text-white">E-way bill</span>
      </div>
    </Screen>
  );
}

export function DashboardScreen() {
  const tiles = [
    { label: 'Sales', value: '₹8.42L', delta: '+12%' },
    { label: 'Collected', value: '₹6.10L', delta: '+8%' },
    { label: 'Expenses', value: '₹1.36L', delta: '-3%' },
    { label: 'Net', value: '₹4.74L', delta: '+15%' },
    { label: 'E-invoices', value: '182', delta: '' },
    { label: 'E-way bills', value: '64', delta: '' },
  ];
  const bars = [46, 58, 52, 70, 64, 88];
  return (
    <Screen>
      <TopBar title="Good morning" sub="Sri Ranga Traders" />
      <div className="mx-4 grid grid-cols-3 gap-1.5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-line bg-surface p-2">
            <div className="text-[8px] text-muted">{t.label}</div>
            <div className="text-[12px] font-semibold tabular-nums">{t.value}</div>
            {t.delta ? <div className="text-[8px] text-good">{t.delta}</div> : null}
          </div>
        ))}
      </div>
      <div className="mx-4 mt-3 rounded-xl border border-line bg-surface p-3">
        <div className="flex justify-between text-[10px]">
          <span className="font-medium">Sales · 6 months</span>
          <span className="text-muted">May–Oct</span>
        </div>
        <div className="mt-3 flex h-24 items-end gap-2">
          {bars.map((h, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div
                className="w-full rounded-t-[4px]"
                style={{
                  height: `${h}%`,
                  background:
                    i === bars.length - 1
                      ? 'var(--primary)'
                      : 'linear-gradient(180deg, color-mix(in srgb, var(--primary) 55%, transparent), transparent)',
                }}
              />
              <span className="text-[8px] text-dim">{['M', 'J', 'J', 'A', 'S', 'O'][i]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-4 mt-3 grid grid-cols-2 gap-1.5">
        <div className="rounded-lg border border-line bg-surface p-2.5">
          <div className="text-[9px] text-muted">Owed to you</div>
          <div className="text-[13px] font-semibold text-good">₹3,28,400</div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-2.5">
          <div className="text-[9px] text-muted">You owe</div>
          <div className="text-[13px] font-semibold text-warn">₹1,12,900</div>
        </div>
      </div>
      <div className="mx-4 mt-3 text-[10px] font-medium">Needs attention</div>
      <div className="mx-4 mt-1.5 space-y-1.5">
        {[
          { t: '4 invoices overdue', p: 'bad' as const, l: '₹62,300' },
          { t: 'E-way bill expires in 6h', p: 'warn' as const, l: 'EWB 4512' },
          { t: '3 items low on stock', p: 'primary' as const, l: 'Reorder' },
        ].map((r) => (
          <div key={r.t} className="flex items-center justify-between rounded-lg border border-line bg-surface px-2.5 py-2 text-[10px]">
            <span>{r.t}</span>
            <Pill tone={r.p}>{r.l}</Pill>
          </div>
        ))}
      </div>
    </Screen>
  );
}

export function AgingScreen() {
  const buckets = [
    { label: 'Current', pct: 46, amt: '₹1,51,200' },
    { label: '1–30 days', pct: 24, amt: '₹78,900' },
    { label: '31–60 days', pct: 15, amt: '₹49,300' },
    { label: '61–90 days', pct: 9, amt: '₹29,600' },
    { label: '90+ days', pct: 6, amt: '₹19,400' },
  ];
  return (
    <Screen>
      <TopBar title="Receivables" sub="Aging · all branches" />
      <div className="mx-4 rounded-xl border border-line bg-surface p-3">
        <div className="text-[10px] text-muted">Total outstanding</div>
        <div className="font-display text-[24px] font-medium tabular-nums">₹3,28,400</div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full">
          {buckets.map((b, i) => (
            <span
              key={b.label}
              style={{ width: `${b.pct}%`, background: 'var(--primary)', opacity: 1 - i * 0.18 }}
            />
          ))}
        </div>
      </div>
      <div className="mx-4 mt-3 space-y-1.5">
        {buckets.map((b, i) => (
          <div key={b.label} className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-[11px]">
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-primary" style={{ opacity: 1 - i * 0.18 }} />
              {b.label}
            </span>
            <span className="tabular-nums">{b.amt}</span>
          </div>
        ))}
      </div>
      <div className="mx-4 mt-3 rounded-xl border border-line bg-surface p-3 text-[10px]">
        <div className="font-medium">Remind 6 customers</div>
        <div className="mt-1 text-muted">WhatsApp · with payment link</div>
        <div className="mt-2 rounded-lg bg-primary py-2 text-center text-[11px] font-medium text-white">Send reminders</div>
      </div>
    </Screen>
  );
}

export function EwayBillScreen() {
  return (
    <Screen>
      <TopBar title="EWB 4512 8837 2201" sub="E-way bill" />
      <div className="mx-4 rounded-xl border border-line bg-surface p-3">
        <div className="flex justify-between text-[10px] text-muted">
          <span>Valid until</span>
          <Pill tone="warn">1d 18h left</Pill>
        </div>
        <div className="mt-1 text-[13px] font-semibold">16 Oct, 11:59 pm</div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
          <span className="block h-full w-[62%] rounded-full bg-warn" />
        </div>
        <div className="mt-1 text-[9px] text-dim">412 km · Coimbatore → Bengaluru</div>
      </div>
      <div className="mx-4 mt-3 rounded-xl border border-line bg-surface p-3 text-[10px]">
        <div className="font-medium">Part-B · vehicle</div>
        {[
          ['TN 38 BX 4471', '14 Oct · 6:10 pm'],
          ['KA 01 AM 9023', '15 Oct · 9:45 am'],
        ].map(([v, t]) => (
          <div key={v} className="mt-2 flex justify-between border-t border-line pt-2">
            <span className="font-medium">{v}</span>
            <span className="text-muted">{t}</span>
          </div>
        ))}
      </div>
      <div className="mx-4 mt-3 grid grid-cols-2 gap-2 text-[11px] font-medium">
        <span className="rounded-lg border border-line py-2 text-center">Update Part-B</span>
        <span className="rounded-lg bg-primary py-2 text-center text-white">Extend</span>
      </div>
    </Screen>
  );
}

export function LixiChatScreen() {
  return (
    <Screen>
      <div className="flex items-center gap-2 px-4 pt-1 pb-3">
        <img src="/brand/lixi-orb.png" alt="" className="size-7" />
        <div>
          <div className="text-[13px] font-medium">Lixi</div>
          <div className="text-[9px] text-muted">Your books assistant</div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-4 text-[11px]">
        <div className="self-end rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-white">Who owes me for more than 60 days?</div>
        <div className="max-w-[88%] rounded-2xl rounded-bl-sm border border-line bg-surface px-3 py-2">
          Three customers, <b>₹49,000</b> in all. Kaveri Agencies is the largest at ₹28,400 (74 days).
        </div>
        <div className="max-w-[88%] rounded-2xl rounded-bl-sm border border-line bg-surface p-3">
          <div className="text-[9px] text-muted">Draft · not sent</div>
          <div className="mt-1 font-medium">WhatsApp reminder to 3 customers</div>
          <div className="mt-2 flex gap-2 text-[10px]">
            <span className="rounded-md bg-primary px-2 py-1 text-white">Review & send</span>
            <span className="rounded-md border border-line px-2 py-1">Edit</span>
          </div>
        </div>
      </div>
      <div className="mx-4 mb-5 rounded-full border border-line bg-surface px-4 py-2.5 text-[11px] text-dim">Ask about your books…</div>
    </Screen>
  );
}

const SCREENS = {
  invoice: InvoiceScreen,
  dashboard: DashboardScreen,
  aging: AgingScreen,
  eway: EwayBillScreen,
  lixi: LixiChatScreen,
};

export type ScreenName = keyof typeof SCREENS;

/** A phone bezel around one screen, scaled to `width` px. */
export function PhoneFrame({ screen, width = 240, className = '' }: { screen: ScreenName; width?: number; className?: string }) {
  const Body = SCREENS[screen];
  const pad = 8;
  const scale = (width - pad * 2) / SCREEN_W;
  return (
    <div
      className={`relative rounded-[38px] border border-white/10 bg-[#101216] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] ${className}`}
      style={{ width, height: SCREEN_H * scale + pad * 2, padding: pad }}
    >
      <div className="overflow-hidden rounded-[30px]" style={{ width: SCREEN_W * scale, height: SCREEN_H * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          <Body />
        </div>
      </div>
    </div>
  );
}
