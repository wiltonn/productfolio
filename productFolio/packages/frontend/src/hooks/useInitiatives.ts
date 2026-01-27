import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

// Types matching backend
export interface Initiative {
  id: string;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED';
  priority: number | null;
  ownerId: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface InitiativeFilters {
  page?: number;
  limit?: number;
  status?: Initiative['status'];
  search?: string;
}

// Query keys
export const initiativeKeys = {
  all: ['initiatives'] as const,
  lists: () => [...initiativeKeys.all, 'list'] as const,
  list: (filters: InitiativeFilters) => [...initiativeKeys.lists(), filters] as const,
  details: () => [...initiativeKeys.all, 'detail'] as const,
  detail: (id: string) => [...initiativeKeys.details(), id] as const,
};

// Hooks
export function useInitiatives(filters: InitiativeFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);

  const queryString = params.toString();
  const endpoint = `/initiatives${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: initiativeKeys.list(filters),
    queryFn: () => api.get<PaginatedResponse<Initiative>>(endpoint),
  });
}

export function useInitiative(id: string) {
  return useQuery({
    queryKey: initiativeKeys.detail(id),
    queryFn: () => api.get<Initiative>(`/initiatives/${id}`),
    enabled: !!id,
  });
}

export function useCreateInitiative() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Initiative>) =>
      api.post<Initiative>('/initiatives', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: initiativeKeys.lists() });
    },
  });
}

export function useUpdateInitiative() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Initiative> }) =>
      api.patch<Initiative>(`/initiatives/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: initiativeKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: initiativeKeys.lists() });
    },
  });
}

export function useDeleteInitiative() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/initiatives/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: initiativeKeys.lists() });
    },
  });
}
