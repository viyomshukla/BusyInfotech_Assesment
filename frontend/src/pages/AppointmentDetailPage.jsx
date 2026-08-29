import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, X, Archive, ArchiveRestore, UserPlus, Pencil } from 'lucide-react';
import { useAppointment, useAppointmentMutation } from '../hooks/useAppointment';
import { useProviders } from '../hooks/useProviders';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  Button, Panel, StatusBadge, Modal, Field, Textarea, Select, Input,
  Loading, ErrorNote, EmptyState,
} from '../components/ui';
import { time, fullDate, dateTime, toInputDate, STATUS_LABEL } from '../lib/format';

const NEXT_STEPS = {
  REQUESTED: [{ to: 'CONFIRMED', label: 'Confirm' }],
  CONFIRMED: [
    { to: 'CHECKED_IN', label: 'Check in' },
    { to: 'NO_SHOW', label: 'Mark no show', variant: 'danger' },
  ],
  CHECKED_IN: [{ to: 'COMPLETED', label: 'Complete' }],
};

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

  const mutate = useAppointmentMutation(id, { onError: (e) => setError(e.message) });

  function run(payload, after) {
    setError(null);
    mutate.mutate(payload, { onSuccess: after });
  }

  if (isLoading) return <Loading label="Loading appointment…" />;
  if (!data) return <ErrorNote>That appointment could not be found.</ErrorNote>;

  const { appointment: appt, timeline, notes } = data;

  const isOwner = appt.providerId === user._id;
  const onCareTeam = appt.careTeam.some((m) => m.providerId === user._id);
  const canAct = isFrontDesk || isOwner;
  const canWriteNotes = !isFrontDesk && (isOwner || onCareTeam);
  const canCancel = ['OPEN', 'REQUESTED', 'CONFIRMED'].includes(appt.status);

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
                  disabled={mutate.isPending}
                  onClick={() => run({ path: '/status', body: { to: step.to } })}
                >
                  {step.label}
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
          <Panel title="Visit notes" action={<span className="tabular text-xs text-muted">{notes.length}</span>}>
            {notes.length === 0 ? (
              <EmptyState
                title="No notes yet"
                hint={canWriteNotes ? 'Add what happened at this visit.' : 'Notes are written by providers.'}
              />
            ) : (
              <ul className="divide-y divide-rule">
                {notes.map((n) => (
                  <NoteRow key={n._id} note={n} canEdit={n.authorId === user._id} id={id} onError={setError} />
                ))}
              </ul>
            )}

            {canWriteNotes && (
              <form
                className="border-t border-rule p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  run({ path: '/notes', body: { body: note } }, () => setNote(''));
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
                    {providers.find((p) => p._id === member.providerId)?.name ?? 'Provider'}
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

function BookModal({ open, onClose, onSubmit, busy }) {
  const [patientName, setPatientName] = useState('');
  const [phone, setPhone] = useState('');

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
          onSubmit({ patientName: patientName.trim(), phone: phone.trim() || undefined }, close);
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
        <Field label="Phone" hint="Optional — kept on the patient record.">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07700 900000" />
        </Field>
        <p className="text-xs text-muted">
          Booking moves this slot to Requested. Confirm it here or from Alerts.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={close}>Cancel</Button>
          <Button type="submit" size="sm" disabled={busy || !patientName.trim()}>
            {busy ? 'Booking…' : 'Book slot'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditSlotModal({ appt, onClose, onSubmit, busy }) {
  const [date, setDate] = useState(toInputDate(appt.startsAt));
  const [startTime, setStartTime] = useState(time(appt.startsAt));
  const [durationMin, setDurationMin] = useState(appt.durationMin);

  return (
    <Modal open title="Edit slot" onClose={onClose}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(
            {
              startsAt: new Date(date + 'T' + startTime + ':00').toISOString(),
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
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
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
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? 'Saving…' : 'Save slot'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function NoteRow({ note, canEdit, id, onError }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/appointments/notes/${note._id}`, { body });
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
    setEditing(false);
  }

  return (
    <li className="px-5 py-4">
      {editing ? (
        <form onSubmit={save}>
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