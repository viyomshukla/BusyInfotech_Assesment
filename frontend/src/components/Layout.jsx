import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, CalendarDays, ListChecks, CalendarPlus, Bell, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../hooks/useAlerts';

const LINKS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/day', label: 'Day sheet', icon: CalendarDays },
  { to: '/appointments', label: 'Appointments', icon: ListChecks },
  { to: '/availability', label: 'Availability', icon: CalendarPlus, frontDeskOnly: true },
];

export function Layout() {
  const { user, isFrontDesk, logout } = useAuth();
  const { data: alerts } = useAlerts();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const count = alerts?.count ?? 0;
  const links = LINKS.filter((l) => !l.frontDeskOnly || isFrontDesk);

  async function signOut() {
    await logout();
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <NavLink to="/" className="shrink-0">
            <span className="tabular text-xs uppercase tracking-[0.18em] text-muted">
              Riverside Clinic
            </span>
          </NavLink>

          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {links.map((link) => (
              <TabLink key={link.to} {...link} />
            ))}
            <TabLink to="/alerts" label="Alerts" icon={Bell} badge={count} />
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium leading-tight">{user.name}</p>
              <p className="text-xs text-muted">
                {isFrontDesk ? 'Front desk' : 'Provider'}
              </p>
            </div>
            <button
              onClick={signOut}
              className="inline-flex items-center gap-1.5 rounded border border-rule px-2.5 py-1.5
                         text-xs font-medium text-muted transition-colors
                         hover:border-accent hover:text-accent"
            >
              <LogOut size={14} strokeWidth={1.75} />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="px-6 py-7">
        <Outlet />
      </main>
    </div>
  );
}

function TabLink({ to, label, icon: Icon, end = false, badge = 0 }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm transition-colors ${
          isActive ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:text-accent'
        }`
      }
    >
      <Icon size={15} strokeWidth={1.75} />
      {label}
      {badge > 0 && (
        <span
          aria-label={`${badge} unconfirmed`}
          className="tabular ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full
                     bg-status-noshow px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
        >
          {badge}
        </span>
      )}
    </NavLink>
  );
}
