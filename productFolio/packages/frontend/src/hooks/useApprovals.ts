import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';
import type {
  ApprovalPolicy,
  ApprovalRequest,
  ApprovalDelegation,
  ChainStep,
  PaginatedResponse,
  ApprovalScope,
  ApprovalRequestStatus,
  AuditEvent,
} from '../types';

// ============================================================================
// Query Keys
// ============================================================================

export const approvalKeys = {
  all: ['approvals'] as const,
  policies: (nodeId: string) => [...approvalKeys.all, 'policies', nodeId] as const,
  requests: () => [...approvalKeys.all, 'requests'] as const,
  requestList: (filters: Record<string, unknown>) => [...approvalKeys.requests(), filters] as const,
  request: (id: string) => [...approvalKeys.all, 'request', id] as const,
  inbox: (filters?: Record<string, unknown>) => [...approvalKeys.all, 'inbox', filters] as const,
  myRequests: (filters?: Record<string, unknown>) => [...approvalKeys.all, 'my', filters] as const,
  preview: () => [...approvalKeys.all, 'preview'] as const,
  delegations: () => [...approvalKeys.all, 'delegations'] as const,
  audit: (filters?: Record<string, unknown>) => [...approvalKeys.all, 'audit', filters] as const,
};

// ============================================================================
// Policy Queries & Mutations
// ============================================================================

export function useNodePolicies(nodeId: string) {
  return useQuery({
    queryKey: approvalKeys.policies(nodeId),
    queryFn: () => api.get<ApprovalPolicy[]>(`/org/nodes/${nodeId}/policies`),
    enabled: !!nodeId,
  });
}

export function useCreatePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, ...data }: {
      nodeId: string;
      scope: ApprovalScope;
      level: number;
      ruleType: string;
      ruleConfig?: Record<string, unknown>;
      crossBuStrategy?: string;
    }) => api.post<ApprovalPolicy>(`/org/nodes/${nodeId}/policies`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      toast.success('Approval policy created');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create policy');
    },
  });
}

export function useUpdatePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: string;
      ruleType?: string;
      ruleConfig?: Record<string, unknown>;
      crossBuStrategy?: string;
      isActive?: boolean;
    }) => api.put<ApprovalPolicy>(`/approval-policies/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      toast.success('Policy updated');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update policy');
    },
  });
}

export function useDeletePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/approval-policies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      toast.success('Policy deactivated');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to deactivate policy');
    },
  });
}

// ============================================================================
// Chain Preview
// ============================================================================

export function usePreviewChain() {
  return useMutation({
    mutationFn: (data: {
      scope: ApprovalScope;
      subjectType: 'allocation' | 'initiative' | 'scenario';
      subjectId: string;
    }) => api.post<{ chain: ChainStep[] }>('/approval-policies/preview', data),
  });
}

// ============================================================================
// Request Queries & Mutations
// ============================================================================

export function useApprovalRequests(filters?: {
  scope?: ApprovalScope;
  subjectType?: string;
  subjectId?: string;
  status?: ApprovalRequestStatus;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.scope) params.set('scope', filters.scope);
  if (filters?.subjectType) params.set('subjectType', filters.subjectType);
  if (filters?.subjectId) params.set('subjectId', filters.subjectId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: approvalKeys.requestList(filters ?? {}),
    queryFn: () => api.get<PaginatedResponse<ApprovalRequest>>(`/approval-requests${qs ? `?${qs}` : ''}`),
  });
}

export function useApprovalRequest(id: string) {
  return useQuery({
    queryKey: approvalKeys.request(id),
    queryFn: () => api.get<ApprovalRequest>(`/approval-requests/${id}`),
    enabled: !!id,
  });
}

export function useApproverInbox(filters?: {
  scope?: ApprovalScope;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.scope) params.set('scope', filters.scope);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: approvalKeys.inbox(filters),
    queryFn: () => api.get<PaginatedResponse<ApprovalRequest>>(`/approval-requests/inbox${qs ? `?${qs}` : ''}`),
  });
}

export function useMyRequests(filters?: {
  status?: ApprovalRequestStatus;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: approvalKeys.myRequests(filters),
    queryFn: () => api.get<PaginatedResponse<ApprovalRequest>>(`/approval-requests/my${qs ? `?${qs}` : ''}`),
  });
}

export function useCreateApprovalRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      scope: ApprovalScope;
      subjectType: 'allocation' | 'initiative' | 'scenario';
      subjectId: string;
      snapshotContext?: Record<string, unknown>;
      expiresAt?: string;
    }) => api.post<ApprovalRequest>('/approval-requests', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      toast.success('Approval request created');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create approval request');
    },
  });
}

export function useSubmitDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, ...data }: {
      requestId: string;
      decision: 'APPROVED' | 'REJECTED';
      comments?: string;
    }) => api.post<{ request: ApprovalRequest; decision: unknown; advanced: boolean }>(
      `/approval-requests/${requestId}/decide`,
      data,
    ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      const status = result.request?.status;
      if (status === 'APPROVED') {
        toast.success('Request approved');
      } else if (status === 'REJECTED') {
        toast.info('Request rejected');
      } else {
        toast.success('Decision recorded');
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to submit decision');
    },
  });
}

export function useCancelRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) =>
      api.post<ApprovalRequest>(`/approval-requests/${requestId}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      toast.info('Request cancelled');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to cancel request');
    },
  });
}

// ============================================================================
// Delegation Queries & Mutations
// ============================================================================

export function useActiveDelegations() {
  return useQuery({
    queryKey: approvalKeys.delegations(),
    queryFn: () => api.get<ApprovalDelegation[]>('/delegations'),
  });
}

export function useCreateDelegation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      delegatorId: string;
      delegateId: string;
      scope?: ApprovalScope;
      orgNodeId?: string;
      effectiveStart: string;
      effectiveEnd: string;
      reason?: string;
    }) => api.post<ApprovalDelegation>('/delegations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.delegations() });
      toast.success('Delegation created');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create delegation');
    },
  });
}

export function useRevokeDelegation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApprovalDelegation>(`/delegations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.delegations() });
      toast.success('Delegation revoked');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to revoke delegation');
    },
  });
}

// ============================================================================
// Audit Queries
// ============================================================================

export function useAuditEvents(filters?: {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.entityType) params.set('entityType', filters.entityType);
  if (filters?.entityId) params.set('entityId', filters.entityId);
  if (filters?.actorId) params.set('actorId', filters.actorId);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: approvalKeys.audit(filters),
    queryFn: () => api.get<PaginatedResponse<AuditEvent>>(`/audit${qs ? `?${qs}` : ''}`),
  });
}
