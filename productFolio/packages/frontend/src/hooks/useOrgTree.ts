import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';
import type {
  OrgNode,
  OrgMembership,
  CoverageReport,
  PaginatedResponse,
} from '../types';

// ============================================================================
// Query Keys
// ============================================================================

export const orgTreeKeys = {
  all: ['orgTree'] as const,
  tree: () => [...orgTreeKeys.all, 'tree'] as const,
  nodes: () => [...orgTreeKeys.all, 'nodes'] as const,
  node: (id: string) => [...orgTreeKeys.all, 'node', id] as const,
  ancestors: (id: string) => [...orgTreeKeys.all, 'ancestors', id] as const,
  descendants: (id: string) => [...orgTreeKeys.all, 'descendants', id] as const,
  coverage: () => [...orgTreeKeys.all, 'coverage'] as const,
  memberships: () => [...orgTreeKeys.all, 'memberships'] as const,
  membershipList: (filters: Record<string, unknown>) => [...orgTreeKeys.memberships(), filters] as const,
  employeeMembership: (id: string) => [...orgTreeKeys.all, 'employeeMembership', id] as const,
};

// ============================================================================
// Tree Queries
// ============================================================================

export function useOrgTree() {
  return useQuery({
    queryKey: orgTreeKeys.tree(),
    queryFn: () => api.get<OrgNode[]>('/org/tree'),
    staleTime: 60_000,
  });
}

export function useOrgNodes(filters?: {
  parentId?: string;
  type?: string;
  isActive?: boolean;
  search?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.parentId) params.set('parentId', filters.parentId);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.isActive !== undefined) params.set('isActive', String(filters.isActive));
  if (filters?.search) params.set('search', filters.search);
  const qs = params.toString();

  return useQuery({
    queryKey: orgTreeKeys.nodes(),
    queryFn: () => api.get<OrgNode[]>(`/org/nodes${qs ? `?${qs}` : ''}`),
  });
}

export function useOrgNode(id: string) {
  return useQuery({
    queryKey: orgTreeKeys.node(id),
    queryFn: () => api.get<OrgNode>(`/org/nodes/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

/** @internal Not currently used by any page */
export function useOrgNodeAncestors(id: string) {
  return useQuery({
    queryKey: orgTreeKeys.ancestors(id),
    queryFn: () => api.get<OrgNode[]>(`/org/nodes/${id}/ancestors`),
    enabled: !!id,
  });
}

/** @internal Not currently used by any page */
export function useOrgNodeDescendants(id: string) {
  return useQuery({
    queryKey: orgTreeKeys.descendants(id),
    queryFn: () => api.get<OrgNode[]>(`/org/nodes/${id}/descendants`),
    enabled: !!id,
  });
}

export function useCoverageReport() {
  return useQuery({
    queryKey: orgTreeKeys.coverage(),
    queryFn: () => api.get<CoverageReport>('/org/coverage'),
    staleTime: 60_000,
  });
}

// ============================================================================
// Node Mutations
// ============================================================================

export function useCreateNode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      code: string;
      type: string;
      parentId?: string | null;
      managerId?: string | null;
      sortOrder?: number;
      metadata?: Record<string, unknown>;
      isPortfolioArea?: boolean;
    }) => api.post<OrgNode>('/org/nodes', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgTreeKeys.all });
      toast.success('Node created');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create node');
    },
  });
}

export function useUpdateNode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: string;
      name?: string;
      code?: string;
      managerId?: string | null;
      sortOrder?: number;
      metadata?: Record<string, unknown>;
    }) => api.put<OrgNode>(`/org/nodes/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgTreeKeys.all });
      toast.success('Node updated');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update node');
    },
  });
}

export function useMoveNode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newParentId }: { id: string; newParentId: string }) =>
      api.post<OrgNode>(`/org/nodes/${id}/move`, { newParentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgTreeKeys.all });
      toast.success('Node moved');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to move node');
    },
  });
}

export function useDeleteNode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/org/nodes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgTreeKeys.all });
      toast.success('Node deleted');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete node');
    },
  });
}

// ============================================================================
// Membership Queries & Mutations
// ============================================================================

export function useMemberships(filters?: {
  orgNodeId?: string;
  employeeId?: string;
  activeOnly?: boolean;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.orgNodeId) params.set('orgNodeId', filters.orgNodeId);
  if (filters?.employeeId) params.set('employeeId', filters.employeeId);
  if (filters?.activeOnly !== undefined) params.set('activeOnly', String(filters.activeOnly));
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: orgTreeKeys.membershipList(filters ?? {}),
    queryFn: () => api.get<PaginatedResponse<OrgMembership>>(`/org/memberships${qs ? `?${qs}` : ''}`),
  });
}

export function useEmployeeMembershipHistory(employeeId: string) {
  return useQuery({
    queryKey: orgTreeKeys.employeeMembership(employeeId),
    queryFn: () => api.get<OrgMembership[]>(`/org/memberships/employee/${employeeId}`),
    enabled: !!employeeId,
  });
}

export function useAssignMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { employeeId: string; orgNodeId: string; effectiveStart?: string }) =>
      api.post<OrgMembership>('/org/memberships', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgTreeKeys.all });
      toast.success('Employee assigned');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to assign employee');
    },
  });
}

export function useBulkAssignMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { employeeIds: string[]; orgNodeId: string; effectiveStart?: string }) =>
      api.post<{ success: string[]; failed: Array<{ employeeId: string; error: string }> }>(
        '/org/memberships/bulk',
        data,
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: orgTreeKeys.all });
      toast.success(`Assigned ${result.success.length} employees`);
      if (result.failed.length > 0) {
        toast.warning(`${result.failed.length} assignments failed`);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Bulk assignment failed');
    },
  });
}

export function useEndMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<OrgMembership>(`/org/memberships/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgTreeKeys.all });
      toast.success('Membership ended');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to end membership');
    },
  });
}
