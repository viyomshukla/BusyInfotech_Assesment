import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, X, Archive, ArchiveRestore, UserPlus, Pencil, Receipt, Stethoscope,
} from 'lucide-react';
import { useAppointment, useAppointmentMutation } from '../hooks/useAppointment';
import { useProviders } from '../hooks/useProviders';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { TimePicker } from '../components/TimePicker';
import {
  Button, Panel, StatusBadge, Modal, Field, Textarea, Select, Input, SegmentedControl,
  Loading, ErrorNote, EmptyState,
} from '../components/ui';
import {
  time, fullDate, dateTime, money, toInputDate, timeInput, toIso, STATUS_LABEL,
} from '../lib/format';

const NEXT_STEPS = {
  REQUESTED: [{ to: 'CONFIRMED', label: 'Confirm' }],
  CONFIRMED: [
    { to: 'CHECKED_IN', label: 'Check in' },
    { to: 'NO_SHOW', label: 'Mark no show', variant: 'danger' },
  ],
  CHECKED_IN: [{ to: 'COMPLETED', label: 'Complete' }],
};

// One mutation hook drives every action on this page, so a button only spins
// when the request in flight is its own.
const ARCHIVE_PATHS = ['/archive', '/restore'];

export default function AppointmentDetailPage() {
  const { id } = useParams();
  const { user, isFrontDesk } = useAuth();
  const { data, isLoading } = useAppointment(id);
  const { data: providers = [] } = useProviders();

  const [error, setError] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [supportId, setSupportId] = useState('');
  // Which ledger is on screen. The front desk opens on billing because that is
  // what it came for; a provider has nothing to write there and opens on theirs.
  const [noteKind, setNoteKind] = useState(isFrontDesk ? 'BILLING' : 'CLINICAL');

  const mutate = useAppointmentMutation(id, { onError: (e) => setError(e.message) });

  function run(payload, after) {
    setError(null);
    mutate.mutate(payload, { onSuccess: after });
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl rounded-xl border border-rule bg-surface shadow-card">
        <Loading hint="Opening the appointment and its history." />
      </div>
    );
  }
  if (!data) return <ErrorNote>That appointment could not be found.</ErrorNote>;

  const { appointment: appt, timeline, notes } = data;

  const isOwner = appt.providerId === user._id;
  const onCareTeam = appt.careTeam.some((m) => m.providerId === user._id);
  const canAct = isFrontDesk || isOwner;
  const canWriteNotes = !isFrontDesk && (isOwner || onCareTeam);
  const canCancel = ['OPEN', 'REQUESTED', 'CONFIRMED'].includes(appt.status);

  // Notes written before the split are clinical: that is the only kind that
  // existed when they were written.
  const clinical = notes.filter((n) => (n.kind ?? 'CLINICAL') === 'CLINICAL');
  const billing = notes.filter((n) => n.kind === 'BILLING');
  const showingBilling = noteKind === 'BILLING';
  const shownNotes = showingBilling ? billing : clinical;
  const billedTotal = billing.reduce((sum, n) => sum + (n.amount ?? 0), 0);

  const available = providers.filter(
    (p) => p._id !== appt.providerId && !appt.careTeam.some((m) => m.providerId === p._id)
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link
        to="/appointments"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft size={15} strokeWidth={1.75} />
        Appointments
      </Link>

      <div className="overflow-hidden rounded-xl border border-rule bg-surface shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-5 p-5">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[22px] font-semibold leading-tight tracking-tight">
                {appt.patientName ?? 'Unbooked slot'}
              </h1>
              <StatusBadge status={appt.status} />
            </div>
            <p className="tabular mt-2 text-sm text-muted">
              {time(appt.startsAt)}–{time(appt.endsAt)} · {fullDate(appt.startsAt)}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {appt.providerName} · {appt.durationMin} minutes
            </p>
          </div>

          {canAct && (
            <div className="flex flex-wrap gap-2">
              {(NEXT_STEPS[appt.status] ?? []).map((step) => (
                <Button
                  key={step.to}
                  variant={step.variant ?? 'primary'}
                  size="sm"
                  loading={mutate.isPending && mutate.variables?.body?.to === step.to}
                  disabled={mutate.isPending}
                  onClick={() => run({ path: '/status', body: { to: step.to } })}
                >
                  {mutate.isPending && mutate.variables?.body?.to === step.to
                    ? 'Please wait…'
                    : step.label}
                </Button>
              ))}
              {appt.status === 'OPEN' && (
                <>
                  <Button size="sm" onClick={() => setBookOpen(true)}>
                    <UserPlus size={14} strokeWidth={2} /> Book patient
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                    <Pencil size={14} strokeWidth={1.75} /> Edit slot
                  </Button>
                </>
              )}
              {canCancel && (
                <Button variant="secondary" size="sm" onClick={() => setCancelOpen(true)}>
                  Cancel
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                loading={mutate.isPending && ARCHIVE_PATHS.includes(mutate.variables?.path)}
                disabled={mutate.isPending}
                onClick={() =>
                  run({ path: appt.archivedAt ? '/restore' : '/archive' })
                }
              >
                {appt.archivedAt ? (
                  <><ArchiveRestore size={14} strokeWidth={1.75} /> Restore</>
                ) : (
                  <><Archive size={14} strokeWidth={1.75} /> Archive</>
                )}
              </Button>
            </div>
          )}
        </div>

        {appt.status === 'CANCELLED' && appt.cancelReason && (
          <p className="border-t border-rule px-5 py-3 text-sm">
            <span className="text-muted">Cancelled: </span>
            {appt.cancelReason}
          </p>
        )}

        {appt.archivedAt && (
          <p className="border-t border-rule bg-paper px-5 py-2.5 text-xs text-muted">
            Archived {dateTime(appt.archivedAt)}. Hidden from the schedule, history kept.
          </p>
        )}

        {error && <div className="border-t border-rule p-5"><ErrorNote>{error}</ErrorNote></div>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {/* One visit, two ledgers. What was done is the provider's record;
              what it costs is the desk's. They are kept side by side rather
              than mixed, so neither has to be read around to find the other. */}
          <Panel
            title="Visit notes"
            action={
              <SegmentedControl
                ariaLabel="Which notes"
                value={noteKind}
                onChange={setNoteKind}
                options={[
                  {
                    value: 'CLINICAL',
                    label: clinical.length ? `Clinical (${clinical.length})` : 'Clinical',
                  },
                  {
                    value: 'BILLING',
                    label: billing.length ? `Billing (${billing.length})` : 'Billing',
                  },
                ]}
              />
            }
          >
            {showingBilling && billing.length > 0 && (
              <div className="flex items-center justify-between border-b border-rule bg-surface-sunk px-5 py-2.5">
                <span className="text-xs text-muted">Total billed for this visit</span>
                <span className="tabular text-sm font-semibold">{money(billedTotal) ?? '—'}</span>
              </div>
            )}

            {shownNotes.length === 0 ? (
              <EmptyState
                icon={showingBilling ? Receipt : Stethoscope}
                title={showingBilling ? 'Nothing billed yet' : 'No clinical notes yet'}
                hint={
                  showingBilling
                    ? isFrontDesk
                      ? 'Record what this visit is charged at and the code it goes out under.'
                      : 'Billing is kept by the front desk.'
                    : canWriteNotes
                      ? 'Add what happened at this visit.'
                      : 'Clinical notes are written by the providers on this appointment.'
                }
              />
            ) : (
              <ul className="divide-y divide-rule">
                {shownNotes.map((n) => (
                  <NoteRow key={n._id} note={n} canEdit={n.authorId === user._id} id={id} onError={setError} />
                ))}
              </ul>
            )}

            {!showingBilling && canWriteNotes && (
              <form
                className="border-t border-rule p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  run({ path: '/notes', body: { body: note, kind: 'CLINICAL' } }, () => setNote(''));
                }}
              >
                <Field label="Add a note">
                  <Textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What happened at this visit?"
                    required
                  />
                </Field>
                <Button type="submit" size="sm" className="mt-3" disabled={mutate.isPending || !note.trim()}>
                  <Plus size={14} strokeWidth={2} /> Add note
                </Button>
              </form>
            )}

            {showingBilling && isFrontDesk && (
              <BillingNoteForm
                busy={mutate.isPending}
                onSubmit={(body, done) => run({ path: '/notes', body }, done)}
              />
            )}
          </Panel>

          <Panel title="History" action={<span className="text-xs text-muted">Cannot be edited</span>}>
            <ol className="divide-y divide-rule">
              {timeline.map((event) => (
                <li key={event._id} className="flex gap-4 px-5 py-3 transition-colors hover:bg-paper/60">
                  <span className="tabular w-32 shrink-0 text-xs text-faint">
                    {dateTime(event.createdAt)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm">{describe(event)}</p>
                    <p className="text-xs text-faint">{event.actorName}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <Panel
          title="Care team"
          className="h-fit"
          action={<span className="tabular text-xs text-muted">{appt.careTeam.length + 1}</span>}
        >
          <ul className="divide-y divide-rule">
            <li className="px-5 py-3">
              <p className="text-sm font-medium">{appt.providerName}</p>
              <p className="text-xs text-muted">Scheduling provider</p>
            </li>
            {appt.careTeam.map((member) => (
              <li key={member.providerId} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {/* The API names the care team now; the roster is only a
                        fallback for a response cached before it did. */}
                    {member.providerName ??
                      providers.find((p) => p._id === member.providerId)?.name ??
                      'Provider'}
                  </p>
                  <p className="text-xs text-muted">Supporting</p>
                </div>
                {canAct && (
                  <button
                    onClick={() =>
                      run({ path: `/care-team/${member.providerId}`, method: 'delete' })
                    }
                    className="text-muted transition-colors hover:text-status-noshow"
                    aria-label="Remove from care team"
                  >
                    <X size={15} strokeWidth={2} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {canAct && available.length > 0 && (
            <form
              className="border-t border-rule p-5"
              onSubmit={(e) => {
                e.preventDefault();
                run({ path: '/care-team', body: { providerId: supportId } }, () => setSupportId(''));
              }}
            >
              <Field label="Add supporting provider">
                <Select value={supportId} onChange={(e) => setSupportId(e.target.value)} required>
                  <option value="">Choose a provider</option>
                  {available.map((p) => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" size="sm" variant="secondary" className="mt-3 w-full" disabled={!supportId}>
                Add
              </Button>
            </form>
          )}

          {isFrontDesk && appt.status !== 'COMPLETED' && (
            <form
              className="border-t border-rule p-5"
              onSubmit={(e) => {
                e.preventDefault();
                run({ path: '/reassign', body: { providerId: e.target.provider.value } });
              }}
            >
              <Field label="Reassign to" hint="Moves the appointment to another provider.">
                <Select name="provider" required defaultValue="">
                  <option value="">Choose a provider</option>
                  {providers.filter((p) => p._id !== appt.providerId).map((p) => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" size="sm" variant="secondary" className="mt-3 w-full">
                Reassign
              </Button>
            </form>
          )}
        </Panel>
      </div>

      <BookModal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        onSubmit={(body, done) => run({ path: '/book', body }, done)}
        busy={mutate.isPending}
      />

      {editOpen && (
        <EditSlotModal
          appt={appt}
          onClose={() => setEditOpen(false)}
          onSubmit={(body, done) => run({ path: '', method: 'patch', body }, done)}
          busy={mutate.isPending}
        />
      )}

      <Modal open={cancelOpen} title="Cancel this appointment" onClose={() => setCancelOpen(false)}>
        <form
          className="p-5"
          onSubmit={(e) => {
            e.preventDefault();
            run({ path: '/status', body: { to: 'CANCELLED', reason } }, () => {
              setCancelOpen(false);
              setReason('');
            });
          }}
        >
          <Field label="Reason" hint="Recorded in the history and cannot be changed later.">
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Patient called to reschedule"
              required
            />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setCancelOpen(false)}>
              Keep it
            </Button>
            <Button type="submit" variant="danger" size="sm" disabled={!reason.trim()}>
              Cancel appointment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// A number is written down with spaces or hyphens as often as not, so the form
// reads through them and judges the digits — the same rule the API applies.
function phoneDigits(value) {
  return value.replace(/[\s-]/g, '');
}

function BookModal({ open, onClose, onSubmit, busy }) {
  const [patientName, setPatientName] = useState('');
  const [phone, setPhone] = useState('');

  const digits = phoneDigits(phone);
  const phoneError = !digits
    ? null
    : !/^\d*$/.test(digits)
      ? 'A phone number can only contain digits.'
      : digits.length !== 10
        ? `A phone number must be exactly 10 digits — this one has ${digits.length}.`
        : null;

  function close() {
    setPatientName('');
    setPhone('');
    onClose();
  }

  return (
    <Modal open={open} title="Book this slot" onClose={close}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (phoneError) return;
          onSubmit({ patientName: patientName.trim(), phone: digits || undefined }, close);
        }}
      >
        <Field label="Patient name">
          <Input
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            placeholder="Jane Doe"
            required
          />
        </Field>
        <Field
          label="Phone"
          hint="Optional — 10 digits if you give one."
          error={phoneError}
        >
          <Input
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={phoneError ? true : undefined}
            placeholder="9876543210"
          />
        </Field>
        <p className="text-xs text-muted">
          Booking moves this slot to Requested. Confirm it here or from Alerts.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={close}>Cancel</Button>
          <Button
            type="submit"
            size="sm"
            loading={busy}
            disabled={!patientName.trim() || Boolean(phoneError)}
          >
            {busy ? 'Please wait…' : 'Book slot'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditSlotModal({ appt, onClose, onSubmit, busy }) {
  const [date, setDate] = useState(toInputDate(appt.startsAt));
  const [startTime, setStartTime] = useState(timeInput(appt.startsAt));
  const [durationMin, setDurationMin] = useState(appt.durationMin);

  return (
    <Modal open title="Edit slot" onClose={onClose}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(
            {
              startsAt: toIso(date, startTime),
              durationMin: Number(durationMin),
            },
            onClose
          );
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Start time">
            <TimePicker
              withSeconds
              ariaLabel="Start time"
              value={startTime}
              onChange={setStartTime}
            />
          </Field>
        </div>
        <Field label="Duration (minutes)">
          <Input
            type="number"
            min={5}
            max={480}
            step={5}
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
            required
          />
        </Field>
        <p className="text-xs text-muted">
          Only unbooked slots can be moved. An overlap with this provider's other slots is rejected.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" loading={busy}>
            {busy ? 'Please wait…' : 'Save slot'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function BillingNoteForm({ busy, onSubmit }) {
  const [body, setBody] = useState('');
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');

  return (
    <form
      className="border-t border-rule p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(
          {
            kind: 'BILLING',
            body: body.trim(),
            code: code.trim() || undefined,
            amount: amount === '' ? undefined : Number(amount),
          },
          () => {
            setBody('');
            setCode('');
            setAmount('');
          }
        );
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code" hint="Optional.">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CONS-30" />
        </Field>
        <Field label="Amount" hint="Optional.">
          <Input
            type="number"
            min={0}
            step={50}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="800"
          />
        </Field>
      </div>

      <Field label="What is being billed" className="mt-3">
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Consultation fee invoiced. Paid by card at reception."
          required
        />
      </Field>

      <Button type="submit" size="sm" className="mt-3" disabled={busy || !body.trim()}>
        <Plus size={14} strokeWidth={2} /> Add billing note
      </Button>
    </form>
  );
}

function NoteRow({ note, canEdit, id, onError }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [code, setCode] = useState(note.code ?? '');
  const [amount, setAmount] = useState(note.amount ?? '');
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const billing = note.kind === 'BILLING';

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/appointments/notes/${note._id}`, {
        body,
        // Sent on every billing save, empty included: a code cleared out of the
        // field has to come off the note rather than being read as unchanged.
        ...(billing
          ? { code: code.trim(), amount: amount === '' ? null : Number(amount) }
          : {}),
      });
      queryClient.invalidateQueries({ queryKey: ['appointment', id] });
      setEditing(false);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setBody(note.body);
    setCode(note.code ?? '');
    setAmount(note.amount ?? '');
    setEditing(false);
  }

  return (
    <li className="px-5 py-4">
      {editing ? (
        <form onSubmit={save}>
          {billing && (
            <div className="mb-3 grid grid-cols-2 gap-3">
              <Field label="Code">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CONS-30" />
              </Field>
              <Field label="Amount">
                <Input
                  type="number"
                  min={0}
                  step={50}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
            </div>
          )}
          <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} required />
          <div className="mt-2 flex gap-2">
            <Button type="submit" size="sm" disabled={saving || !body.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={discard}>
              Discard
            </Button>
          </div>
        </form>
      ) : (
        <>
          {billing && (note.code || note.amount != null) && (
            <div className="mb-1.5 flex items-center gap-2">
              {note.code && (
                <span className="tabular rounded border border-rule bg-paper px-1.5 py-0.5 text-[11px] font-medium text-muted">
                  {note.code}
                </span>
              )}
              {note.amount != null && (
                <span className="tabular text-sm font-semibold">{money(note.amount)}</span>
              )}
            </div>
          )}
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{note.body}</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-muted">
            <span>{note.authorName}</span>
            <span className="tabular">{dateTime(note.createdAt)}</span>
            {note.updatedAt !== note.createdAt && <span>edited</span>}
            {canEdit && (
              <button onClick={() => setEditing(true)} className="transition-colors hover:text-accent">
                Edit
              </button>
            )}
          </div>
        </>
      )}
    </li>
  );
}
function describe(event) {
  const to = STATUS_LABEL[event.toStatus] ?? event.toStatus;
  const from = STATUS_LABEL[event.fromStatus] ?? event.fromStatus;

  switch (event.type) {
    case 'CREATED': return 'Slot created';
    case 'STATUS_CHANGED': return `${from} → ${to}`;
    case 'CANCELLED': return `Cancelled — ${event.detail?.reason ?? 'no reason recorded'}`;
    case 'PROVIDER_REASSIGNED':
      return `Reassigned from ${event.detail?.from?.name} to ${event.detail?.to?.name}`;
    case 'SUPPORT_ADDED': return `${event.detail?.providerName} added as supporting provider`;
    case 'SUPPORT_REMOVED': return `${event.detail?.providerName} removed from the care team`;
    case 'NOTE_ADDED': return 'Visit note added';
    case 'ARCHIVED': return 'Archived';
    case 'RESTORED': return 'Restored';
    default: return event.type;
  }
}