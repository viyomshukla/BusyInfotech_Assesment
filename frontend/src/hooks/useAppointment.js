import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useAppointment(id) {
  return useQuery({
    queryKey: ['appointment', id],
    queryFn: () => api.get(`/appointments/${id}`).then((r) => r.data),
    enabled: Boolean(id),
  });
}

export function useAppointmentMutation(id, { onError } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ path, method = 'post', body }) =>
      api[method](`/appointments/${id}${path}`, body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointment', id] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError,
  });
}