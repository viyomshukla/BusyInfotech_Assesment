import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

const REFRESH_MS = 60_000;

export function useAlerts({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.get('/dashboard/alerts').then((r) => r.data),
    refetchInterval: REFRESH_MS,
    enabled,
  });
}
