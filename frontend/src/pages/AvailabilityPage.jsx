import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, CalendarPlus } from 'lucide-react';
import { api } from '../lib/api';
import { useProviders } from '../hooks/useProviders';
import { Button, Panel, PageHeader, Field, Input, Select, ErrorNote } from '../components/ui';
import { time, dateTime, toInputDate } from '../lib/format';

const DAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

export default function AvailabilityPage() {
  const { data: providers = [] } = useProviders();
  const queryClient = useQueryClient();

  const [providerId, setProviderId] = useState('');
  const [from, setFrom] = useState(toInputDate());
  const [to, setTo] = useState('');
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);
  const [blocks, setBlocks] = useState([{ startTime: '09:00', durationMin: 30 }]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function toggleDay(value) {
    setWeekdays((d) => (d.includes(value) ? d.filter((x) => x !== value) : [...d, value]));
  }

  function updateBlock(index, key, value) {
    setBlocks((b) => b.map((block, i) => (i === index ? { ...block, [key]: value } : block)));
  }

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
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Availability"
        subtitle="Repeat a weekly pattern across a date range. Slots that clash with an existing booking are skipped."
      />

      <Panel title="Generate slots">
        <form onSubmit={submit} className="space-y-5 p-5">
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
            <span className="block text-xs font-medium text-muted">Repeat on</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  aria-pressed={weekdays.includes(day.value)}
                  className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                    weekdays.includes(day.value)
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-rule text-muted hover:border-accent'
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-muted">Time blocks</span>
            <div className="mt-2 space-y-2">
              {blocks.map((block, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={block.startTime}
                    onChange={(e) => updateBlock(i, 'startTime', e.target.value)}
                    className="mt-0 w-32"
                    required
                    aria-label={`Block ${i + 1} start time`}
                  />
                  <Input
                    type="number"
                    min={5}
                    max={480}
                    step={5}
                    value={block.durationMin}
                    onChange={(e) => updateBlock(i, 'durationMin', e.target.value)}
                    className="mt-0 w-24"
                    required
                    aria-label={`Block ${i + 1} duration`}
                  />
                  <span className="text-xs text-muted">min</span>
                  {blocks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setBlocks((b) => b.filter((_, x) => x !== i))}
                      className="text-muted transition-colors hover:text-status-noshow"
                      aria-label="Remove block"
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
              onClick={() => setBlocks((b) => [...b, { startTime: '09:00', durationMin: 30 }])}
            >
              <Plus size={14} strokeWidth={2} /> Add block
            </Button>
          </div>

          <ErrorNote>{error}</ErrorNote>

          <Button type="submit" disabled={busy || weekdays.length === 0}>
            <CalendarPlus size={15} strokeWidth={1.75} />
            {busy ? 'Generating…' : 'Generate slots'}
          </Button>
        </form>
      </Panel>

      {result && (
        <Panel title="Result">
          <div className="grid grid-cols-3 divide-x divide-rule border-b border-rule">
            <Figure label="Requested" value={result.requested} />
            <Figure label="Created" value={result.createdCount} accent="var(--color-status-checkedin)" />
            <Figure label="Skipped" value={result.skippedCount} accent="var(--color-status-requested)" />
          </div>

          {result.skipped.length > 0 && (
            <div>
              <p className="border-b border-rule px-5 py-2.5 text-xs font-medium text-muted">
                Skipped, and why
              </p>
              <ul className="max-h-72 divide-y divide-rule overflow-y-auto">
                {result.skipped.map((s, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-4 px-5 py-2.5 text-sm">
                    <span className="tabular shrink-0">{dateTime(s.startsAt)}</span>
                    <span className="text-right text-xs text-muted">
                      {s.reason}
                      {s.conflictWith?.patientName && ` — ${s.conflictWith.patientName}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.createdCount > 0 && result.skippedCount === 0 && (
            <p className="px-5 py-4 text-sm text-muted">
              Every slot in the pattern was created.
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}

function Figure({ label, value, accent }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold" style={accent && value > 0 ? { color: accent } : undefined}>
        {value}
      </p>
    </div>
  );
}