import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, CalendarRange, CheckCircle2, Plus, SkipForward, Trash2 } from 'lucide-react';
import { eachDayOfInterval, isValid, parseISO } from 'date-fns';
import { api } from '../lib/api';
import { useProviders } from '../hooks/useProviders';
import { Button, Panel, PageHeader, Field, Input, Select, ErrorNote } from '../components/ui';
import { TimePicker } from '../components/TimePicker';
import { dateTime, fullDate, toInputDate } from '../lib/format';

const DAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const WEEKDAYS = [1, 2, 3, 4, 5];

export default function AvailabilityPage() {
  const { data: providers = [] } = useProviders();
  const queryClient = useQueryClient();

  const [providerId, setProviderId] = useState('');
  const [from, setFrom] = useState(toInputDate());
  const [to, setTo] = useState('');
  const [weekdays, setWeekdays] = useState(WEEKDAYS);
  const [blocks, setBlocks] = useState([{ startTime: '09:00:00', durationMin: 30 }]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function toggleDay(value) {
    setWeekdays((d) => (d.includes(value) ? d.filter((x) => x !== value) : [...d, value]));
  }

  function updateBlock(index, key, value) {
    setBlocks((b) => b.map((block, i) => (i === index ? { ...block, [key]: value } : block)));
  }


  // The same arithmetic the API will do, run as you type. Slots that clash with
  // an existing booking are skipped server-side, so this is the ceiling rather
  // than a promise — which is what the wording below says.
  const preview = useMemo(() => {
    const start = parseISO(from);
    const end = parseISO(to);
    if (!isValid(start) || !isValid(end) || end < start || weekdays.length === 0) {
      return { days: 0, slots: 0 };
    }

    const days = eachDayOfInterval({ start, end }).filter((d) => weekdays.includes(d.getDay()));
    return { days: days.length, slots: days.length * blocks.length };
  }, [from, to, weekdays, blocks]);

  const provider = providers.find((p) => p._id === providerId);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await api
        .post('/appointments/generate', {
          providerId,
          from,
          to,
          weekdays,
          blocks: blocks.map((b) => ({ ...b, durationMin: Number(b.durationMin) })),
        })
        .then((r) => r.data);
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['day'] });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        eyebrow="Scheduling"
        title="Availability"
        subtitle="Repeat a weekly pattern across a date range. Slots that clash with an existing booking are skipped."
      />

      <div className="grid items-start gap-5 lg:grid-cols-[1.55fr_1fr]">
        <Panel title="Generate slots">
          <form onSubmit={submit} className="space-y-6 p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Provider">
                <Select value={providerId} onChange={(e) => setProviderId(e.target.value)} required>
                  <option value="">Choose a provider</option>
                  {providers.map((p) => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="From">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
              </Field>
              <Field label="To">
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
              </Field>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-4">
                <span className="block text-xs font-medium text-muted">Repeat on</span>
                <span className="flex gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setWeekdays(WEEKDAYS)}
                    className="text-muted transition-colors hover:text-accent"
                  >
                    Weekdays
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekdays(DAYS.map((d) => d.value))}
                    className="text-muted transition-colors hover:text-accent"
                  >
                    Every day
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekdays([])}
                    className="text-muted transition-colors hover:text-accent"
                  >
                    None
                  </button>
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DAYS.map((day) => {
                  const on = weekdays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      aria-pressed={on}
                      className={`min-w-14 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        on
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-rule text-muted hover:border-faint hover:text-ink'
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-muted">Time blocks</span>
              <div className="mt-2 space-y-2">
                {blocks.map((block, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-rule
                               bg-surface-sunk px-3 py-2"
                  >
                    <span className="tabular w-5 shrink-0 text-xs text-faint">{i + 1}</span>
                    {/* Widths live on the wrapper: the shared control is w-full,
                        and a w-32 alongside it is a coin toss in the cascade. */}
                    <div className="w-36 shrink-0">
                      <TimePicker
                        dense
                        withSeconds
                        value={block.startTime}
                        onChange={(startTime) => updateBlock(i, 'startTime', startTime)}
                        ariaLabel={`Block ${i + 1} start time`}
                      />
                    </div>
                    <div className="w-20 shrink-0">
                      <Input
                        type="number"
                        min={5}
                        max={480}
                        step={5}
                        value={block.durationMin}
                        onChange={(e) => updateBlock(i, 'durationMin', e.target.value)}
                        className="mt-0"
                        required
                        aria-label={`Block ${i + 1} duration`}
                      />
                    </div>
                    <span className="text-xs text-muted">min</span>
                    <span className="tabular ml-auto text-xs text-faint">
                      {block.startTime} – {endOf(block)}
                    </span>
                    {blocks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setBlocks((b) => b.filter((_, x) => x !== i))}
                        className="text-faint transition-colors hover:text-status-noshow"
                        aria-label={`Remove block ${i + 1}`}
                      >
                        <Trash2 size={15} strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setBlocks((b) => [...b, { startTime: '09:00:00', durationMin: 30 }])}
              >
                <Plus size={14} strokeWidth={2} /> Add block
              </Button>
            </div>

            <ErrorNote>{error}</ErrorNote>

            <div className="flex flex-wrap items-center gap-3 border-t border-rule-soft pt-4">
              <Button type="submit" loading={busy} disabled={weekdays.length === 0}>
                {!busy && <CalendarPlus size={15} strokeWidth={1.75} />}
                {busy ? 'Please wait…' : 'Generate slots'}
              </Button>
              {weekdays.length === 0 && (
                <p className="text-xs text-muted">Choose at least one day to repeat on.</p>
              )}
            </div>
          </form>
        </Panel>

        <div className="space-y-5 lg:sticky lg:top-6">
          <Panel title="This pattern">
            <dl className="divide-y divide-rule-soft text-sm">
              <Row term="Provider">
                {provider ? provider.name : <span className="text-faint">Not chosen yet</span>}
              </Row>
              <Row term="Range">
                {isValid(parseISO(from)) && isValid(parseISO(to)) ? (
                  <span className="text-right">
                    {fullDate(parseISO(from))}
                    <span className="block text-xs text-muted">to {fullDate(parseISO(to))}</span>
                  </span>
                ) : (
                  <span className="text-faint">Set an end date</span>
                )}
              </Row>
              <Row term="Days">
                {weekdays.length === 0 ? (
                  <span className="text-faint">None selected</span>
                ) : (
                  DAYS.filter((d) => weekdays.includes(d.value)).map((d) => d.label).join(', ')
                )}
              </Row>
              <Row term="Blocks a day">
                <span className="tabular">{blocks.length}</span>
              </Row>
            </dl>

            <div className="flex items-center gap-4 border-t border-rule bg-surface-sunk px-5 py-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <CalendarRange size={17} strokeWidth={1.75} />
              </span>
              <div>
                <p className="tabular text-[22px] font-semibold leading-none">
                  {preview.slots}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {preview.slots === 1 ? 'slot' : 'slots'}
                  </span>
                </p>
                <p className="mt-1.5 text-xs leading-snug text-muted">
                  {preview.days} matching {preview.days === 1 ? 'day' : 'days'} × {blocks.length}{' '}
                  {blocks.length === 1 ? 'block' : 'blocks'}. Clashes are skipped, so this is the
                  most it will create.
                </p>
              </div>
            </div>
          </Panel>

          {result && (
            <Panel title="Result">
              <div className="grid grid-cols-3 divide-x divide-rule border-b border-rule">
                <Figure label="Requested" value={result.requested} />
                <Figure
                  label="Created"
                  value={result.createdCount}
                  accent="var(--color-status-checkedin)"
                  icon={CheckCircle2}
                />
                <Figure
                  label="Skipped"
                  value={result.skippedCount}
                  accent="var(--color-status-requested)"
                  icon={SkipForward}
                />
              </div>

              {result.skipped.length > 0 && (
                <div>
                  <p className="border-b border-rule-soft bg-surface-sunk px-5 py-2 text-xs font-medium text-muted">
                    Skipped, and why
                  </p>
                  <ul className="max-h-72 divide-y divide-rule-soft overflow-y-auto">
                    {result.skipped.map((s, i) => (
                      <li key={i} className="px-5 py-2.5 text-sm">
                        <span className="tabular block text-xs text-ink">{dateTime(s.startsAt)}</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {s.reason}
                          {s.conflictWith?.patientName && ` — ${s.conflictWith.patientName}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.createdCount > 0 && result.skippedCount === 0 && (
                <p className="px-5 py-4 text-sm text-muted">Every slot in the pattern was created.</p>
              )}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ term, children }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3">
      <dt className="shrink-0 text-xs text-muted">{term}</dt>
      <dd className="min-w-0 text-right text-sm">{children}</dd>
    </div>
  );
}

function Figure({ label, value, accent, icon: Icon }) {
  return (
    <div className="px-4 py-4">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {Icon && <Icon size={13} strokeWidth={1.75} />}
        {label}
      </p>
      <p
        className="tabular mt-1.5 text-2xl font-semibold leading-none"
        style={accent && value > 0 ? { color: accent } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

// The end of a block, so the pattern reads as a span of time rather than a
// start and a number of minutes to add up in your head.
function endOf({ startTime, durationMin }) {
  const [h, m, s = 0] = String(startTime).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '—';

  const total = (h * 3600 + m * 60 + s + Number(durationMin || 0) * 60) % 86400;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}
