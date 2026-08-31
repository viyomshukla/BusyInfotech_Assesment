import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, CalendarDays, ListChecks, CalendarPlus, Bell, Users, LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../hooks/useAlerts';
import { Spinner } from './ui';

const LINKS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/day', label: 'Day sheet', icon: CalendarDays },
  { to: '/appointments', label: 'Appointments', icon: ListChecks },
  { to: '/alerts', label: 'Alerts', icon: Bell, alerts: true },
  { to: '/availability', label: 'Availability', icon: CalendarPlus, frontDeskOnly: true },
  { to: '/staff', label: 'Staff', icon: Users, frontDeskOnly: true },
];

export function Layout() {
  const { user, isFrontDesk, logout } = useAuth();
  const { data, isLoading: alertsLoading } = useAlerts();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const count = data?.count ?? 0;
  const links = LINKS.filter((l) => !l.frontDeskOnly || isFrontDesk);

  async function signOut() {
    await logout();
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-paper">
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-rule
                   bg-surface lg:flex"
      >
        <Brand />

        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {links.map((link) => (
            <NavItem key={link.to} {...link} count={count} pending={alertsLoading} />
          ))}
        </nav>

        <div className="border-t border-rule-soft p-3">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <Avatar name={user.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">{user.name}</p>
              <p className="text-xs text-faint">{isFrontDesk ? 'Front desk' : 'Provider'}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm
                       text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <LogOut size={15} strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-rule bg-surface/90 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <Brand compact />
            <div className="flex items-center gap-2">
              <Avatar name={user.name} />
              <button
                onClick={signOut}
                className="rounded-md p-2 text-muted transition-colors hover:bg-paper hover:text-ink"
                aria-label="Sign out"
              >
                <LogOut size={15} strokeWidth={1.75} />
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {links.map((link) => (
              <NavItem key={link.to} {...link} count={count} pending={alertsLoading} compact />
            ))}
          </nav>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <div key={location.pathname} className="animate-rise">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function Brand({ compact = false }) {
  return (
    <NavLink
      to="/"
      className={`flex items-center gap-2.5 ${compact ? '' : 'border-b border-rule-soft px-5 py-4'}`}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent
                   text-sm font-semibold text-white shadow-card"
        aria-hidden
      >
        R
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold leading-tight tracking-tight">
          Riverside Clinic
        </span>
        <span className="tabular block text-[10px] uppercase tracking-[0.16em] text-faint">
          Scheduling
        </span>
      </span>
    </NavLink>
  );
}

function Avatar({ name }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft
                 text-xs font-semibold text-accent"
    >
      {initials}
    </span>
  );
}

function NavItem({
  to, label, icon: Icon, end = false, alerts = false, count = 0, pending = false, compact = false,
}) {
  const badge = alerts ? count : 0;

  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group relative flex items-center gap-2.5 rounded-md text-sm transition-colors ${
          compact ? 'shrink-0 px-2.5 py-1.5' : 'px-3 py-2'
        } ${
          isActive
            ? 'bg-accent-soft font-medium text-accent'
            : 'text-muted hover:bg-paper hover:text-ink'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !compact && (
            <span
              aria-hidden
              className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent"
            />
          )}
          <Icon size={16} strokeWidth={1.75} className="shrink-0" />
          <span className="whitespace-nowrap">{label}</span>
          {alerts && pending && <Spinner size={12} className="ml-auto text-faint" />}
          {badge > 0 && !pending && (
            <span
              aria-label={`${badge} unconfirmed`}
              className="tabular ml-auto inline-flex min-w-5 items-center justify-center
                         rounded-full bg-status-noshow px-1.5 py-0.5 text-[10px] font-semibold
                         leading-none text-white"
            >
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}
