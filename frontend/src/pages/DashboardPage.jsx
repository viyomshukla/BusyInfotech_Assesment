import { useQuery } from '@tanstack/react-query';
import {
  Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { format } from 'date-fns';
import {
  CalendarCheck, UserCheck, UserX, CalendarClock, Minus, TrendingDown, TrendingUp,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/Layout';
import { Panel, PageHeader, Loading, ErrorNote, EmptyState, Stat } from '../components/ui';
import { STATUS_LABEL, STATUS_COLOR } from '../lib/format';

export default function DashboardPage() {
  const { user, isFrontDesk } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl">
        <Panel>
          <Loading hint="Building today's figures from the appointment record." />
        </Panel>
      </div>
    );
  }
  if (error) return <ErrorNote>{error.message}</ErrorNote>;

  const { headline, byProvider, byStatus, noShowTrend } = data;

  const totalOnRecord = byStatus.reduce((sum, row) => sum + row.count, 0);
  const latest = noShowTrend.at(-1);
  const previous = noShowTrend.at(-2);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow={format(new Date(), 'EEEE d MMMM')}
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
          sub={`${byProvider.length} ${byProvider.length === 1 ? 'provider' : 'providers'} on the sheet`}
          icon={CalendarCheck}
          accent="var(--color-accent)"
        />
        <Stat
          label="Checked in now"
          value={headline.checkedInNow}
          sub="Waiting or with a provider"
          icon={UserCheck}
          accent="var(--color-status-checkedin)"
        />
        <Stat
          label="No-shows this week"
          value={headline.noShowsThisWeek}
          sub={latest ? `${latest.rate}% of this week's attended-or-missed` : 'No history yet'}
          icon={UserX}
          accent="var(--color-status-noshow)"
        />
        <Stat
          label="Confirmed upcoming"
          value={headline.upcomingConfirmed}
          sub="Future appointments already confirmed"
          icon={CalendarClock}
          accent="var(--color-status-confirmed)"
        />
      </div>

      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <Panel
          title="Workload by provider"
          action={<span className="tabular text-xs text-faint">{totalOnRecord} on record</span>}
          className="flex flex-col"
        >
          {byProvider.length === 0 ? (
            <EmptyState title="Nothing to show" hint="No appointments have been created yet." />
          ) : (
            <ul className="divide-y divide-rule-soft">
              {byProvider.map((row) => (
                <ProviderRow
                  key={row.provider}
                  provider={row.provider}
                  count={row.count}
                  max={byProvider[0].count}
                  share={totalOnRecord ? Math.round((row.count / totalOnRecord) * 100) : 0}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Appointments by status" className="flex flex-col">
          {byStatus.length === 0 ? (
            <EmptyState title="Nothing to show" />
          ) : (
            // Laid out horizontally: seven status names across an axis need
            // rotating to fit, and a label you have to tilt your head to read is
            // a label nobody reads.
            <div className="flex-1 p-5">
              <ResponsiveContainer width="100%" height={Math.max(220, byStatus.length * 34)}>
                <BarChart
                  layout="vertical"
                  data={byStatus.map((r) => ({
                    name: STATUS_LABEL[r.status] ?? r.status,
                    count: r.count,
                    fill: STATUS_COLOR[r.status],
                  }))}
                  margin={{ top: 0, right: 28, left: 0, bottom: 0 }}
                  barCategoryGap={8}
                >
                  <CartesianGrid horizontal={false} stroke="var(--color-rule-soft)" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={86}
                    tick={{ fontSize: 12, fill: 'var(--color-ink)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip cursor={{ fill: 'var(--color-accent-soft)' }} contentStyle={tooltipStyle} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {byStatus.map((row) => (
                      <Cell key={row.status} fill={STATUS_COLOR[row.status]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="No-show rate, last eight weeks"
        action={<TrendDelta latest={latest} previous={previous} />}
      >
        {noShowTrend.length === 0 ? (
          <EmptyState
            title="Not enough history yet"
            hint="The chart fills in as appointments move past their scheduled time."
          />
        ) : (
          <div className="p-5">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart
                data={noShowTrend.map((r) => ({
                  week: format(new Date(r.weekStarting), 'd MMM'),
                  rate: r.rate,
                  noShows: r.noShows,
                  total: r.total,
                }))}
                margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="noShowFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-status-noshow)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--color-status-noshow)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-rule-soft)" />
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
                <Area
                  type="monotone"
                  dataKey="rate"
                  stroke="var(--color-status-noshow)"
                  strokeWidth={2}
                  fill="url(#noShowFill)"
                  dot={{ r: 3, fill: 'var(--color-status-noshow)', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
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
  boxShadow: '0 4px 12px rgb(17 24 39 / 0.10)',
};

// Week-on-week movement in the no-show rate. Fewer missed appointments is the
// good direction, so the arrow that points down is the green one.
function TrendDelta({ latest, previous }) {
  if (!latest || !previous) return null;

  const delta = Number((latest.rate - previous.rate).toFixed(1));
  const flat = Math.abs(delta) < 0.05;
  const Icon = flat ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const color = flat
    ? 'var(--color-muted)'
    : delta > 0
      ? 'var(--color-status-noshow)'
      : 'var(--color-status-checkedin)';

  return (
    <span className="flex items-center gap-2 text-xs text-muted">
      <span className="tabular text-sm font-semibold text-ink">{latest.rate}%</span>
      <span className="inline-flex items-center gap-1 font-medium" style={{ color }}>
        <Icon size={13} strokeWidth={2.25} />
        {flat ? 'level' : `${Math.abs(delta)} pts`}
      </span>
      <span className="hidden sm:inline">on last week</span>
    </span>
  );
}

function ProviderRow({ provider, count, max, share }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <Avatar name={provider} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-4">
          <span className="truncate text-sm">{provider}</span>
          <span className="tabular shrink-0 text-sm font-medium">
            {count}
            <span className="ml-1.5 text-xs font-normal text-faint">{share}%</span>
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-rule-soft">
          <div
            className="h-1.5 rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${max ? (count / max) * 100 : 0}%` }}
          />
        </div>
      </div>
    </li>
  );
}
