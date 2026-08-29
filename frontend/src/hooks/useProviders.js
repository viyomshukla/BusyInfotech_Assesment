import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: () => api.get('/users/providers').then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}