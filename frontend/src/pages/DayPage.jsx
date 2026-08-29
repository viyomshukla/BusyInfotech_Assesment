import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react';
import { addDays, parseISO } from 'date-fns';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useProviders } from '../hooks/useProviders';
import {
  Button, Panel, PageHeader, Modal, Field, Input, Select, StatusBadge,
  EmptyState, Loading, ErrorNote,
} from '../components/ui';
import { time, fullDate, toInputDate, STATUS_COLOR } from '../lib/format';

const START_HOUR = 8;
const END_HOUR = 19;
const PX_PER_MIN = 1.5;

export default function DayPage() {
  const [date, setDate] = useState(toInputDate());
  const [providerId, setProviderId] = useState('');
  const [creating, setCreating] = useState(false);
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

  const columns = isFrontDesk
    ? providers.filter((p) => !providerId || p._id === providerId)
    : providers.filter((p) => p._id === user._id);

  const hours = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) hours.push(h);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Day sheet" subtitle={fullDate(parseISO(date))}>
        <div className="flex items-center rounded-md border border-rule bg-surface shadow-card">
          <button
            onClick={() => shift(-1)}
            aria-label="Previous day"
            className="rounded-l-md px-2 py-2 text-muted transition-colors hover:bg-paper hover:text-ink"
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
            className="rounded-r-md px-2 py-2 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <ChevronRight size={15} strokeWidth={2} />
          </button>
        </div>

        <Button variant="secondary" size="sm" onClick={() => setDate(toInputDate())}>
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

        <Button variant="secondary" size="sm" onClick={exportCsv}>
          <Download size={14} strokeWidth={1.75} /> CSV
        </Button>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={14} strokeWidth={2} /> New slot
        </Button>
      </PageHeader>

      <ErrorNote>{error}</ErrorNote>

      <Panel>
        {isLoading ? (
          <Loading />
        ) : data.length === 0 ? (
          <EmptyState
            title="Nothing scheduled"
            hint="No slots exist for this day. Create one, or generate a recurring pattern from Availability."
          />
        ) : (
          <div className="overflow-x-auto p-5">
            <div className="flex min-w-max">
              <div className="w-14 shrink-0">
                <div className="h-8" />
                {hours.map((h) => (
                  <div
                    key={h}
                    className="tabular relative text-xs text-faint"
                    style={{ height: 60 * PX_PER_MIN }}
                  >
                    <span className="absolute -top-1.5">{String(h).padStart(2, '0')}:00</span>
                  </div>
                ))}
              </div>

              {columns.map((provider) => (
                <div key={provider._id} className="w-56 shrink-0 border-l border-rule">
                  <div className="h-8 truncate px-3 text-sm font-medium text-ink">{provider.name}</div>
                  <div
                    className="relative"
                    style={{ height: (END_HOUR - START_HOUR + 1) * 60 * PX_PER_MIN }}
                  >
                    {hours.map((h, i) => (
                      <div
                        key={h}
                        className="absolute inset-x-0 border-t border-rule"
                        style={{ top: i * 60 * PX_PER_MIN }}
                      />
                    ))}

                    {data
                      .filter((a) => a.providerId === provider._id)
                      .map((appt) => (
                        <SlotBlock key={appt._id} appt={appt} onClick={() => navigate(`/appointments/${appt._id}`)} />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <NewSlotModal
        open={creating}
        onClose={() => setCreating(false)}
        date={date}
        providers={isFrontDesk ? providers : providers.filter((p) => p._id === user._id)}
      />
    </div>
  );
}

function SlotBlock({ appt, onClick }) {
  const start = new Date(appt.startsAt);
  const minutesFromTop = (start.getHours() - START_HOUR) * 60 + start.getMinutes();
  const top = minutesFromTop * PX_PER_MIN;
  const height = Math.max(appt.durationMin * PX_PER_MIN, 22);

  if (minutesFromTop < 0) return null;

  return (
    <button
      onClick={onClick}
      className="absolute inset-x-1 overflow-hidden rounded-md border border-rule bg-surface
                 px-2 py-1 text-left shadow-card transition-shadow hover:shadow-raise"
      style={{ top, height, borderLeft: `3px solid ${STATUS_COLOR[appt.status]}` }}
    >
      <p className="tabular truncate text-[11px] text-faint">{time(appt.startsAt)}</p>
      <p className="truncate text-xs font-medium">
        {appt.patientName ?? <span className="font-normal text-muted">Open</span>}
      </p>
      {height > 45 && (
        <div className="mt-0.5"><StatusBadge status={appt.status} /></div>
      )}
    </button>
  );
}

function NewSlotModal({ open, onClose, date, providers }) {
  const [form, setForm] = useState({ providerId: '', startTime: '09:00', durationMin: 30 });
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
        startsAt: new Date(`${date}T${form.startTime}:00`).toISOString(),
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
            <Input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              required
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
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? 'Creating…' : 'Create slot'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}