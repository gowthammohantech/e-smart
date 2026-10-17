import { NavLink, Outlet } from 'react-router';
import { useAuth, useOperator } from '../auth/AuthProvider';
import { RoleBadge } from './Badges';

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const NAV = [
  { to: '/', label: 'Overview', icon: icon('M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z'), end: true },
  { to: '/accounts', label: 'Accounts', icon: icon('M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h6') },
  { to: '/users', label: 'Users', icon: icon('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8') },
  { to: '/audit', label: 'Audit log', icon: icon('M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5') },
];

export function AppShell() {
  const operator = useOperator();
  const { signOut } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/favicon.png" alt="" />
          <div>
            Elixir Books
            <small>Platform admin</small>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="operator">
            <span>{operator.name}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {operator.email}
            </span>
            <div>
              <RoleBadge role={operator.platformRole} />
            </div>
          </div>
          <button className="btn small" type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
