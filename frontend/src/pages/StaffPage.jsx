import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, ShieldCheck, Stethoscope } from 'lucide-react';
import { api } from '../lib/api';
import {
  Button, Panel, PageHeader, Field, Input, Modal, Loading, ErrorNote, EmptyState,
} from '../components/ui';
import { dateTime } from '../lib/format';

const EMPTY = { name: '', email: '', password: '' };

export default function StaffPage() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const queryClient = useQueryClient();

  const { data: staff = [], isLoading, error: loadError } = useQuery({
    queryKey: ['staff'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });

  const addProvider = useMutation({
    mutationFn: (body) => api.post('/auth/register', { ...body, role: 'PROVIDER' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      setForm(EMPTY);
      setOpen(false);
    },
    onError: (err) => setError(err.message),
  });

  const frontDesk = staff.filter((u) => u.role === 'FRONT_DESK');
  const providers = staff.filter((u) => u.role === 'PROVIDER');

  function close() {
    setForm(EMPTY);
    setError(null);
    setOpen(false);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Staff"
        subtitle="Providers can be added at any time. The clinic runs a single front-desk account."
      >
        <Button size="sm" onClick={() => setOpen(true)}>
          <UserPlus size={14} strokeWidth={2} /> Add provider
        </Button>
      </PageHeader>

      <ErrorNote>{loadError?.message}</ErrorNote>

      <Panel
        title="Front desk"
        action={<span className="text-xs text-faint">Fixed at one account</span>}
      >
        {isLoading ? (
          <Loading className="py-10" hint="Loading the staff directory." />
        ) : (
          <ul className="divide-y divide-rule-soft">
            {frontDesk.map((u) => (
              <StaffRow key={u._id} user={u} icon={ShieldCheck} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Providers"
        action={<span className="tabular text-xs text-faint">{providers.length}</span>}
      >
        {isLoading ? (
          <Loading className="py-10" hint="Loading provider accounts." />
        ) : providers.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No providers yet"
            hint="Add a provider to start building their availability."
            action={<Button size="sm" onClick={() => setOpen(true)}>Add provider</Button>}
          />
        ) : (
          <ul className="divide-y divide-rule-soft">
            {providers.map((u) => (
              <StaffRow key={u._id} user={u} icon={Stethoscope} />
            ))}
          </ul>
        )}
      </Panel>

      <Modal open={open} title="Add a provider" onClose={close}>
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            addProvider.mutate({
              name: form.name.trim(),
              email: form.email.trim().toLowerCase(),
              password: form.password,
            });
          }}
        >
          <Field label="Full name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Dr Rao"
              required
            />
          </Field>

          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="drrao@clinic.test"
              required
            />
          </Field>

          <Field label="Temporary password" hint="At least 8 characters. Share it with them directly.">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={8}
              required
            />
          </Field>

          <p className="text-xs text-muted">
            New accounts are always providers — they will see only their own schedule.
          </p>

          <ErrorNote>{error}</ErrorNote>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={close}>Cancel</Button>
            <Button type="submit" size="sm" loading={addProvider.isPending}>
              {addProvider.isPending ? 'Please wait…' : 'Add provider'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function StaffRow({ user, icon: Icon }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon size={15} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted">{user.email}</p>
      </div>
      <span className="tabular hidden shrink-0 text-xs text-faint sm:block">
        added {dateTime(user.createdAt)}
      </span>
    </li>
  );
}
