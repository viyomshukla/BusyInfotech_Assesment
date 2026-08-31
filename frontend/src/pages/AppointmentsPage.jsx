import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useProviders } from '../hooks/useProviders';
import {
  Button, Input, Select, StatusBadge, EmptyState, Loading, InlineLoading, ErrorNote, PageHeader,
} from '../components/ui';
import { time, dayLabel, STATUS_LABEL } from '../lib/format';

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

  const activeFilters =
    query.q || query.providerId || query.status || query.from || query.to || query.archived;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Appointments"
        subtitle={
          isFrontDesk
            ? 'Every provider, every status.'
            : 'Where you are the scheduling or a supporting provider.'
        }
      >
        {data && (
          <span className="tabular rounded-full bg-surface px-3 py-1.5 text-xs text-muted shadow-card">
            {data.total} {data.total === 1 ? 'match' : 'matches'}
          </span>
        )}
      </PageHeader>

      <div className="rounded-xl border border-rule bg-surface p-4 shadow-card">
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
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
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

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={query.archived}
            onChange={(e) => setQuery({ archived: e.target.checked ? 'true' : '' })}
            className="size-3.5 accent-(--color-accent)"
          />
          Include archived slots
        </label>

        {activeFilters && (
          <button
            onClick={clearAll}
            className="mt-3 inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-accent"
          >
            <X size={13} strokeWidth={2} />
            Clear filters
          </button>
        )}
      </div>

      <ErrorNote>{error?.message}</ErrorNote>

      <div className="relative overflow-hidden rounded-xl border border-rule bg-surface shadow-card">
        {isFetching && !isLoading && (
          <div className="animate-fade absolute right-4 top-3 z-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-rule bg-surface px-2.5 py-1 shadow-card">
              <InlineLoading label="Please wait…" />
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper/60 text-xs text-muted">
                <SortHeader field="date" label="Date and time" query={query} onSort={toggleSort} />
                <th className="px-4 py-2.5 font-medium">Patient</th>
                <SortHeader field="provider" label="Provider" query={query} onSort={toggleSort} />
                <SortHeader field="status" label="Status" query={query} onSort={toggleSort} />
                <th className="px-4 py-2.5 text-right font-medium">Duration</th>
              </tr>
            </thead>
            <tbody className={isFetching ? 'opacity-55 transition-opacity' : 'transition-opacity'}>
              {data?.items.map((appt) => (
                <tr
                  key={appt._id}
                  onClick={() => navigate(`/appointments/${appt._id}`)}
                  className="cursor-pointer border-b border-rule-soft transition-colors last:border-0 hover:bg-accent-soft/60"
                >
                  <td className="whitespace-nowrap px-4 py-3.5">
                    <span className="tabular font-medium">{time(appt.startsAt)}</span>
                    <span className="ml-2 text-xs text-faint">{dayLabel(appt.startsAt)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {appt.patientName ?? <span className="text-muted">Unbooked</span>}
                    {appt.archivedAt && (
                      <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[10px] text-muted">
                        archived
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-muted">{appt.providerName}</td>
                  <td className="px-4 py-3"><StatusBadge status={appt.status} /></td>
                  <td className="tabular px-4 py-3 text-right text-muted">{appt.durationMin}m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isLoading && <Loading hint="Fetching appointments that match your filters." />}

        {data?.items.length === 0 && (
          <EmptyState
            title="No appointments match"
            hint={
              activeFilters
                ? 'Try widening the date range or clearing a filter.'
                : 'Create availability to get started.'
            }
            action={
              activeFilters ? (
                <Button variant="secondary" size="sm" onClick={clearAll}>Clear filters</Button>
              ) : null
            }
          />
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="tabular text-xs text-muted">
            Page {data.page} of {data.totalPages}
          </p>
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
        </div>
      )}
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

function cleaned(query) {
  return Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v != null));
}