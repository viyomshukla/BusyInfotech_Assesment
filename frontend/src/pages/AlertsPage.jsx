import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BellOff, Check, RotateCcw, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAlerts } from '../hooks/useAlerts';
import { useAuth } from '../context/AuthContext';
import {
  Button, Panel, PageHeader, EmptyState, Loading, InlineLoading, ErrorNote,
  Modal, Field, Textarea,
} from '../components/ui';
import { time, dayLabel, untilNow } from '../lib/format';

export default function AlertsPage() {
  const { user, isFrontDesk } = useAuth();
  const [actionError, setActionError] = useState(null);
  // Cancelling needs a reason the record will keep, so it goes through a dialog
  // rather than firing straight off the row.
  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, error } = useAlerts();

  const act = useMutation({
    mutationFn: ({ id, action, reason: why }) => {
      if (action === 'confirm') {
        return api.post(`/appointments/${id}/status`, { to: 'CONFIRMED' });
      }
      if (action === 'cancel') {
        return api.post(`/appointments/${id}/status`, { to: 'CANCELLED', reason: why });
      }
      return api.post(`/dashboard/alerts/${id}/dismiss`);
    },
    onMutate: () => setActionError(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      // The day sheet is showing the same appointment, so it has to hear about
      // this now rather than on its next poll.
      queryClient.invalidateQueries({ queryKey: ['day'] });
    },
    onError: (err) => setActionError(err.message),
  });

  // A provider can act on the appointments that are theirs to run. Being on the
  // care team puts an appointment on this list but does not hand over the
  // schedule — the API says the same, so offering the buttons would only
  // produce a 403.
  const owns = (appt) => isFrontDesk || appt.providerId === user._id;

  function rowProps(appt) {
    return {
      appt,
      canAct: owns(appt),
      canDismiss: isFrontDesk,
      supportingOnly: !owns(appt),
      busy: act.isPending && act.variables?.id === appt._id,
      onAct: (action) =>
        action === 'cancel'
          ? setCancelling(appt)
          : act.mutate({ id: appt._id, action }),
      onOpen: () => navigate(`/appointments/${appt._id}`),
    };
  }

  const items = data?.items ?? [];
  const urgent = items.filter((a) => a.urgent);
  const upcoming = items.filter((a) => !a.urgent);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Unconfirmed alerts"
        subtitle={
          isFrontDesk
            ? 'Requested appointments starting within 24 hours that nobody has confirmed.'
            : 'Requested appointments on your schedule within the next 24 hours.'
        }
      >
        {data && (
          <span className="tabular rounded-full bg-surface px-3 py-1.5 text-xs text-muted shadow-card">
            {data.count} {data.count === 1 ? 'alert' : 'alerts'}
          </span>
        )}
      </PageHeader>

      <ErrorNote>{actionError}</ErrorNote>

      {isLoading ? (
        <Panel>
          <Loading hint="Checking for unconfirmed appointments in the next 24 hours." />
        </Panel>
      ) : error ? (
        <ErrorNote>{error.message}</ErrorNote>
      ) : items.length === 0 ? (
        <Panel>
          <EmptyState
            icon={BellOff}
            title="Nothing needs chasing"
            hint="Every appointment in the next 24 hours is either confirmed or already dismissed."
          />
        </Panel>
      ) : (
        <div className="space-y-5">
          {urgent.length > 0 && (
            <Panel
              title="Starting within the hour"
              action={<span className="text-xs text-status-noshow">Needs a call now</span>}
            >
              <ul className="divide-y divide-rule">
                {urgent.map((appt) => (
                  <AlertRow key={appt._id} {...rowProps(appt)} />
                ))}
              </ul>
            </Panel>
          )}

          {upcoming.length > 0 && (
            <Panel title="Next 24 hours">
              <ul className="divide-y divide-rule">
                {upcoming.map((appt) => (
                  <AlertRow key={appt._id} {...rowProps(appt)} />
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      <Modal
        open={Boolean(cancelling)}
        title="Cancel this appointment"
        onClose={() => setCancelling(null)}
      >
        <form
          className="p-5"
          onSubmit={(e) => {
            e.preventDefault();
            act.mutate(
              { id: cancelling._id, action: 'cancel', reason },
              {
                onSuccess: () => {
                  setCancelling(null);
                  setReason('');
                },
              }
            );
          }}
        >
          <p className="text-sm text-muted">
            {cancelling?.patientName ?? 'This slot'} · {cancelling && dayLabel(cancelling.startsAt)}{' '}
            at {cancelling && time(cancelling.startsAt)}
          </p>

          <Field
            className="mt-4"
            label="Reason"
            hint="Recorded in the history and cannot be changed later."
          >
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Patient called to reschedule"
              required
            />
          </Field>

          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setCancelling(null)}>
              Keep it
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              loading={act.isPending}
              disabled={!reason.trim()}
            >
              {act.isPending ? 'Please wait…' : 'Cancel appointment'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function AlertRow({ appt, canAct, canDismiss, supportingOnly, busy, onAct, onOpen }) {
  return (
    <li
      className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5"
      style={appt.urgent ? { borderLeft: '3px solid var(--color-status-noshow)' } : undefined}
    >
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">
            {appt.patientName ?? <span className="font-normal text-muted">No patient name</span>}
          </p>
          {appt.reappeared && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-status-noshow">
              <RotateCcw size={12} strokeWidth={2} /> back after dismissal
            </span>
          )}
        </div>
        <p className="tabular mt-1 text-xs text-muted">
          {dayLabel(appt.startsAt)} · {time(appt.startsAt)} · {appt.durationMin} min ·{' '}
          {appt.providerName}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
          {appt.urgent && <AlertTriangle size={12} strokeWidth={2} className="text-status-noshow" />}
          starts {untilNow(appt.startsAt)}
        </p>
      </button>

      {canAct ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {busy && <InlineLoading label="Please wait…" />}
          <Button size="sm" disabled={busy} onClick={() => onAct('confirm')}>
            <Check size={14} strokeWidth={2} /> Confirm
          </Button>
          <Button variant="danger" size="sm" disabled={busy} onClick={() => onAct('cancel')}>
            <X size={14} strokeWidth={2} /> Cancel
          </Button>
          {/* Dismissing only silences the alert; the appointment stays
              unconfirmed, and that is the front desk's call to make. */}
          {canDismiss && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => onAct('dismiss')}>
              <BellOff size={14} strokeWidth={1.75} /> Dismiss
            </Button>
          )}
        </div>
      ) : (
        supportingOnly && (
          <p className="shrink-0 text-xs text-faint">
            {appt.providerName} runs this one — you are supporting.
          </p>
        )
      )}
    </li>
  );
}
