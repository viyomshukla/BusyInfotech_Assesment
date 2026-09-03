import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { parseISO } from 'date-fns';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useProviders } from '../hooks/useProviders';
import { Button, Loading, ErrorNote } from '../components/ui';
import { time, fullDate, dateTime, toInputDate, STATUS_LABEL, STATUS_COLOR } from '../lib/format';

const BOOKED = new Set(['REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED']);

// The sheet is a snapshot of a moment, taken to paper. Live polling underneath
// it would mean the copy on the clipboard and the copy in the printer dialog
// disagree, so this one query opts out of the app-wide refresh.
export default function DaySheetPrintPage() {
  const [params] = useSearchParams();
  const date = params.get('date') || toInputDate();
  const providerId = params.get('providerId') || '';
  const auto = params.get('auto') === '1';

  const { user, isFrontDesk } = useAuth();
  const { data: providers = [] } = useProviders();
  const printed = useRef(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['day-sheet-print', date, providerId],
    queryFn: () =>
      api
        .get('/appointments', {
          params: { from: date, to: date, limit: 100, sort: 'date', ...(providerId ? { providerId } : {}) },
        })
        .then((r) => r.data),
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const rows = useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)),
    [data]
  );

  // Arriving from the day sheet's Print button opens the dialog straight away;
  // opening the URL on its own just shows the sheet. Either way it fires once —
  // a re-render that re-opened the print dialog would be unusable.
  useEffect(() => {
    if (!auto || printed.current || isLoading || error) return;
    printed.current = true;
    const id = setTimeout(() => window.print(), 250);
    return () => clearTimeout(id);
  }, [auto, isLoading, error]);

  const scope = providerId
    ? providers.find((p) => p._id === providerId)?.name ?? 'Selected provider'
    : isFrontDesk
      ? 'All providers'
      : user.name;

  const totals = rows.reduce(
    (acc, appt) => {
      if (BOOKED.has(appt.status)) acc.booked += 1;
      if (appt.status === 'OPEN') acc.open += 1;
      if (appt.status === 'CANCELLED') acc.cancelled += 1;
      return acc;
    },
    { booked: 0, open: 0, cancelled: 0 }
  );

  return (
    <div className="print-sheet mx-auto max-w-4xl bg-surface p-6 sm:p-10">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/day"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
        >
          <ArrowLeft size={15} strokeWidth={1.75} />
          Back to the day sheet
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          <Printer size={14} strokeWidth={1.75} /> Print
        </Button>
      </div>

      <ErrorNote>{error?.message}</ErrorNote>

      {isLoading ? (
        <Loading hint="Building the day sheet." />
      ) : (
        <>
          <header className="flex items-end justify-between gap-6 border-b-2 border-ink pb-3">
            <div>
              <p className="tabular text-[10px] uppercase tracking-[0.18em] text-muted">
                Riverside Clinic · Day sheet
              </p>
              <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">
                {fullDate(parseISO(date))}
              </h1>
              <p className="mt-1 text-sm text-muted">{scope}</p>
            </div>
            <div className="text-right text-[11px] leading-relaxed text-muted">
              <p className="tabular">
                {rows.length} {rows.length === 1 ? 'slot' : 'slots'}
              </p>
              <p className="tabular">
                {totals.booked} booked · {totals.open} open
                {totals.cancelled > 0 ? ` · ${totals.cancelled} cancelled` : ''}
              </p>
              <p className="tabular mt-1 text-faint">Printed {dateTime(new Date())}</p>
            </div>
          </header>

          {rows.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">
              Nothing is scheduled for this day.
            </p>
          ) : (
            <table className="mt-4 w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-rule text-[10px] uppercase tracking-wider text-muted">
                  <th className="w-7 py-2 pr-1 font-medium" title="Tick when the patient arrives">
                    In
                  </th>
                  <th className="w-24 py-2 pr-2 font-medium">Time</th>
                  <th className="py-2 pr-2 font-medium">Patient</th>
                  <th className="w-40 py-2 pr-2 font-medium">Provider</th>
                  <th className="w-24 py-2 pr-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((appt) => {
                  const dropped = appt.status === 'CANCELLED' || appt.status === 'NO_SHOW';
                  const support = (appt.careTeam ?? [])
                    .map((m) => m.providerName)
                    .filter(Boolean);

                  return (
                    <tr key={appt._id} className="border-b border-rule-soft align-top">
                      <td className="py-2.5 pr-1">
                        <span
                          aria-hidden
                          className="mt-0.5 block size-3.5 rounded-sm border border-faint"
                        />
                      </td>
                      <td className="tabular py-2.5 pr-2 whitespace-nowrap">
                        <span className="flex items-start gap-1.5">
                          {/* The one piece of colour on the page: a run of
                              slots can be read down the edge without going to
                              the status column for every line. */}
                          <span
                            aria-hidden
                            className="print-keep-color mt-0.5 block h-4 w-1 shrink-0 rounded-sm"
                            style={{ background: STATUS_COLOR[appt.status] }}
                          />
                          <span>
                            <span className="block font-medium">{time(appt.startsAt)}</span>
                            <span className="block text-[10px] text-faint">
                              {appt.durationMin} min
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="py-2.5 pr-2">
                        <span className={`font-medium ${dropped ? 'line-through' : ''}`}>
                          {appt.patientName ?? (
                            <span className="font-normal italic text-faint">Open</span>
                          )}
                        </span>
                        {appt.status === 'CANCELLED' && appt.cancelReason && (
                          <span className="block text-[10px] leading-snug text-muted">
                            {appt.cancelReason}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2">
                        <span className="block">{appt.providerName}</span>
                        {support.length > 0 && (
                          <span className="block text-[10px] leading-snug text-muted">
                            with {support.join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2 text-muted">
                        {STATUS_LABEL[appt.status] ?? appt.status}
                      </td>
                      {/* Deliberately empty: the desk writes in this column. */}
                      <td className="py-2.5">
                        <span aria-hidden className="mt-3 block border-b border-dotted border-rule" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {data && data.total > rows.length && (
            <p className="no-print mt-4 text-xs text-status-noshow">
              This day has {data.total} slots and the sheet shows the first {rows.length}. Filter by
              provider to print a complete sheet.
            </p>
          )}

          <footer className="mt-6 flex items-center justify-between border-t border-rule pt-2 text-[10px] text-faint">
            <span>Riverside Clinic — {scope}</span>
            <span className="tabular">{fullDate(parseISO(date))}</span>
          </footer>
        </>
      )}
    </div>
  );
}
