import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';
import type {
  EmployeeOrgUnitLink,
  EmployeeOrgRelationshipType,
  PaginatedResponse,
} from '../types';

// ============================================================================
// Query Keys
// ============================================================================

export const employeeOrgLinkKeys = {
  all: ['employeeOrgLinks'] as const,
  lists: () => [...employeeOrgLinkKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) =>
    [...employeeOrgLinkKeys.lists(), filters] as const,
  employee: (id: string) => [...employeeOrgLinkKeys.all, 'employee', id] as const,
  employeeHome: (id: string) =>
    [...employeeOrgLinkKeys.all, 'employee', id, 'home'] as const,
  employeeHistory: (id: string) =>
    [...employeeOrgLinkKeys.all, 'employee', id, 'history'] as const,
  employeeCapacity: (id: string) =>
    [...employeeOrgLinkKeys.all, 'employee', id, 'capacity'] as const,
  orgNodeLinks: (id: string, relType?: string) =>
    [...employeeOrgLinkKeys.all, 'orgNode', id, relType] as const,
};

// ============================================================================
// List Links (with filters)
// ============================================================================

export interface LinkListFilters {
  employeeId?: string;
  orgNodeId?: string;
  relationshipType?: EmployeeOrgRelationshipType;
  activeOnly?: boolean;
  consumeCapacityOnly?: boolean;
  page?: number;
  limit?: number;
}

export function useEmployeeOrgLinks(filters?: LinkListFilters) {
  const params = new URLSearchParams();
  if (filters?.employeeId) params.set('employeeId', filters.employeeId);
  if (filters?.orgNodeId) params.set('orgNodeId', filters.orgNodeId);
  if (filters?.relationshipType) params.set('relationshipType', filters.relationshipType);
  if (filters?.activeOnly !== undefined) params.set('activeOnly', String(filters.activeOnly));
  if (filters?.consumeCapacityOnly !== undefined)
    params.set('consumeCapacityOnly', String(filters.consumeCapacityOnly));
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: employeeOrgLinkKeys.list(filters as Record<string, unknown>),
    queryFn: () =>
      api.get<PaginatedResponse<EmployeeOrgUnitLink>>(
        `/org/links${qs ? `?${qs}` : ''}`,
      ),
    staleTime: 60_000,
  });
}

// ============================================================================
// Active Links for Employee
// ============================================================================

export function useActiveEmployeeLinks(employeeId: string) {
  return useQuery({
    queryKey: employeeOrgLinkKeys.employee(employeeId),
    queryFn: () =>
      api.get<EmployeeOrgUnitLink[]>(`/org/links/employee/${employeeId}`),
    enabled: !!employeeId,
    staleTime: 60_000,
  });
}

// ============================================================================
// Home Org (PRIMARY_REPORTING)
// ============================================================================

export function useEmployeeHomeOrg(employeeId: string) {
  return useQuery({
    queryKey: employeeOrgLinkKeys.employeeHome(employeeId),
    queryFn: () =>
      api.get<EmployeeOrgUnitLink | null>(
        `/org/links/employee/${employeeId}/home`,
      ),
    enabled: !!employeeId,
    staleTime: 60_000,
  });
}

// ============================================================================
// Link History
// ============================================================================

export function useEmployeeLinkHistory(employeeId: string) {
  return useQuery({
    queryKey: employeeOrgLinkKeys.employeeHistory(employeeId),
    queryFn: () =>
      api.get<EmployeeOrgUnitLink[]>(
        `/org/links/employee/${employeeId}/history`,
      ),
    enabled: !!employeeId,
  });
}

// ============================================================================
// Capacity-Consuming Links
// ============================================================================

export function useEmployeeCapacityLinks(employeeId: string) {
  return useQuery({
    queryKey: employeeOrgLinkKeys.employeeCapacity(employeeId),
    queryFn: () =>
      api.get<EmployeeOrgUnitLink[]>(
        `/org/links/employee/${employeeId}/capacity`,
      ),
    enabled: !!employeeId,
    staleTime: 60_000,
  });
}

// ============================================================================
// Org Node Members
// ============================================================================

export function useOrgNodeLinks(
  orgNodeId: string,
  relationshipType?: EmployeeOrgRelationshipType,
) {
  const params = relationshipType
    ? `?relationshipType=${relationshipType}`
    : '';

  return useQuery({
    queryKey: employeeOrgLinkKeys.orgNodeLinks(orgNodeId, relationshipType),
    queryFn: () =>
      api.get<EmployeeOrgUnitLink[]>(
        `/org/nodes/${orgNodeId}/links${params}`,
      ),
    enabled: !!orgNodeId,
    staleTime: 60_000,
  });
}

// ============================================================================
// Mutations
// ============================================================================

export interface CreateLinkInput {
  employeeId: string;
  orgNodeId: string;
  relationshipType: EmployeeOrgRelationshipType;
  allocationPct?: number;
  consumeCapacity?: boolean;
  startDate?: string;
  endDate?: string | null;
}

export function useCreateEmployeeOrgLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLinkInput) =>
      api.post<EmployeeOrgUnitLink>('/org/links', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeOrgLinkKeys.all });
      toast.success('Org link created');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create org link');
    },
  });
}

export function useUpdateEmployeeOrgLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      linkId,
      ...data
    }: {
      linkId: string;
      allocationPct?: number | null;
      consumeCapacity?: boolean;
      endDate?: string | null;
    }) => api.patch<EmployeeOrgUnitLink>(`/org/links/${linkId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeOrgLinkKeys.all });
      toast.success('Org link updated');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update org link');
    },
  });
}

export function useEndEmployeeOrgLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      api.delete<EmployeeOrgUnitLink>(`/org/links/${linkId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeOrgLinkKeys.all });
      toast.success('Org link ended');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to end org link');
    },
  });
}

export function useReassignPrimaryReporting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { employeeId: string; orgNodeId: string }) =>
      api.post<EmployeeOrgUnitLink>('/org/links/reassign-primary', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeOrgLinkKeys.all });
      toast.success('Primary reporting reassigned');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to reassign primary reporting');
    },
  });
}

export function useMigrateFromMemberships() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dryRun: boolean = true) =>
      api.post<{
        dryRun: boolean;
        totalActiveMemberships: number;
        alreadyHaveLink: number;
        toCreate?: number;
        created?: number;
        preview?: Array<{
          employeeId: string;
          employeeName: string;
          orgNodeId: string;
          orgNodeName: string;
        }>;
      }>(`/org/links/migrate-from-memberships?dryRun=${dryRun}`, {}),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: employeeOrgLinkKeys.all });
      if (result.dryRun) {
        toast.success(`Migration preview: ${result.toCreate} links to create`);
      } else {
        toast.success(`Migration complete: ${result.created} links created`);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Migration failed');
    },
  });
}
