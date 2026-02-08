import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { OrgNode } from '../types';

export const portfolioAreaNodeKeys = {
  all: ['portfolioAreaNodes'] as const,
  list: () => [...portfolioAreaNodeKeys.all, 'list'] as const,
};

export function usePortfolioAreaNodes() {
  return useQuery({
    queryKey: portfolioAreaNodeKeys.list(),
    queryFn: () => api.get<OrgNode[]>('/org/portfolio-areas'),
    staleTime: 60_000,
  });
}
