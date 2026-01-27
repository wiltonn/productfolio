import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';
import { initiativeKeys } from './useInitiatives';

export interface ScopeItem {
  id: string;
  initiativeId: string;
  title: string;
  description: string | null;
  estimateP50: number | null;
  estimateP90: number | null;
  skillDemands: Record<string, number>;
  status: 'DRAFT' | 'APPROVED' | 'REJECTED';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalHistoryEntry {
  id: string;
  initiativeId: string;
  action: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  notes: string | null;
  approverId: string | null;
  version: number;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const scopingKeys = {
  all: ['scoping'] as const,
  scopeItems: (initiativeId: string) => [...scopingKeys.all, 'scope-items', initiativeId] as const,
  scopeItemsList: (initiativeId: string, page?: number) =>
    [...scopingKeys.scopeItems(initiativeId), 'list', page] as const,
  scopeItemDetail: (id: string) => [...scopingKeys.all, 'scope-item', id] as const,
  approvalHistory: (initiativeId: string) =>
    [...scopingKeys.all, 'approval-history', initiativeId] as const,
};

// Scope Items hooks
export function useScopeItems(
  initiativeId: string,
  options: { page?: number; limit?: number } = {}
) {
  const params = new URLSearchParams();
  if (options.page) params.set('page', String(options.page));
  if (options.limit) params.set('limit', String(options.limit));
  const queryString = params.toString();

  return useQuery({
    queryKey: scopingKeys.scopeItemsList(initiativeId, options.page),
    queryFn: () =>
      api.get<PaginatedResponse<ScopeItem>>(
        `/initiatives/${initiativeId}/scope-items${queryString ? `?${queryString}` : ''}`
      ),
    enabled: !!initiativeId,
  });
}

export function useScopeItem(id: string) {
  return useQuery({
    queryKey: scopingKeys.scopeItemDetail(id),
    queryFn: () => api.get<ScopeItem>(`/scope-items/${id}`),
    enabled: !!id,
  });
}

export function useCreateScopeItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      initiativeId,
      data,
    }: {
      initiativeId: string;
      data: {
        title: string;
        description?: string;
        estimateP50?: number;
        estimateP90?: number;
        skillDemands?: Record<string, number>;
      };
    }) => api.post<ScopeItem>(`/initiatives/${initiativeId}/scope-items`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: scopingKeys.scopeItems(variables.initiativeId),
      });
      toast.success('Scope item created successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create scope item');
    },
  });
}

export function useUpdateScopeItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      initiativeId,
      data,
    }: {
      id: string;
      initiativeId: string;
      data: Partial<{
        title: string;
        description: string;
        estimateP50: number;
        estimateP90: number;
        skillDemands: Record<string, number>;
      }>;
    }) => api.put<ScopeItem>(`/scope-items/${id}`, data).then((result) => ({ result, id, initiativeId })),
    onSuccess: ({ id, initiativeId }) => {
      queryClient.invalidateQueries({ queryKey: scopingKeys.scopeItemDetail(id) });
      queryClient.invalidateQueries({
        queryKey: scopingKeys.scopeItems(initiativeId),
      });
      toast.success('Scope item updated successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update scope item');
    },
  });
}

export function useDeleteScopeItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, initiativeId }: { id: string; initiativeId: string }) =>
      api.delete(`/scope-items/${id}`).then(() => ({ initiativeId })),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: scopingKeys.scopeItems(result.initiativeId),
      });
      toast.success('Scope item deleted successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete scope item');
    },
  });
}

// Approval workflow hooks
export function useSubmitForApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ initiativeId, notes }: { initiativeId: string; notes?: string }) =>
      api.post(`/initiatives/${initiativeId}/submit-approval`, { notes }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: initiativeKeys.detail(variables.initiativeId) });
      queryClient.invalidateQueries({ queryKey: initiativeKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: scopingKeys.approvalHistory(variables.initiativeId),
      });
      toast.success('Initiative submitted for approval');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to submit for approval');
    },
  });
}

export function useApproveInitiative() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      initiativeId,
      approverId,
      notes,
    }: {
      initiativeId: string;
      approverId: string;
      notes?: string;
    }) => api.post(`/initiatives/${initiativeId}/approve`, { approverId, notes }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: initiativeKeys.detail(variables.initiativeId) });
      queryClient.invalidateQueries({ queryKey: initiativeKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: scopingKeys.approvalHistory(variables.initiativeId),
      });
      toast.success('Initiative approved');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to approve initiative');
    },
  });
}

export function useRejectInitiative() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ initiativeId, notes }: { initiativeId: string; notes?: string }) =>
      api.post(`/initiatives/${initiativeId}/reject`, { notes }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: initiativeKeys.detail(variables.initiativeId) });
      queryClient.invalidateQueries({ queryKey: initiativeKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: scopingKeys.approvalHistory(variables.initiativeId),
      });
      toast.success('Initiative rejected');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to reject initiative');
    },
  });
}

export function useApprovalHistory(initiativeId: string) {
  return useQuery({
    queryKey: scopingKeys.approvalHistory(initiativeId),
    queryFn: () => api.get<ApprovalHistoryEntry[]>(`/initiatives/${initiativeId}/approval-history`),
    enabled: !!initiativeId,
  });
}
