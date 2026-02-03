import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { IntakeItem, IntakeStats, IntakeFilters } from '../types/intake';
import type { PaginatedResponse } from '../types';

export const intakeKeys = {
  all: ['intake'] as const,
  lists: () => [...intakeKeys.all, 'list'] as const,
  list: (filters: IntakeFilters) => [...intakeKeys.lists(), filters] as const,
  details: () => [...intakeKeys.all, 'detail'] as const,
  detail: (id: string) => [...intakeKeys.details(), id] as const,
  stats: () => [...intakeKeys.all, 'stats'] as const,
};

export function useIntakeItems(filters: IntakeFilters = {}) {
  return useQuery({
    queryKey: intakeKeys.list(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));
      if (filters.search) params.set('search', filters.search);
      if (filters.statusCategory) params.set('statusCategory', filters.statusCategory);
      if (filters.priorityName) params.set('priorityName', filters.priorityName);
      if (filters.siteId) params.set('siteId', filters.siteId);
      if (filters.projectKey) params.set('projectKey', filters.projectKey);
      if (filters.linked) params.set('linked', filters.linked);
      if (filters.itemStatus) params.set('itemStatus', filters.itemStatus);
      if (filters.sortBy) params.set('sortBy', filters.sortBy);
      if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
      return api.get<PaginatedResponse<IntakeItem>>(`/intake?${params.toString()}`);
    },
    staleTime: 30_000,
  });
}

export function useIntakeItem(id: string) {
  return useQuery({
    queryKey: intakeKeys.detail(id),
    queryFn: () => api.get<IntakeItem>(`/intake/${id}`),
    enabled: !!id,
  });
}

export function useIntakeStats() {
  return useQuery({
    queryKey: intakeKeys.stats(),
    queryFn: () => api.get<IntakeStats>('/intake/stats'),
    staleTime: 60_000,
  });
}
