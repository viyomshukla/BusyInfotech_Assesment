import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { CalendarCheck, UserCheck, UserX, CalendarClock } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Panel, PageHeader, Loading, ErrorNote, EmptyState } from '../components/ui';
import { STATUS_LABEL, STATUS_COLOR } from '../lib/format';

export default function DashboardPage() {
  const { user, isFrontDesk } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl">
        <Panel>
          <Loading hint="Building today's figures from the appointment record." />
        </Panel>
      </div>
    );
  }
  if (error) return <ErrorNote>{error.message}</ErrorNote>;

  const { headline, byProvider, byStatus, noShowTrend } = data;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={isFrontDesk ? 'Clinic today' : `Your day, ${user.name}`}
        subtitle={
          isFrontDesk
            ? 'Across every provider.'
            : 'Appointments where you are the scheduling or a supporting provider.'
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Appointments today"
          value={headline.appointmentsToday}
          icon={CalendarCheck}
          accent="var(--color-accent)"
        />
        <Stat
          label="Checked in now"
          value={headline.checkedInNow}
          icon={UserCheck}
          accent="var(--color-status-checkedin)"
        />
        <Stat
          label="No-shows this week"
          value={headline.noShowsThisWeek}
          icon={UserX}
          accent="var(--color-status-noshow)"
        />
        <Stat
          label="Confirmed upcoming"
          value={headline.upcomingConfirmed}
          icon={CalendarClock}
          accent="var(--color-status-confirmed)"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="By provider">
          {byProvider.length === 0 ? (
            <EmptyState title="Nothing to show" hint="No appointments have been created yet." />
          ) : (
            <ul className="divide-y divide-rule">
              {byProvider.map((row) => (
                <ProviderRow
                  key={row.provider}
                  provider={row.provider}
                  count={row.count}
                  max={Math.max(...byProvider.map((r) => r.count))}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="By status">
          {byStatus.length === 0 ? (
            <EmptyState title="Nothing to show" />
          ) : (
            <div className="p-5">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={byStatus.map((r) => ({
                    name: STATUS_LABEL[r.status] ?? r.status,
                    count: r.count,
                    fill: STATUS_COLOR[r.status],
                  }))}
                  margin={{ top: 4, right: 4, left: -18, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="var(--color-rule)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
                    axisLine={{ stroke: 'var(--color-rule)' }}
                    tickLine={false}
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={62}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--color-accent-soft)' }}
                    contentStyle={tooltipStyle}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="No-show rate, last eight weeks"
        action={<span className="text-xs text-muted">Percent of attended-or-missed appointments</span>}
      >
        {noShowTrend.length === 0 ? (
          <EmptyState
            title="Not enough history yet"
            hint="The chart fills in as appointments move past their scheduled time."
          />
        ) : (
          <div className="p-5">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={noShowTrend.map((r) => ({
                  week: format(new Date(r.weekStarting), 'd MMM'),
                  rate: r.rate,
                  noShows: r.noShows,
                  total: r.total,
                }))}
                margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
              >
                <CartesianGrid vertical={false} stroke="var(--color-rule)" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
                  axisLine={{ stroke: 'var(--color-rule)' }}
                  tickLine={false}
                />
                <YAxis
                  unit="%"
                  tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, _name, item) => [
                    `${value}%  (${item.payload.noShows} of ${item.payload.total})`,
                    'No-show rate',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="var(--color-status-noshow)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'var(--color-status-noshow)' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid var(--color-rule)',
  fontSize: 12,
  fontFamily: 'Archivo, sans-serif',
  boxShadow: '0 4px 12px rgb(27 35 51 / 0.08)',
};

function Stat({ label, value, accent, icon: Icon }) {
  const live = value > 0;

  return (
    <div
      className="group rounded-xl border border-rule bg-surface px-5 py-4 shadow-card
                 transition-shadow hover:shadow-raise"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs leading-snug text-muted">{label}</p>
        {Icon && (
          <span
            className="tint flex size-7 shrink-0 items-center justify-center rounded-lg"
            style={{ '--tint-color': accent }}
          >
            <Icon size={14} strokeWidth={2} />
          </span>
        )}
      </div>
      <p
        className="tabular mt-3 text-[32px] font-semibold leading-none tracking-tight"
        style={live ? { color: accent } : { color: 'var(--color-faint)' }}
      >
        {value}
      </p>
    </div>
  );
}

function ProviderRow({ provider, count, max }) {
  return (
    <li className="px-5 py-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="truncate text-sm">{provider}</span>
        <span className="tabular shrink-0 text-sm font-medium">{count}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-rule-soft">
        <div
          className="h-1.5 rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${max ? (count / max) * 100 : 0}%` }}
        />
      </div>
    </li>
  );
}