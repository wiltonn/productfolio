import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';
import type { PortfolioArea, PaginatedResponse } from '../types';

export const portfolioAreaKeys = {
  all: ['portfolioAreas'] as const,
  lists: () => [...portfolioAreaKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...portfolioAreaKeys.lists(), filters] as const,
};

export function usePortfolioAreas() {
  return useQuery({
    queryKey: portfolioAreaKeys.list(),
    queryFn: () => api.get<PaginatedResponse<PortfolioArea>>('/portfolio-areas?limit=100'),
    staleTime: 60_000,
  });
}

export function useCreatePortfolioArea() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string }) =>
      api.post<PortfolioArea>('/portfolio-areas', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portfolioAreaKeys.lists() });
      toast.success('Portfolio area created');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create portfolio area');
    },
  });
}

export function useUpdatePortfolioArea() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string } }) =>
      api.put<PortfolioArea>(`/portfolio-areas/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portfolioAreaKeys.lists() });
      toast.success('Portfolio area updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update portfolio area');
    },
  });
}

export function useDeletePortfolioArea() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ success: boolean }>(`/portfolio-areas/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portfolioAreaKeys.lists() });
      toast.success('Portfolio area deleted');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete portfolio area');
    },
  });
}
