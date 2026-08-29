import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, X, Archive, ArchiveRestore } from 'lucide-react';
import { useAppointment, useAppointmentMutation } from '../hooks/useAppointment';
import { useProviders } from '../hooks/useProviders';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  Button, Panel, StatusBadge, Modal, Field, Textarea, Select, Input,
  Loading, ErrorNote, EmptyState,
} from '../components/ui';
import { time, fullDate, dateTime, STATUS_LABEL } from '../lib/format';

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

      <div className="rounded-lg border border-rule bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-5 p-5">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">
                {appt.patientName ?? 'Unbooked slot'}
              </h1>
              <StatusBadge status={appt.status} />
            </div>
            <p className="tabular mt-1.5 text-sm text-muted">
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
                <li key={event._id} className="flex gap-4 px-5 py-3">
                  <span className="tabular w-32 shrink-0 text-xs text-muted">
                    {dateTime(event.createdAt)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm">{describe(event)}</p>
                    <p className="text-xs text-muted">{event.actorName}</p>
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