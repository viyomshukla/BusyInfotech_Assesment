import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BellOff, Check, RotateCcw } from 'lucide-react';
import { api } from '../lib/api';
import { useAlerts } from '../hooks/useAlerts';
import { useAuth } from '../context/AuthContext';
import { Button, Panel, PageHeader, EmptyState, Loading, ErrorNote } from '../components/ui';
import { time, dayLabel, untilNow } from '../lib/format';

export default function AlertsPage() {
  const { isFrontDesk } = useAuth();
  const [actionError, setActionError] = useState(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, error } = useAlerts();

  const act = useMutation({
    mutationFn: ({ id, action }) =>
      action === 'confirm'
        ? api.post(`/appointments/${id}/status`, { to: 'CONFIRMED' })
        : api.post(`/dashboard/alerts/${id}/dismiss`),
    onMutate: () => setActionError(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => setActionError(err.message),
  });

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
        <Panel><Loading label="Checking for unconfirmed appointments…" /></Panel>
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
                  <AlertRow
                    key={appt._id}
                    appt={appt}
                    canAct={isFrontDesk}
                    busy={act.isPending && act.variables?.id === appt._id}
                    onAct={(action) => act.mutate({ id: appt._id, action })}
                    onOpen={() => navigate(`/appointments/${appt._id}`)}
                  />
                ))}
              </ul>
            </Panel>
          )}

          {upcoming.length > 0 && (
            <Panel title="Next 24 hours">
              <ul className="divide-y divide-rule">
                {upcoming.map((appt) => (
                  <AlertRow
                    key={appt._id}
                    appt={appt}
                    canAct={isFrontDesk}
                    busy={act.isPending && act.variables?.id === appt._id}
                    onAct={(action) => act.mutate({ id: appt._id, action })}
                    onOpen={() => navigate(`/appointments/${appt._id}`)}
                  />
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

function AlertRow({ appt, canAct, busy, onAct, onOpen }) {
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

      {canAct && (
        <div className="flex shrink-0 gap-2">
          <Button size="sm" disabled={busy} onClick={() => onAct('confirm')}>
            <Check size={14} strokeWidth={2} /> Confirm
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => onAct('dismiss')}>
            <BellOff size={14} strokeWidth={1.75} /> Dismiss
          </Button>
        </div>
      )}
    </li>
  );
}
