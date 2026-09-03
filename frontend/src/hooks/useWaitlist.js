import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

// Waiting entries, optionally narrowed to the ones whose window covers a day
// and who would accept a given provider — the question the day sheet asks when
// it finds an open slot.
export function useWaitlist({ status = 'WAITING', date, providerId, enabled = true } = {}) {
  return useQuery({
    queryKey: ['waitlist', { status, date: date ?? null, providerId: providerId ?? null }],
    queryFn: () =>
      api
        .get('/waitlist', {
          params: {
            status,
            ...(date ? { date } : {}),
            ...(providerId ? { providerId } : {}),
          },
        })
        .then((r) => r.data),
    enabled,
  });
}

export function useWaitlistMutation({ onError } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ action, id, body }) => {
      if (action === 'add') return api.post('/waitlist', body).then((r) => r.data);
      if (action === 'remove') return api.delete(`/waitlist/${id}`).then((r) => r.data);
      if (action === 'place') return api.post(`/waitlist/${id}/place`, body).then((r) => r.data);
      throw new Error(`Unknown waitlist action: ${action}`);
    },
    // Placing someone books a real slot, so the schedule, the dashboard and the
    // unconfirmed alerts all move at the same time as the list itself.
    onSuccess: () => {
      for (const key of ['waitlist', 'day', 'appointments', 'dashboard', 'alerts']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError,
  });
}
