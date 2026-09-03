import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus, Search, X, Phone, CalendarRange } from 'lucide-react';
import { addDays, isSameDay, parseISO } from 'date-fns';
import { api } from '../lib/api';
import { useProviders } from '../hooks/useProviders';
import { useWaitlist, useWaitlistMutation } from '../hooks/useWaitlist';
import { Avatar } from '../components/Layout';
import {
  Button, Panel, PageHeader, Modal, Field, Input, Select, Textarea, SegmentedControl,
  EmptyState, Loading, ErrorNote,
} from '../components/ui';
import { time, dayLabel, dateTime, toInputDate, fullDate } from '../lib/format';

const STATUS_TABS = [
  { value: 'WAITING', label: 'Waiting' },
  { value: 'PLACED', label: 'Placed' },
  { value: 'REMOVED', label: 'Removed' },
];

// The window the patient gave, said the way it would be said back to them. A
// single day collapses rather than printing the same date twice.
function windowLabel(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  if (isSameDay(start, end)) return dayLabel(start);
  return `${dayLabel(start)} – ${dayLabel(end)}`;
}

export default function WaitlistPage() {
  // The day sheet links in here with a day already chosen, which is the whole
  // point of the link: reception saw the gap on that day and wants the people
  // who would take it.
  const [params] = useSearchParams();
  const [status, setStatus] = useState('WAITING');
  const [providerId, setProviderId] = useState(() => params.get('providerId') ?? '');
  const [date, setDate] = useState(() => params.get('date') ?? '');
  const [adding, setAdding] = useState(false);
  const [matching, setMatching] = useState(null);
  const [error, setError] = useState(null);

  const { data: providers = [] } = useProviders();
  const { data, isLoading } = useWaitlist({
    status,
    providerId: providerId || undefined,
    date: date || undefined,
  });
  const mutate = useWaitlistMutation({ onError: (e) => setError(e.message) });

  const entries = data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        eyebrow="Reception"
        title="Waitlist"
        subtitle="Patients who want a day that is already full. When a slot frees up, place one of them into it."
      >
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus size={14} strokeWidth={2} /> Add to waitlist
        </Button>
      </PageHeader>

      <ErrorNote>{error}</ErrorNote>

      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-rule-soft p-4">
          <SegmentedControl
            ariaLabel="Waitlist status"
            value={status}
            onChange={setStatus}
            options={STATUS_TABS}
          />

          <div className="w-44">
            <Select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="mt-0"
              aria-label="Filter by provider"
            >
              <option value="">Any provider</option>
              {providers.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </Select>
          </div>

          <div className="w-40">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-0"
              aria-label="Covering this day"
            />
          </div>

          {(providerId || date) && (
            <button
              onClick={() => {
                setProviderId('');
                setDate('');
              }}
              className="text-xs text-muted underline-offset-2 transition-colors hover:text-accent hover:underline"
            >
              Clear filters
            </button>
          )}

          <span className="tabular ml-auto text-xs text-muted">
            {isLoading ? '—' : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
          </span>
        </div>

        {isLoading ? (
          <Loading hint="Fetching the waitlist." />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={status === 'WAITING' ? 'Nobody is waiting' : 'Nothing here'}
            hint={
              date || providerId
                ? 'No entries match these filters. Try clearing them.'
                : status === 'WAITING'
                  ? 'When a day is full, add the patient here instead of turning them away.'
                  : 'Entries appear here once they are placed or taken off the list.'
            }
            action={
              status === 'WAITING' ? (
                <Button size="sm" onClick={() => setAdding(true)}>
                  <Plus size={14} strokeWidth={2} /> Add to waitlist
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="divide-y divide-rule">
            {entries.map((entry, index) => (
              <EntryRow
                key={entry._id}
                entry={entry}
                position={status === 'WAITING' ? index + 1 : null}
                busy={mutate.isPending && mutate.variables?.id === entry._id}
                onFindSlot={() => {
                  setError(null);
                  setMatching(entry);
                }}
                onRemove={() => {
                  setError(null);
                  mutate.mutate({ action: 'remove', id: entry._id });
                }}
              />
            ))}
          </ul>
        )}
      </Panel>

      <AddModal
        open={adding}
        onClose={() => setAdding(false)}
        providers={providers}
        onSubmit={(body, done) => {
          setError(null);
          mutate.mutate({ action: 'add', body }, { onSuccess: done });
        }}
        busy={mutate.isPending && mutate.variables?.action === 'add'}
      />

      {matching && (
        <MatchModal
          entry={matching}
          onClose={() => setMatching(null)}
          onPlace={(appointmentId) => {
            setError(null);
            mutate.mutate(
              { action: 'place', id: matching._id, body: { appointmentId } },
              { onSuccess: () => setMatching(null) }
            );
          }}
          busy={mutate.isPending && mutate.variables?.action === 'place'}
        />
      )}
    </div>
  );
}

function EntryRow({ entry, position, busy, onFindSlot, onRemove }) {
  const waiting = entry.status === 'WAITING';

  return (
    <li className="flex flex-wrap items-start gap-4 px-5 py-4">
      {position !== null && (
        <span
          aria-label={`Position ${position} in the queue`}
          className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full
                     bg-paper text-[11px] font-semibold text-muted"
        >
          {position}
        </span>
      )}

      <Avatar name={entry.patientName} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p className="text-sm font-medium">{entry.patientName}</p>
          {!waiting && <WaitStatus status={entry.status} />}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarRange size={12} strokeWidth={1.75} className="text-faint" />
            {windowLabel(entry.preferredFrom, entry.preferredTo)}
          </span>
          <span>{entry.providerName ?? 'Any provider'}</span>
          {entry.phone && (
            <span className="tabular inline-flex items-center gap-1.5">
              <Phone size={12} strokeWidth={1.75} className="text-faint" />
              {entry.phone}
            </span>
          )}
        </div>

        {entry.note && (
          <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{entry.note}</p>
        )}

        <p className="mt-1.5 text-[11px] text-faint">
          Added by {entry.addedByName} · {dateTime(entry.createdAt)}
          {entry.placedAt && ` · placed ${dateTime(entry.placedAt)}`}
        </p>
      </div>

      {waiting && (
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={onFindSlot} disabled={busy}>
            <Search size={13} strokeWidth={2} /> Find a slot
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            loading={busy}
            aria-label={`Take ${entry.patientName} off the waitlist`}
          >
            <X size={14} strokeWidth={2} />
          </Button>
        </div>
      )}
    </li>
  );
}

function WaitStatus({ status }) {
  const tone =
    status === 'PLACED'
      ? 'border-status-checkedin/35 bg-status-checkedin/10 text-status-checkedin'
      : 'border-rule bg-paper text-muted';

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {status === 'PLACED' ? 'Placed' : 'Removed'}
    </span>
  );
}

// A number is written down with spaces or hyphens as often as not, so the form
// reads through them and judges the digits — the same rule the API applies.
function phoneDigits(value) {
  return value.replace(/[\s-]/g, '');
}

function AddModal({ open, onClose, providers, onSubmit, busy }) {
  const [form, setForm] = useState(() => ({
    patientName: '',
    phone: '',
    providerId: '',
    preferredFrom: toInputDate(),
    preferredTo: toInputDate(addDays(new Date(), 7)),
    note: '',
  }));

  const set = (changes) => setForm((f) => ({ ...f, ...changes }));

  const digits = phoneDigits(form.phone);
  const phoneError =
    !digits || digits.length === 10 ? null : `A phone number must be exactly 10 digits — this one has ${digits.length}.`;
  const rangeError =
    form.preferredTo && form.preferredTo < form.preferredFrom
      ? 'The last day is before the first.'
      : null;

  function close() {
    setForm({
      patientName: '',
      phone: '',
      providerId: '',
      preferredFrom: toInputDate(),
      preferredTo: toInputDate(addDays(new Date(), 7)),
      note: '',
    });
    onClose();
  }

  return (
    <Modal open={open} title="Add to the waitlist" onClose={close}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (phoneError || rangeError) return;
          onSubmit(
            {
              patientName: form.patientName.trim(),
              phone: digits || undefined,
              providerId: form.providerId || null,
              preferredFrom: form.preferredFrom,
              preferredTo: form.preferredTo || form.preferredFrom,
              note: form.note.trim() || null,
            },
            close
          );
        }}
      >
        <Field label="Patient name">
          <Input
            value={form.patientName}
            onChange={(e) => set({ patientName: e.target.value })}
            placeholder="Jane Doe"
            required
          />
        </Field>

        <Field label="Phone" hint="How reception rings them when a slot frees up." error={phoneError}>
          <Input
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => set({ phone: e.target.value })}
            aria-invalid={phoneError ? true : undefined}
            placeholder="9876543210"
          />
        </Field>

        <Field label="Provider" hint="Any provider gets them seen soonest.">
          <Select value={form.providerId} onChange={(e) => set({ providerId: e.target.value })}>
            <option value="">Any provider</option>
            {providers.map((p) => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Can come in from">
            <Input
              type="date"
              value={form.preferredFrom}
              onChange={(e) => set({ preferredFrom: e.target.value })}
              required
            />
          </Field>
          <Field label="Until" error={rangeError}>
            <Input
              type="date"
              value={form.preferredTo}
              min={form.preferredFrom}
              onChange={(e) => set({ preferredTo: e.target.value })}
              required
            />
          </Field>
        </div>

        <Field label="Note" hint="Anything reception needs when they ring back.">
          <Textarea
            rows={2}
            value={form.note}
            onChange={(e) => set({ note: e.target.value })}
            placeholder="Can come in at an hour of notice, mornings only."
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={close}>Cancel</Button>
          <Button
            type="submit"
            size="sm"
            loading={busy}
            disabled={!form.patientName.trim() || Boolean(phoneError) || Boolean(rangeError)}
          >
            {busy ? 'Please wait…' : 'Add to waitlist'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Every open slot inside the window the patient gave, with the provider they
// asked for if they asked for one. Choosing one books it in their name through
// the ordinary booking path.
function MatchModal({ entry, onClose, onPlace, busy }) {
  // The patient is being rung up and asked to come in, so a slot earlier today
  // is no use to them. The window is clipped forward to the present before it
  // is asked for: today means the rest of today, not this morning.
  const from = useMemo(() => {
    const opens = new Date(entry.preferredFrom);
    const now = new Date();
    return opens > now ? opens : now;
  }, [entry.preferredFrom]);

  const clipped = new Date(entry.preferredFrom) < from;
  const windowGone = from > new Date(entry.preferredTo);

  const { data, isLoading } = useQuery({
    queryKey: ['waitlist-matches', entry._id],
    queryFn: () =>
      api
        .get('/appointments', {
          params: {
            status: 'OPEN',
            from: from.toISOString(),
            to: entry.preferredTo,
            limit: 100,
            sort: 'date',
            ...(entry.providerId ? { providerId: entry.providerId } : {}),
          },
        })
        .then((r) => r.data),
    enabled: !windowGone,
  });

  // Filtered again as it is drawn, not only as it is fetched: the modal can sit
  // open while a slot's start time goes by underneath it, and an offer that has
  // quietly expired should come off the list rather than fail on the click.
  const startsLater = (slot) => new Date(slot.startsAt) > new Date();
  const slots = (data?.items ?? []).filter(startsLater);

  // Grouped by day, because "is there anything on Thursday" is the question
  // being asked of the list.
  const days = slots.reduce((acc, slot) => {
    const key = toInputDate(slot.startsAt);
    (acc[key] ??= []).push(slot);
    return acc;
  }, {});

  return (
    <Modal open title={`A slot for ${entry.patientName}`} onClose={onClose} width="max-w-lg">
      <div className="border-b border-rule-soft bg-surface-sunk px-5 py-3 text-xs text-muted">
        {clipped
          ? `Open slots from now to ${dayLabel(entry.preferredTo).toLowerCase()}`
          : `Open slots ${windowLabel(entry.preferredFrom, entry.preferredTo).toLowerCase()}`}{' '}
        · {entry.providerName ?? 'any provider'}
      </div>

      <div className="max-h-[55vh] overflow-y-auto">
        {windowGone ? (
          <EmptyState
            icon={CalendarRange}
            title="That window has passed"
            hint={`The last day ${entry.patientName} said they could come in has gone by. Take a new set of dates and add them again.`}
          />
        ) : isLoading ? (
          <Loading hint="Looking for open slots in that window." />
        ) : slots.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nothing open from here on"
            hint="Every slot still to come inside the dates they gave is taken. Widen the window with them, or wait for a cancellation."
          />
        ) : (
          Object.entries(days).map(([day, items]) => (
            <section key={day}>
              <p className="tabular border-y border-rule-soft bg-surface-sunk px-5 py-1.5 text-[11px] font-medium text-faint">
                {fullDate(parseISO(day))}
              </p>
              <ul className="divide-y divide-rule-soft">
                {items.map((slot) => (
                  <li
                    key={slot._id}
                    className="flex items-center gap-3 px-5 py-2.5"
                  >
                    <span className="tabular w-16 shrink-0 text-sm font-medium">
                      {time(slot.startsAt)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{slot.providerName}</span>
                      <span className="text-xs text-muted">{slot.durationMin} min</span>
                    </span>
                    <Button size="sm" onClick={() => onPlace(slot._id)} disabled={busy}>
                      Give this slot
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-rule px-5 py-3">
        <p className="text-[11px] text-faint">
          Booking moves the slot to Requested and takes them off the list.
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
