import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, ChevronLeft, ChevronRight, Columns3, Download, List, Plus,
} from 'lucide-react';
import { addDays, isSameDay, parseISO } from 'date-fns';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useProviders } from '../hooks/useProviders';
import { Avatar } from '../components/Layout';
import { TimePicker } from '../components/TimePicker';
import {
  Button, Panel, PageHeader, Modal, Field, Input, Select, StatusBadge, SegmentedControl,
  EmptyState, Loading, ErrorNote,
} from '../components/ui';
import {
  time, fullDate, dayLabel, toInputDate, toIso, STATUS_LABEL, STATUS_COLOR,
} from '../lib/format';

// The grid opens on the working day and stretches only if the schedule spills
// past it — an empty 07:00 row every morning is just a stripe of wasted screen.
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 19;
const PX_PER_MIN = 1.6;
const SNAP_MIN = 15;

// A slot with a patient on it, at any point in the visit. Cancelled slots hand
// the time back, so they count against neither the booked nor the open figure.
const BOOKED = new Set(['REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED']);

export default function DayPage() {
  const [date, setDate] = useState(toInputDate());
  const [providerId, setProviderId] = useState('');
  // Side-by-side columns need width. A phone gets the agenda instead, which is
  // the same information without three columns squeezed into a thumb's width.
  const [view, setView] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
      ? 'timeline'
      : 'list'
  );
  const [creating, setCreating] = useState(null);
  const [error, setError] = useState(null);

  const { isFrontDesk, user } = useAuth();
  const { data: providers = [], error: providerError } = useProviders();
  const navigate = useNavigate();

  const { data = [], isLoading } = useQuery({
    queryKey: ['day', date, providerId],
    queryFn: () =>
      api
        .get('/appointments', {
          params: {
            from: date,
            to: date,
            limit: 100,
            sort: 'date',
            ...(providerId ? { providerId } : {}),
          },
        })
        .then((r) => r.data.items),
  });

  function shift(days) {
    setDate(toInputDate(addDays(parseISO(date), days)));
  }

  async function exportCsv() {
    setError(null);
    try {
      const res = await api.get('/appointments/export/day', {
        params: { date, ...(providerId ? { providerId } : {}) },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `schedule-${date}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('The export failed. Try again.');
    }
  }

  // One column per provider who either works here or appears on the day. A
  // provider is on the day sheet for their own slots and for the ones they
  // support, so the columns come from the appointments as well as the roster —
  // reading the roster alone would silently drop the care-team work.
  const columns = useMemo(() => {
    const byId = new Map();

    const add = (id, name) => {
      if (!id || byId.has(id)) return;
      byId.set(id, { id, name, appts: [] });
    };

    if (isFrontDesk) {
      for (const p of providers) {
        if (!providerId || p._id === providerId) add(p._id, p.name);
      }
    } else {
      add(user._id, user.name);
    }

    for (const appt of data) {
      add(appt.providerId, appt.providerName);
      byId.get(appt.providerId)?.appts.push(appt);
    }

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data, providers, providerId, isFrontDesk, user]);

  const totals = useMemo(() => summarise(data), [data]);
  const [startHour, endHour] = useMemo(() => hourRange(data), [data]);

  const viewingDate = parseISO(date);
  const isToday = isSameDay(viewingDate, new Date());

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        eyebrow={dayLabel(viewingDate)}
        title="Day sheet"
        subtitle={fullDate(viewingDate)}
      >
        <div className="flex items-center rounded-lg border border-rule bg-surface shadow-card">
          <button
            onClick={() => shift(-1)}
            aria-label="Previous day"
            className="rounded-l-lg px-2 py-2 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <ChevronLeft size={15} strokeWidth={2} />
          </button>
          <div className="w-36 border-x border-rule">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-0 rounded-none border-0 shadow-none focus:ring-0"
              aria-label="Date"
            />
          </div>
          <button
            onClick={() => shift(1)}
            aria-label="Next day"
            className="rounded-r-lg px-2 py-2 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <ChevronRight size={15} strokeWidth={2} />
          </button>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDate(toInputDate())}
          disabled={isToday}
        >
          Today
        </Button>

        {isFrontDesk && (
          <div className="w-44">
            <Select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="mt-0"
              aria-label="Filter by provider"
            >
              <option value="">All providers</option>
              {providers.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </Select>
          </div>
        )}

        <SegmentedControl
          ariaLabel="Day sheet view"
          value={view}
          onChange={setView}
          options={[
            { value: 'timeline', label: 'Timeline', icon: Columns3 },
            { value: 'list', label: 'List', icon: List },
          ]}
        />

        <Button variant="secondary" size="sm" onClick={exportCsv}>
          <Download size={14} strokeWidth={1.75} /> CSV
        </Button>
        <Button size="sm" onClick={() => setCreating({})}>
          <Plus size={14} strokeWidth={2} /> New slot
        </Button>
      </PageHeader>

      <ErrorNote>{error ?? providerError?.message}</ErrorNote>

      <DaySummary totals={totals} loading={isLoading} />

      <Panel>
        {isLoading ? (
          <Loading hint="Loading the schedule for this day." />
        ) : data.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Nothing scheduled"
            hint="No slots exist for this day. Create one, or generate a recurring pattern from Availability."
            action={
              <Button size="sm" onClick={() => setCreating({})}>
                <Plus size={14} strokeWidth={2} /> New slot
              </Button>
            }
          />
        ) : view === 'timeline' ? (
          <Timeline
            columns={columns}
            startHour={startHour}
            endHour={endHour}
            showNow={isToday}
            canCreate={(columnId) => isFrontDesk || columnId === user._id}
            onCreate={(slot) => setCreating(slot)}
            onOpen={(id) => navigate(`/appointments/${id}`)}
          />
        ) : (
          <AgendaList appointments={data} onOpen={(id) => navigate(`/appointments/${id}`)} />
        )}
      </Panel>

      {data.length > 0 && <Legend appointments={data} />}

      <NewSlotModal
        key={`${creating?.providerId ?? ''}-${creating?.startTime ?? ''}`}
        open={Boolean(creating)}
        onClose={() => setCreating(null)}
        date={date}
        initial={creating ?? {}}
        providers={isFrontDesk ? providers : providers.filter((p) => p._id === user._id)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary

function summarise(appointments) {
  const counts = { total: appointments.length, booked: 0, open: 0, requested: 0, cancelled: 0 };

  for (const appt of appointments) {
    if (BOOKED.has(appt.status)) counts.booked += 1;
    if (appt.status === 'OPEN') counts.open += 1;
    if (appt.status === 'REQUESTED') counts.requested += 1;
    if (appt.status === 'CANCELLED') counts.cancelled += 1;
  }

  const bookable = counts.total - counts.cancelled;
  counts.utilisation = bookable ? Math.round((counts.booked / bookable) * 100) : 0;
  return counts;
}

function DaySummary({ totals, loading }) {
  const cells = [
    { label: 'Slots', value: totals.total, color: 'var(--color-ink)' },
    { label: 'Booked', value: totals.booked, color: 'var(--color-status-confirmed)' },
    { label: 'Open', value: totals.open, color: 'var(--color-status-open)' },
    { label: 'Unconfirmed', value: totals.requested, color: 'var(--color-status-requested)' },
  ];

  return (
    <div className="grid grid-cols-2 divide-rule overflow-hidden rounded-xl border border-rule bg-surface shadow-card sm:grid-cols-3 sm:divide-x lg:grid-cols-5">
      {cells.map((cell) => (
        <div key={cell.label} className="border-b border-rule px-5 py-3.5 sm:border-b-0 lg:border-b-0">
          <p className="text-xs text-muted">{cell.label}</p>
          <p
            className="tabular mt-1.5 text-[22px] font-semibold leading-none"
            style={{ color: cell.value > 0 ? cell.color : 'var(--color-faint)' }}
          >
            {loading ? '—' : cell.value}
          </p>
        </div>
      ))}

      <div className="col-span-2 border-t border-rule px-5 py-3.5 sm:col-span-3 sm:border-l lg:col-span-1 lg:border-t-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs text-muted">Utilisation</p>
          <p className="tabular text-sm font-semibold">{loading ? '—' : `${totals.utilisation}%`}</p>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-rule-soft">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${loading ? 0 : totals.utilisation}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-faint">
          {loading ? ' ' : `${totals.booked} of ${totals.total - totals.cancelled} slots taken`}
        </p>
      </div>
    </div>
  );
}

function Legend({ appointments }) {
  const present = [...new Set(appointments.map((a) => a.status))];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-muted">
      {present.map((status) => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: STATUS_COLOR[status] }}
          />
          {STATUS_LABEL[status] ?? status}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline

// Widen the window only for slots that fall outside the working day, so an
// early first appointment or a late finish is never cropped off the grid.
function hourRange(appointments) {
  let start = DEFAULT_START_HOUR;
  let end = DEFAULT_END_HOUR;

  for (const appt of appointments) {
    const from = new Date(appt.startsAt);
    const to = new Date(appt.endsAt ?? appt.startsAt);
    start = Math.min(start, from.getHours());
    end = Math.max(end, to.getMinutes() > 0 ? to.getHours() : to.getHours() - 1);
  }

  return [Math.max(0, start), Math.min(23, Math.max(end, start))];
}

// Appointments that overlap in time share the column width instead of hiding
// behind each other. Slots are sorted, gathered into clusters that touch, and
// each cluster is dealt into the fewest lanes that keep them apart.
function packLanes(appointments) {
  const sorted = [...appointments].sort(
    (a, b) => new Date(a.startsAt) - new Date(b.startsAt)
  );

  const placed = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const lanes = [];
    for (const appt of cluster) {
      const start = new Date(appt.startsAt).getTime();
      let lane = lanes.findIndex((end) => end <= start);
      if (lane === -1) lane = lanes.push(0) - 1;
      lanes[lane] = new Date(appt.endsAt ?? appt.startsAt).getTime();
      placed.push({ appt, lane });
    }
    // Every slot in a cluster is drawn against the same divisor, so a pair that
    // overlaps does not end up half a column wider than its neighbour.
    for (const entry of placed.slice(placed.length - cluster.length)) {
      entry.lanes = lanes.length;
    }
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const appt of sorted) {
    const start = new Date(appt.startsAt).getTime();
    const end = new Date(appt.endsAt ?? appt.startsAt).getTime();
    if (cluster.length && start >= clusterEnd) flush();
    cluster.push(appt);
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length) flush();

  return placed;
}

function Timeline({ columns, startHour, endHour, showNow, canCreate, onCreate, onOpen }) {
  const [now, setNow] = useState(() => new Date());

  // The line marking the present has to move on its own, or it quietly becomes
  // a lie about where the clinic is in its day.
  useEffect(() => {
    if (!showNow) return;
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [showNow]);

  const rowHeight = 60 * PX_PER_MIN;
  const hours = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);
  const gridHeight = hours.length * rowHeight;

  const nowOffset = (now.getHours() - startHour) * 60 + now.getMinutes();
  const nowVisible = showNow && nowOffset >= 0 && nowOffset <= hours.length * 60;

  return (
    <div className="max-h-[72vh] overflow-auto">
      <div className="flex min-w-full">
        {/* Time gutter. Sticky sideways so the hours stay readable when a wide
            roster pushes the later columns off-screen. */}
        <div className="sticky left-0 z-20 w-16 shrink-0 bg-surface">
          <div className="sticky top-0 z-10 h-14 border-b border-r border-rule bg-surface" />
          <div className="relative border-r border-rule" style={{ height: gridHeight }}>
            {hours.map((h, i) => (
              <span
                key={h}
                className="tabular absolute right-2 text-[11px] text-faint"
                style={{ top: i * rowHeight + 4 }}
              >
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
            {nowVisible && (
              <span
                className="tabular absolute right-1 -translate-y-1/2 rounded px-1 py-0.5 text-[10px]
                           font-semibold text-white"
                style={{ top: nowOffset * PX_PER_MIN, background: 'var(--color-status-noshow)' }}
              >
                {time(now)}
              </span>
            )}
          </div>
        </div>

        {columns.map((column) => (
          <TimelineColumn
            key={column.id}
            column={column}
            startHour={startHour}
            rowHeight={rowHeight}
            gridHeight={gridHeight}
            nowOffset={nowVisible ? nowOffset : null}
            canCreate={canCreate(column.id)}
            onCreate={onCreate}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}

function TimelineColumn({
  column, startHour, rowHeight, gridHeight, nowOffset, canCreate, onCreate, onOpen,
}) {
  const placed = useMemo(() => packLanes(column.appts), [column.appts]);
  const booked = column.appts.filter((a) => BOOKED.has(a.status)).length;
  const bookable = column.appts.filter((a) => a.status !== 'CANCELLED').length;

  // Clicking a gap opens the new-slot form on that provider at that time,
  // rounded to the nearest quarter hour — the way anyone reads a paper sheet.
  function handleGapClick(e) {
    if (!canCreate) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    const minutes = (e.clientY - bounds.top) / PX_PER_MIN;
    const snapped = Math.round(minutes / SNAP_MIN) * SNAP_MIN;
    const total = startHour * 60 + snapped;
    const hh = String(Math.floor(total / 60)).padStart(2, '0');
    const mm = String(total % 60).padStart(2, '0');
    onCreate({ providerId: column.id, startTime: `${hh}:${mm}:00` });
  }

  return (
    <div className="flex min-w-60 flex-1 flex-col border-l border-rule">
      <header className="sticky top-0 z-10 h-14 border-b border-rule bg-surface/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Avatar name={column.name} size="sm" />
          <p className="truncate text-sm font-medium leading-tight">{column.name}</p>
          <span className="tabular ml-auto shrink-0 text-[11px] text-faint">
            {booked}/{bookable}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-rule-soft">
          <div
            className="h-full rounded-full bg-accent/70"
            style={{ width: `${bookable ? (booked / bookable) * 100 : 0}%` }}
          />
        </div>
      </header>

      <div
        className={`day-grid relative ${canCreate ? 'cursor-copy' : ''}`}
        style={{ height: gridHeight, '--row': `${rowHeight}px` }}
        onClick={handleGapClick}
        title={canCreate ? 'Click an empty stretch to open a slot there' : undefined}
      >
        {nowOffset !== null && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-10 border-t"
            style={{
              top: nowOffset * PX_PER_MIN,
              borderColor: 'var(--color-status-noshow)',
            }}
          />
        )}

        {placed.map(({ appt, lane, lanes }) => (
          <SlotBlock
            key={appt._id}
            appt={appt}
            startHour={startHour}
            lane={lane}
            lanes={lanes}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}

function SlotBlock({ appt, startHour, lane, lanes, onOpen }) {
  const start = new Date(appt.startsAt);
  const minutesFromTop = (start.getHours() - startHour) * 60 + start.getMinutes();
  if (minutesFromTop < 0) return null;

  const top = minutesFromTop * PX_PER_MIN;
  const height = Math.max(appt.durationMin * PX_PER_MIN, 26);
  const width = 100 / lanes;
  const isOpen = appt.status === 'OPEN';
  const dropped = appt.status === 'CANCELLED' || appt.status === 'NO_SHOW';

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onOpen(appt._id);
      }}
      style={{
        top,
        height,
        left: `calc(${lane * width}% + 3px)`,
        width: `calc(${width}% - 6px)`,
        '--tint-color': STATUS_COLOR[appt.status],
      }}
      className={`tint-block absolute overflow-hidden rounded-lg border px-2 py-1 text-left
                  transition-colors ${isOpen ? 'border-dashed' : ''} ${
                    dropped ? 'opacity-70' : ''
                  }`}
    >
      <p className="tabular truncate text-[10px] leading-tight opacity-70">
        {time(appt.startsAt)}
        {height > 40 && appt.endsAt ? `–${time(appt.endsAt)}` : ''}
      </p>
      <p
        className={`truncate text-xs leading-tight text-ink ${
          isOpen ? 'font-normal text-muted' : 'font-medium'
        } ${dropped ? 'line-through' : ''}`}
      >
        {appt.patientName ?? 'Open'}
      </p>
      {height > 62 && (
        <div className="mt-1">
          <StatusBadge status={appt.status} />
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// List

function AgendaList({ appointments, onOpen }) {
  // Grouped by the hour so a long day reads as blocks of work rather than one
  // undifferentiated column of times.
  const groups = useMemo(() => {
    const byHour = new Map();

    for (const appt of [...appointments].sort(
      (a, b) => new Date(a.startsAt) - new Date(b.startsAt)
    )) {
      const hour = new Date(appt.startsAt).getHours();
      if (!byHour.has(hour)) byHour.set(hour, []);
      byHour.get(hour).push(appt);
    }

    return [...byHour.entries()].map(([hour, items]) => ({ hour, items }));
  }, [appointments]);

  return (
    <div>
      {groups.map(({ hour, items }) => (
        <section key={hour}>
          <p className="tabular border-y border-rule-soft bg-surface-sunk px-5 py-1.5 text-[11px] font-medium text-faint">
            {String(hour).padStart(2, '0')}:00
          </p>
          <ul className="divide-y divide-rule-soft">
            {items.map((appt) => (
              <li key={appt._id}>
                <button
                  onClick={() => onOpen(appt._id)}
                  className="flex w-full items-center gap-4 px-5 py-3 text-left transition-colors
                             hover:bg-surface-sunk"
                >
                  <span
                    aria-hidden
                    className="h-9 w-1 shrink-0 rounded-full"
                    style={{ background: STATUS_COLOR[appt.status] }}
                  />
                  <span className="tabular w-20 shrink-0 text-sm">
                    <span className="block font-medium">{time(appt.startsAt)}</span>
                    <span className="block text-[11px] text-faint">{appt.durationMin} min</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {appt.patientName ?? <span className="font-normal text-muted">Open slot</span>}
                    </span>
                    <span className="block truncate text-xs text-muted">{appt.providerName}</span>
                  </span>
                  <StatusBadge status={appt.status} />
                  <ChevronRight size={15} strokeWidth={1.75} className="shrink-0 text-faint" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Create

function NewSlotModal({ open, onClose, date, providers, initial = {} }) {
  const [form, setForm] = useState({
    providerId: initial.providerId ?? '',
    startTime: initial.startTime ?? '09:00:00',
    durationMin: 30,
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/appointments', {
        providerId: form.providerId,
        startsAt: toIso(date, form.startTime),
        durationMin: Number(form.durationMin),
      });
      queryClient.invalidateQueries({ queryKey: ['day'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="New slot" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <Field label="Provider">
          <Select
            value={form.providerId}
            onChange={(e) => setForm({ ...form, providerId: e.target.value })}
            required
          >
            <option value="">Choose a provider</option>
            {providers.map((p) => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time">
            <TimePicker
              withSeconds
              ariaLabel="Start time"
              value={form.startTime}
              onChange={(startTime) => setForm({ ...form, startTime })}
            />
          </Field>
          <Field label="Duration (minutes)">
            <Input
              type="number"
              min={5}
              max={480}
              step={5}
              value={form.durationMin}
              onChange={(e) => setForm({ ...form, durationMin: e.target.value })}
              required
            />
          </Field>
        </div>

        <ErrorNote>{error}</ErrorNote>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" loading={busy}>
            {busy ? 'Please wait…' : 'Create slot'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
