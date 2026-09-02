import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: () => api.get('/users/providers').then((r) => r.data),
    staleTime: 5 * 60_000,
    // Exempt from the app-wide live polling: staff are added a few times a
    // year, and a request every 15 seconds to learn that buys nothing.
    refetchInterval: false,
  });
}