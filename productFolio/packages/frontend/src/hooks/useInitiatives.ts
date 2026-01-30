import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';
import type { Initiative, InitiativeFilters, PaginatedResponse, InitiativeStatus, BulkUpdateResult, InitiativeAllocation, InitiativeAllocationHours } from '../types';

// Query keys
export const initiativeKeys = {
  all: ['initiatives'] as const,
  lists: () => [...initiativeKeys.all, 'list'] as const,
  list: (filters: InitiativeFilters) => [...initiativeKeys.lists(), filters] as const,
  details: () => [...initiativeKeys.all, 'detail'] as const,
  detail: (id: string) => [...initiativeKeys.details(), id] as const,
  allocations: (id: string) => [...initiativeKeys.all, 'allocations', id] as const,
  allocationHours: (ids: string[], datesKey: string) => [...initiativeKeys.all, 'allocationHours', ids, datesKey] as const,
};

// Hooks
export function useInitiatives(filters: InitiativeFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.status) {
    if (Array.isArray(filters.status)) {
      filters.status.forEach((s) => params.append('status', s));
    } else {
      params.set('status', filters.status);
    }
  }
  if (filters.search) params.set('search', filters.search);
  if (filters.targetQuarter) params.set('targetQuarter', filters.targetQuarter);
  if (filters.businessOwnerId) params.set('businessOwnerId', filters.businessOwnerId);
  if (filters.productOwnerId) params.set('productOwnerId', filters.productOwnerId);

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

export function useInitiativeAllocationsAll(initiativeId: string) {
  return useQuery({
    queryKey: initiativeKeys.allocations(initiativeId),
    queryFn: () => api.get<InitiativeAllocation[]>(`/initiatives/${initiativeId}/allocations`),
    enabled: !!initiativeId,
  });
}

export function useInitiativeAllocationHours(
  initiativeIds: string[],
  currentQuarterStart: string,
  currentQuarterEnd: string,
  nextQuarterStart: string,
  nextQuarterEnd: string
) {
  const params = new URLSearchParams({
    initiativeIds: initiativeIds.join(','),
    currentQuarterStart,
    currentQuarterEnd,
    nextQuarterStart,
    nextQuarterEnd,
  });

  const datesKey = `${currentQuarterStart}-${currentQuarterEnd}-${nextQuarterStart}-${nextQuarterEnd}`;

  return useQuery({
    queryKey: initiativeKeys.allocationHours(initiativeIds, datesKey),
    queryFn: () =>
      api.get<Record<string, InitiativeAllocationHours>>(`/initiatives/allocation-hours?${params}`),
    enabled: initiativeIds.length > 0,
    staleTime: 30_000,
  });
}

export function useCreateInitiative() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Initiative>) =>
      api.post<Initiative>('/initiatives', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: initiativeKeys.lists() });
      toast.success('Initiative created successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create initiative');
    },
  });
}

export function useUpdateInitiative() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Initiative> }) =>
      api.put<Initiative>(`/initiatives/${id}`, data),
    onMutate: async ({ id, data }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: initiativeKeys.detail(id) });

      // Snapshot the previous value
      const previousInitiative = queryClient.getQueryData<Initiative>(initiativeKeys.detail(id));

      // Optimistically update
      if (previousInitiative) {
        queryClient.setQueryData<Initiative>(initiativeKeys.detail(id), {
          ...previousInitiative,
          ...data,
          updatedAt: new Date().toISOString(),
        });
      }

      return { previousInitiative };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousInitiative) {
        queryClient.setQueryData(initiativeKeys.detail(variables.id), context.previousInitiative);
      }
      toast.error(error instanceof Error ? error.message : 'Failed to update initiative');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: initiativeKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: initiativeKeys.lists() });
      toast.success('Initiative updated successfully');
    },
  });
}

export function useUpdateInitiativeStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: InitiativeStatus }) =>
      api.post<Initiative>(`/initiatives/${id}/status`, { newStatus: status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: initiativeKeys.detail(id) });
      const previousInitiative = queryClient.getQueryData<Initiative>(initiativeKeys.detail(id));

      if (previousInitiative) {
        queryClient.setQueryData<Initiative>(initiativeKeys.detail(id), {
          ...previousInitiative,
          status,
          updatedAt: new Date().toISOString(),
        });
      }

      return { previousInitiative };
    },
    onError: (error, variables, context) => {
      if (context?.previousInitiative) {
        queryClient.setQueryData(initiativeKeys.detail(variables.id), context.previousInitiative);
      }
      toast.error(error instanceof Error ? error.message : 'Failed to update status');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: initiativeKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: initiativeKeys.lists() });
      toast.success('Status updated successfully');
    },
  });
}

export function useBulkUpdateStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: InitiativeStatus }) =>
      api.patch<BulkUpdateResult>('/initiatives/bulk', { ids, updates: { status } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: initiativeKeys.all });
      if (result.failed > 0) {
        toast.warning(`Updated ${result.updated} initiatives, ${result.failed} failed`);
      } else {
        toast.success(`Updated ${result.updated} initiatives`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update initiatives');
    },
  });
}

export function useBulkAddTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, tags }: { ids: string[]; tags: string[] }) =>
      api.patch<BulkUpdateResult>('/initiatives/bulk', { ids, updates: { tags } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: initiativeKeys.all });
      toast.success(`Added tags to ${result.updated} initiatives`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add tags');
    },
  });
}

export function useDeleteInitiative() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/initiatives/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: initiativeKeys.lists() });
      toast.success('Initiative deleted successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete initiative');
    },
  });
}

export function useBulkDeleteInitiatives() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) =>
      api.post<BulkUpdateResult>('/initiatives/bulk-delete', { ids }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: initiativeKeys.all });
      toast.success(`Deleted ${result.updated} initiatives`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete initiatives');
    },
  });
}

export function useExportInitiatives() {
  return useMutation({
    mutationFn: async (filters: InitiativeFilters) => {
      const params = new URLSearchParams();
      if (filters.status) {
        if (Array.isArray(filters.status)) {
          filters.status.forEach((s) => params.append('status', s));
        } else {
          params.set('status', filters.status);
        }
      }
      if (filters.search) params.set('search', filters.search);
      if (filters.targetQuarter) params.set('targetQuarter', filters.targetQuarter);

      const queryString = params.toString();
      const endpoint = `/initiatives/export${queryString ? `?${queryString}` : ''}`;

      // This will return a blob for download
      const response = await fetch(`/api${endpoint}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `initiatives-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast.success('Export downloaded successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to export initiatives');
    },
  });
}

// CSV Import hook
export function useImportInitiatives() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      data,
      async: useAsync,
      fileName,
    }: {
      data: Array<Record<string, string>>;
      async?: boolean;
      fileName?: string;
    }) => {
      const response = await api.post<{
        message?: string;
        jobId?: string;
        totalRows: number;
        async: boolean;
        imported?: number;
        failed?: number;
        errors?: Array<{ row: number; message: string }>;
      }>('/initiatives/import', { data, async: useAsync, fileName });

      return response;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: initiativeKeys.lists() });
      if (result.async) {
        toast.info(`Import job queued (${result.totalRows} rows). Job ID: ${result.jobId}`);
      } else if (result.failed && result.failed > 0) {
        toast.warning(`Imported ${result.imported} initiatives, ${result.failed} failed`);
      } else {
        toast.success(`Successfully imported ${result.imported} initiatives`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to import initiatives');
    },
  });
}
