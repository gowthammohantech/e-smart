import { Pill } from './Pill';

/**
 * The web app's desktop layout (sidebar + invoice list), standing in for the
 * demo photo. Drawn at 1120×630 and scaled by its container.
 */
const rows = [
  { no: 'INV/0148', party: 'Sri Murugan Textiles', amt: '46,928', status: ['E-invoiced', 'good'] },
  { no: 'INV/0147', party: 'Kaveri Agencies', amt: '28,400', status: ['Overdue 74d', 'bad'] },
  { no: 'INV/0146', party: 'Deccan Polymers', amt: '1,12,060', status: ['Paid', 'primary'] },
  { no: 'INV/0145', party: 'Annapoorna Stores', amt: '8,940', status: ['Draft', 'warn'] },
  { no: 'INV/0144', party: 'Velan Hardware', amt: '19,320', status: ['E-invoiced', 'good'] },
  { no: 'INV/0143', party: 'Sai Krupa Exports', amt: '2,48,100', status: ['Paid', 'primary'] },
] as const;

const menu = ['Home', 'Sales', 'Purchases', 'Contacts', 'Items', 'Inventory', 'Money', 'Expenses', 'GST', 'Reports', 'Settings'];

export function DesktopScreen() {
  return (
    <div className="flex bg-bg font-sans text-fg" style={{ width: 1120, height: 630 }}>
      <aside className="flex w-52 flex-col gap-1 border-r border-line bg-surface px-3 py-5 text-[13px]">
        <div className="mb-4 flex items-center gap-2 px-2">
          <img src="/brand/elixir-mark-dark.png" alt="" className="h-6 w-auto" />
          <span className="font-display font-medium">Sri Ranga Traders</span>
        </div>
        {menu.map((m) => (
          <div key={m} className={`rounded-lg px-3 py-1.5 ${m === 'Sales' ? 'bg-primary-tint text-primary' : 'text-muted'}`}>
            {m}
          </div>
        ))}
      </aside>
      <main className="flex-1 p-7">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[12px] text-muted">Sales</div>
            <div className="font-display text-[24px] font-medium">Tax invoices</div>
          </div>
          <div className="flex gap-2 text-[12px]">
            <span className="rounded-lg border border-line px-3 py-2">Export CSV</span>
            <span className="rounded-lg bg-primary px-3 py-2 text-white">New invoice</span>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-4 gap-3">
          {[
            ['This month', '₹8,42,300'],
            ['Collected', '₹6,10,450'],
            ['Overdue', '₹62,300'],
            ['GST payable', '₹74,180'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-surface p-4">
              <div className="text-[11px] text-muted">{k}</div>
              <div className="mt-1 text-[18px] font-semibold tabular-nums">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 overflow-hidden rounded-xl border border-line">
          <div className="grid grid-cols-[1fr_2fr_1fr_1fr] bg-surface px-4 py-2.5 text-[11px] text-muted">
            <span>Number</span>
            <span>Customer</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Status</span>
          </div>
          {rows.map((r) => (
            <div key={r.no} className="grid grid-cols-[1fr_2fr_1fr_1fr] items-center border-t border-line px-4 py-3 text-[13px]">
              <span className="text-muted">{r.no}</span>
              <span>{r.party}</span>
              <span className="text-right tabular-nums">₹{r.amt}</span>
              <span className="text-right">
                <Pill tone={r.status[1]}>{r.status[0]}</Pill>
              </span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
