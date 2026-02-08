import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';
import type {
  ApprovalRequest,
  ApprovalRequestStatus,
  ApprovalScope,
  PaginatedResponse,
} from '../types';

// ============================================================================
// Query Keys
// ============================================================================

export const approvalStatusKeys = {
  all: ['approvalStatus'] as const,
  subject: (subjectType: string, subjectId: string) =>
    [...approvalStatusKeys.all, subjectType, subjectId] as const,
};

// ============================================================================
// Types
// ============================================================================

export interface ApprovalStatusResult {
  status: 'none' | 'pending' | 'approved' | 'rejected' | 'requires_approval';
  pendingRequest: ApprovalRequest | null;
  latestRequest: ApprovalRequest | null;
  isBlocking: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useApprovalStatus(subjectType: string, subjectId: string) {
  const query = useQuery({
    queryKey: approvalStatusKeys.subject(subjectType, subjectId),
    queryFn: async (): Promise<ApprovalStatusResult> => {
      const response = await api.get<PaginatedResponse<ApprovalRequest>>(
        `/approval-requests?subjectType=${subjectType}&subjectId=${subjectId}&limit=10`
      );
      const requests = response.data ?? [];

      if (requests.length === 0) {
        return {
          status: 'none',
          pendingRequest: null,
          latestRequest: null,
          isBlocking: false,
        };
      }

      // Sort by createdAt descending to get the latest
      const sorted = [...requests].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const latest = sorted[0];
      const pending = sorted.find((r) => r.status === 'PENDING') ?? null;

      if (pending) {
        return {
          status: 'pending',
          pendingRequest: pending,
          latestRequest: latest,
          isBlocking: true,
        };
      }

      if (latest.status === 'APPROVED') {
        return {
          status: 'approved',
          pendingRequest: null,
          latestRequest: latest,
          isBlocking: false,
        };
      }

      if (latest.status === 'REJECTED') {
        return {
          status: 'rejected',
          pendingRequest: null,
          latestRequest: latest,
          isBlocking: true,
        };
      }

      return {
        status: 'none',
        pendingRequest: null,
        latestRequest: latest,
        isBlocking: false,
      };
    },
    enabled: !!subjectType && !!subjectId,
    staleTime: 60_000,
  });

  return query;
}

// ============================================================================
// Request Approval Mutation
// ============================================================================

export function useRequestApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      scope: ApprovalScope;
      subjectType: 'allocation' | 'initiative' | 'scenario';
      subjectId: string;
      snapshotContext?: Record<string, unknown>;
    }) => api.post<ApprovalRequest>('/approval-requests', data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: approvalStatusKeys.subject(variables.subjectType, variables.subjectId),
      });
      toast.success('Approval request submitted');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to submit approval request');
    },
  });
}
