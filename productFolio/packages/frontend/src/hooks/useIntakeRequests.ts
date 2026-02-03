import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';
import type {
  IntakeRequest,
  IntakeRequestFilters,
  IntakeRequestStats,
  PipelineStats,
  CreateIntakeRequestInput,
  ConvertToInitiativeInput,
} from '../types/intake-request';
import type { PaginatedResponse, Initiative } from '../types';

// Query keys
export const intakeRequestKeys = {
  all: ['intake-requests'] as const,
  lists: () => [...intakeRequestKeys.all, 'list'] as const,
  list: (filters: IntakeRequestFilters) =>
    [...intakeRequestKeys.lists(), filters] as const,
  details: () => [...intakeRequestKeys.all, 'detail'] as const,
  detail: (id: string) => [...intakeRequestKeys.details(), id] as const,
  stats: () => [...intakeRequestKeys.all, 'stats'] as const,
  pipeline: (periodId?: string) =>
    [...intakeRequestKeys.all, 'pipeline', periodId] as const,
};

// List intake requests
export function useIntakeRequests(filters: IntakeRequestFilters = {}) {
  return useQuery({
    queryKey: intakeRequestKeys.list(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));
      if (filters.status) params.set('status', filters.status);
      if (filters.portfolioAreaId)
        params.set('portfolioAreaId', filters.portfolioAreaId);
      if (filters.targetQuarter)
        params.set('targetQuarter', filters.targetQuarter);
      if (filters.requestedById)
        params.set('requestedById', filters.requestedById);
      if (filters.sponsorId) params.set('sponsorId', filters.sponsorId);
      if (filters.sourceType) params.set('sourceType', filters.sourceType);
      if (filters.search) params.set('search', filters.search);
      return api.get<PaginatedResponse<IntakeRequest>>(
        `/intake-requests?${params.toString()}`
      );
    },
  });
}

// Get single intake request
export function useIntakeRequest(id: string) {
  return useQuery({
    queryKey: intakeRequestKeys.detail(id),
    queryFn: () => api.get<IntakeRequest>(`/intake-requests/${id}`),
    enabled: !!id,
  });
}

// Get stats
export function useIntakeRequestStats() {
  return useQuery({
    queryKey: intakeRequestKeys.stats(),
    queryFn: () => api.get<IntakeRequestStats>('/intake-requests/stats'),
    staleTime: 60_000,
  });
}

// Get pipeline stats
export function usePipelineStats(periodId?: string) {
  return useQuery({
    queryKey: intakeRequestKeys.pipeline(periodId),
    queryFn: () => {
      const params = periodId ? `?periodId=${periodId}` : '';
      return api.get<PipelineStats>(`/intake-requests/pipeline${params}`);
    },
    staleTime: 60_000,
  });
}

// Create intake request
export function useCreateIntakeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateIntakeRequestInput) =>
      api.post<IntakeRequest>('/intake-requests', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: intakeRequestKeys.lists() });
      queryClient.invalidateQueries({ queryKey: intakeRequestKeys.stats() });
      toast.success('Intake request created');
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Failed to create intake request'
      );
    },
  });
}

// Update intake request
export function useUpdateIntakeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateIntakeRequestInput>;
    }) => api.put<IntakeRequest>(`/intake-requests/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: intakeRequestKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: intakeRequestKeys.lists() });
      toast.success('Intake request updated');
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update intake request'
      );
    },
  });
}

// Delete intake request
export function useDeleteIntakeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/intake-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: intakeRequestKeys.lists() });
      queryClient.invalidateQueries({ queryKey: intakeRequestKeys.stats() });
      toast.success('Intake request deleted');
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete intake request'
      );
    },
  });
}

// Transition status
export function useTransitionIntakeRequestStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      newStatus,
      closedReason,
      decisionNotes,
    }: {
      id: string;
      newStatus: string;
      closedReason?: string;
      decisionNotes?: string;
    }) =>
      api.post<IntakeRequest>(`/intake-requests/${id}/status`, {
        newStatus,
        closedReason,
        decisionNotes,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: intakeRequestKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: intakeRequestKeys.lists() });
      queryClient.invalidateQueries({ queryKey: intakeRequestKeys.stats() });
      toast.success(`Status updated to ${variables.newStatus}`);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update status'
      );
    },
  });
}

// Convert to initiative
export function useConvertToInitiative() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: ConvertToInitiativeInput;
    }) =>
      api.post<{ initiative: Initiative; intakeRequest: IntakeRequest }>(
        `/intake-requests/${id}/convert`,
        data
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: intakeRequestKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: intakeRequestKeys.lists() });
      queryClient.invalidateQueries({ queryKey: intakeRequestKeys.stats() });
      queryClient.invalidateQueries({
        queryKey: intakeRequestKeys.pipeline(),
      });
      // Also invalidate initiatives list
      queryClient.invalidateQueries({ queryKey: ['initiatives', 'list'] });
      toast.success('Intake request converted to initiative');
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to convert to initiative'
      );
    },
  });
}
