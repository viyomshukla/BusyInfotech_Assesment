import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X, ArrowUp, ArrowDown, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useProviders } from '../hooks/useProviders';
import { Avatar } from '../components/Layout';
import {
  Button, Input, Select, StatusBadge, EmptyState, Loading, InlineLoading, ErrorNote, PageHeader,
} from '../components/ui';
import { time, dayLabel, STATUS_LABEL, STATUS_COLOR } from '../lib/format';

const STATUSES = Object.keys(STATUS_LABEL);
const LIMIT = 20;

export default function AppointmentsPage() {
  const [params, setParams] = useSearchParams();
  const { isFrontDesk } = useAuth();
  const { data: providers = [] } = useProviders();
  const navigate = useNavigate();

  const [searchBox, setSearchBox] = useState(params.get('q') ?? '');

  const query = {
    q: params.get('q') ?? '',
    providerId: params.get('providerId') ?? '',
    status: params.get('status') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    archived: params.get('archived') === 'true',
    sort: params.get('sort') ?? 'date',
    dir: params.get('dir') ?? 'asc',
    page: Number(params.get('page') ?? 1),
  };

  function setQuery(changes, { resetPage = true } = {}) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value === null) next.delete(key);
      else next.set(key, value);
    }
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  }

  function toggleSort(field) {
    if (query.sort === field) {
      setQuery({ sort: field, dir: query.dir === 'asc' ? 'desc' : 'asc' }, { resetPage: false });
    } else {
      setQuery({ sort: field, dir: 'asc' });
    }
  }

  function clearAll() {
    setSearchBox('');
    setParams(new URLSearchParams(), { replace: true });
  }

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['appointments', query],
    queryFn: () =>
      api
        .get('/appointments', {
          params: {
            ...cleaned({ ...query, archived: undefined }),
            ...(query.archived ? { includeArchived: 'true' } : {}),
            limit: LIMIT,
          },
        })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  // What is narrowing the list, in the order it reads: each one can be dropped
  // on its own, so nobody has to clear everything to widen a search by a day.
  const chips = [
    query.q && { key: 'q', label: `“${query.q}”`, clear: () => { setSearchBox(''); setQuery({ q: '' }); } },
    query.providerId && {
      key: 'providerId',
      label: providers.find((p) => p._id === query.providerId)?.name ?? 'Provider',
      clear: () => setQuery({ providerId: '' }),
    },
    query.status && {
      key: 'status',
      label: STATUS_LABEL[query.status] ?? query.status,
      clear: () => setQuery({ status: '' }),
    },
    query.from && { key: 'from', label: `From ${niceDate(query.from)}`, clear: () => setQuery({ from: '' }) },
    query.to && { key: 'to', label: `To ${niceDate(query.to)}`, clear: () => setQuery({ to: '' }) },
    query.archived && { key: 'archived', label: 'Including archived', clear: () => setQuery({ archived: '' }) },
  ].filter(Boolean);

  const first = data ? (data.page - 1) * LIMIT + 1 : 0;
  const last = data ? Math.min(data.page * LIMIT, data.total) : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        eyebrow="Records"
        title="Appointments"
        subtitle={
          isFrontDesk
            ? 'Every provider, every status.'
            : 'Where you are the scheduling or a supporting provider.'
        }
      >
        {data && (
          <span className="tabular rounded-lg border border-rule bg-surface px-3 py-1.5 text-xs text-muted shadow-card">
            {data.total} {data.total === 1 ? 'match' : 'matches'}
          </span>
        )}
      </PageHeader>

      <div className="overflow-hidden rounded-xl border border-rule bg-surface shadow-card">
        <div className="space-y-3 border-b border-rule-soft p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQuery({ q: searchBox.trim() });
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search
                size={15}
                strokeWidth={1.75}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              />
              <Input
                value={searchBox}
                onChange={(e) => setSearchBox(e.target.value)}
                placeholder="Search patient name"
                className="mt-0 pl-9"
                aria-label="Search patient name"
              />
            </div>
            <Button type="submit" variant="secondary">Search</Button>
          </form>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[auto_repeat(4,minmax(0,1fr))] lg:items-center">
            <span className="hidden items-center gap-1.5 pr-1 text-xs text-faint lg:inline-flex">
              <SlidersHorizontal size={13} strokeWidth={1.75} />
              Filters
            </span>
            {isFrontDesk && (
              <Select
                value={query.providerId}
                onChange={(e) => setQuery({ providerId: e.target.value })}
                className="mt-0"
                aria-label="Filter by provider"
              >
                <option value="">All providers</option>
                {providers.map((p) => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </Select>
            )}

            <Select
              value={query.status}
              onChange={(e) => setQuery({ status: e.target.value })}
              className="mt-0"
              aria-label="Filter by status"
            >
              <option value="">All status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>

            <Input
              type="date"
              value={query.from}
              onChange={(e) => setQuery({ from: e.target.value })}
              className="mt-0"
              aria-label="From date"
            />

            <Input
              type="date"
              value={query.to}
              onChange={(e) => setQuery({ to: e.target.value })}
              className="mt-0"
              aria-label="To date"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-surface-sunk px-4 py-2.5">
          {chips.length === 0 ? (
            <p className="text-xs text-faint">
              No filters — showing everything, soonest first.
            </p>
          ) : (
            <>
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  onClick={chip.clear}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface
                             py-1 pl-2.5 pr-2 text-xs font-medium text-ink transition-colors
                             hover:border-accent hover:text-accent"
                >
                  {chip.label}
                  <X size={12} strokeWidth={2.5} className="text-faint" />
                </button>
              ))}
              <button
                onClick={clearAll}
                className="ml-1 text-xs text-muted underline-offset-2 transition-colors hover:text-accent hover:underline"
              >
                Clear all
              </button>
            </>
          )}

          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={query.archived}
              onChange={(e) => setQuery({ archived: e.target.checked ? 'true' : '' })}
              className="size-3.5 accent-(--color-accent)"
            />
            Include archived slots
          </label>
        </div>
      </div>

      <ErrorNote>{error?.message}</ErrorNote>

      <div className="relative overflow-hidden rounded-xl border border-rule bg-surface shadow-card">
        {isFetching && !isLoading && (
          <div className="animate-fade absolute right-4 top-2.5 z-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-rule bg-surface px-2.5 py-1 shadow-card">
              <InlineLoading label="Please wait…" />
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-rule bg-surface-sunk text-xs text-muted">
                <th className="w-1 p-0" aria-hidden />
                <SortHeader field="date" label="Date and time" query={query} onSort={toggleSort} />
                <th className="px-4 py-2.5 font-medium">Patient</th>
                <SortHeader field="provider" label="Provider" query={query} onSort={toggleSort} />
                <SortHeader field="status" label="Status" query={query} onSort={toggleSort} />
                <th className="px-4 py-2.5 text-right font-medium">Duration</th>
                <th className="w-10 px-2 py-2.5" aria-hidden />
              </tr>
            </thead>
            <tbody className={isFetching ? 'opacity-55 transition-opacity' : 'transition-opacity'}>
              {data?.items.map((appt) => (
                <tr
                  key={appt._id}
                  onClick={() => navigate(`/appointments/${appt._id}`)}
                  className="group cursor-pointer border-b border-rule-soft transition-colors
                             last:border-0 hover:bg-accent-soft/50"
                >
                  {/* The status colour repeated as a rule down the row edge, so a
                      page of appointments can be read without going right to the
                      status column for every line. */}
                  <td className="p-0">
                    <span
                      aria-hidden
                      className="block h-9 w-1 rounded-r"
                      style={{ background: STATUS_COLOR[appt.status] }}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="tabular block font-medium">{time(appt.startsAt)}</span>
                    <span className="block text-xs text-faint">{dayLabel(appt.startsAt)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {appt.patientName ? (
                      <span className="flex items-center gap-2.5">
                        <Avatar name={appt.patientName} size="sm" />
                        <span className="font-medium">{appt.patientName}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2.5 text-muted">
                        <span
                          aria-hidden
                          className="flex size-6 items-center justify-center rounded-full border
                                     border-dashed border-rule text-[10px] text-faint"
                        >
                          –
                        </span>
                        Unbooked
                      </span>
                    )}
                    {appt.archivedAt && (
                      <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[10px] text-muted">
                        archived
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{appt.providerName}</td>
                  <td className="px-4 py-3"><StatusBadge status={appt.status} /></td>
                  <td className="tabular px-4 py-3 text-right text-muted">{appt.durationMin}m</td>
                  <td className="px-2 py-3">
                    <ChevronRight
                      size={15}
                      strokeWidth={1.75}
                      className="text-rule transition-colors group-hover:text-accent"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isLoading && <Loading hint="Fetching appointments that match your filters." />}

        {data?.items.length === 0 && (
          <EmptyState
            icon={Search}
            title="No appointments match"
            hint={
              chips.length > 0
                ? 'Try widening the date range or clearing a filter.'
                : 'Create availability to get started.'
            }
            action={
              chips.length > 0 ? (
                <Button variant="secondary" size="sm" onClick={clearAll}>Clear filters</Button>
              ) : null
            }
          />
        )}

        {data && data.items.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-surface-sunk px-4 py-2.5">
            <p className="tabular text-xs text-muted">
              {first}–{last} of {data.total}
              {data.totalPages > 1 && (
                <span className="ml-2 text-faint">page {data.page} of {data.totalPages}</span>
              )}
            </p>
            {data.totalPages > 1 && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => setQuery({ page: data.page - 1 }, { resetPage: false })}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={data.page >= data.totalPages}
                  onClick={() => setQuery({ page: data.page + 1 }, { resetPage: false })}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SortHeader({ field, label, query, onSort }) {
  const active = query.sort === field;
  const Icon = query.dir === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th className="px-4 py-2.5 font-medium">
      <button
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-accent ${
          active ? 'text-accent' : ''
        }`}
        aria-sort={active ? (query.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {label}
        {active && <Icon size={12} strokeWidth={2.5} />}
      </button>
    </th>
  );
}

function niceDate(value) {
  return format(new Date(`${value}T00:00:00`), 'd MMM');
}

function cleaned(query) {
  return Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v != null));
}
