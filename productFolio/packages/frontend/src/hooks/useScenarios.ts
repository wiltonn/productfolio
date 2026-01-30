import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';
import type { ScenarioStatus } from '../types';
import { useAuthStore, type UserRole } from '../stores/auth.store';

export interface Scenario {
  id: string;
  name: string;
  periodId: string;
  periodLabel: string;
  periodStartDate: string;
  periodEndDate: string;
  status: ScenarioStatus;
  isPrimary: boolean;
  planLockDate: string | null;
  assumptions?: Record<string, unknown>;
  priorityRankings?: Array<{ initiativeId: string; rank: number }>;
  version: number;
  createdAt: string;
  updatedAt: string;
  allocationsCount?: number;
}

export type AllocationType = 'PROJECT' | 'RUN' | 'SUPPORT';

export interface Allocation {
  id: string;
  scenarioId: string;
  employeeId: string;
  employeeName: string;
  initiativeId: string;
  initiativeStatus: string | null;
  allocationType?: AllocationType;
  startDate: string;
  endDate: string;
  percentage: number;
  createdAt: string;
  updatedAt: string;
}

export interface CapacityAnalysis {
  skill: string;
  demand: number;
  capacity: number;
  gap: number;
  utilizationPercent: number;
}

export interface CalculatorResult {
  scenarioId: string;
  cacheHit: boolean;
  calculatedAt: string;
  summary: {
    totalDemand: number;
    totalCapacity: number;
    utilizationPercent: number;
    gap: number;
  };
  bySkill?: CapacityAnalysis[];
  byInitiative?: Array<{
    initiativeId: string;
    title: string;
    demand: number;
    allocated: number;
  }>;
}

export interface ScenarioComparison {
  scenarioId: string;
  name: string;
  totalDemand: number;
  totalCapacity: number;
  utilizationPercent: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const scenarioKeys = {
  all: ['scenarios'] as const,
  lists: () => [...scenarioKeys.all, 'list'] as const,
  list: () => [...scenarioKeys.lists()] as const,
  details: () => [...scenarioKeys.all, 'detail'] as const,
  detail: (id: string) => [...scenarioKeys.details(), id] as const,
  allocations: (id: string) => [...scenarioKeys.detail(id), 'allocations'] as const,
  initiativeAllocations: (scenarioId: string, initiativeId: string) =>
    [...scenarioKeys.detail(scenarioId), 'initiativeAllocations', initiativeId] as const,
  analysis: (id: string) => [...scenarioKeys.detail(id), 'analysis'] as const,
  calculator: (id: string, options?: { includeBreakdown?: boolean }) =>
    [...scenarioKeys.detail(id), 'calculator', options] as const,
  compare: (ids: string[]) => [...scenarioKeys.all, 'compare', ids] as const,
};

export function useScenarios(options?: { periodIds?: string[] }) {
  const params = new URLSearchParams();
  params.set('limit', '100');
  if (options?.periodIds && options.periodIds.length > 0) {
    params.set('periodIds', options.periodIds.join(','));
  }

  return useQuery({
    queryKey: [...scenarioKeys.list(), options?.periodIds] as const,
    queryFn: () => api.get<PaginatedResponse<Scenario>>(`/scenarios?${params}`),
  });
}

export function useScenario(id: string) {
  return useQuery({
    queryKey: scenarioKeys.detail(id),
    queryFn: () => api.get<Scenario>(`/scenarios/${id}`),
    enabled: !!id,
  });
}

export function useScenarioAllocations(id: string) {
  return useQuery({
    queryKey: scenarioKeys.allocations(id),
    queryFn: () => api.get<Allocation[]>(`/scenarios/${id}/allocations`),
    enabled: !!id,
  });
}

export function useInitiativeAllocations(scenarioId: string, initiativeId: string) {
  return useQuery({
    queryKey: scenarioKeys.initiativeAllocations(scenarioId, initiativeId),
    queryFn: () =>
      api.get<Allocation[]>(`/scenarios/${scenarioId}/initiatives/${initiativeId}/allocations`),
    enabled: !!scenarioId && !!initiativeId,
  });
}

export function useScenarioAnalysis(id: string) {
  return useQuery({
    queryKey: scenarioKeys.analysis(id),
    queryFn: () => api.get<CapacityAnalysis[]>(`/scenarios/${id}/capacity-demand`),
    enabled: !!id,
  });
}

export function useScenarioCalculator(
  id: string,
  options: { skipCache?: boolean; includeBreakdown?: boolean } = {}
) {
  const params = new URLSearchParams();
  if (options.skipCache) params.set('skipCache', 'true');
  if (options.includeBreakdown) params.set('includeBreakdown', 'true');
  const queryString = params.toString();

  return useQuery({
    queryKey: scenarioKeys.calculator(id, { includeBreakdown: options.includeBreakdown }),
    queryFn: () =>
      api.get<CalculatorResult>(`/scenarios/${id}/calculator${queryString ? `?${queryString}` : ''}`),
    enabled: !!id,
  });
}

export function useCompareScenarios(scenarioIds: string[]) {
  const params = new URLSearchParams();
  scenarioIds.forEach((id) => params.append('scenarioIds', id));

  return useQuery({
    queryKey: scenarioKeys.compare(scenarioIds),
    queryFn: () => api.get<ScenarioComparison[]>(`/scenarios/compare?${params}`),
    enabled: scenarioIds.length >= 2,
  });
}

export function useCreateScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; periodId: string; assumptions?: Record<string, unknown> }) =>
      api.post<Scenario>('/scenarios', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.lists() });
      toast.success('Scenario created successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create scenario');
    },
  });
}

export function useUpdateScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Scenario> }) =>
      api.put<Scenario>(`/scenarios/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: scenarioKeys.lists() });
      toast.success('Scenario updated successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update scenario');
    },
  });
}

export function useDeleteScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/scenarios/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.lists() });
      toast.success('Scenario deleted successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete scenario');
    },
  });
}

export function useUpdatePriorities() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      scenarioId,
      priorities,
    }: {
      scenarioId: string;
      priorities: Array<{ initiativeId: string; rank: number }>;
    }) => api.put<Scenario>(`/scenarios/${scenarioId}/priorities`, { priorities }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.detail(variables.scenarioId) });
      queryClient.invalidateQueries({ queryKey: scenarioKeys.analysis(variables.scenarioId) });
      toast.success('Priorities updated successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update priorities');
    },
  });
}

export function useCloneScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      name,
      targetPeriodId,
      includeProjectAllocations,
      includeRunSupportAllocations,
      includePriorityRankings,
    }: {
      id: string;
      name: string;
      targetPeriodId: string;
      includeProjectAllocations?: boolean;
      includeRunSupportAllocations?: boolean;
      includePriorityRankings?: boolean;
    }) =>
      api.post<Scenario>(`/scenarios/${id}/clone`, {
        name,
        targetPeriodId,
        includeProjectAllocations: includeProjectAllocations ?? false,
        includeRunSupportAllocations: includeRunSupportAllocations ?? true,
        includePriorityRankings: includePriorityRankings ?? true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.lists() });
      toast.success('Scenario cloned successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to clone scenario');
    },
  });
}

export function useSetPrimary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.put<Scenario>(`/scenarios/${id}/primary`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.lists() });
      queryClient.invalidateQueries({ queryKey: scenarioKeys.all });
      toast.success('Scenario set as primary');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to set primary');
    },
  });
}

export function useCreateAllocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ scenarioId, data }: { scenarioId: string; data: Partial<Allocation> }) =>
      api.post<Allocation>(`/scenarios/${scenarioId}/allocations`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.allocations(variables.scenarioId) });
      queryClient.invalidateQueries({ queryKey: scenarioKeys.analysis(variables.scenarioId) });
      queryClient.invalidateQueries({
        queryKey: scenarioKeys.calculator(variables.scenarioId),
      });
      // Invalidate initiative-specific allocations
      if (variables.data.initiativeId) {
        queryClient.invalidateQueries({
          queryKey: scenarioKeys.initiativeAllocations(variables.scenarioId, variables.data.initiativeId),
        });
      }
      toast.success('Allocation created successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create allocation');
    },
  });
}

export function useUpdateAllocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scenarioId,
      allocationId,
      data,
    }: {
      scenarioId: string;
      allocationId: string;
      data: Partial<Allocation>;
    }) => {
      const allocation = await api.put<Allocation>(`/allocations/${allocationId}`, data);
      return { allocation, scenarioId };
    },
    onSuccess: ({ scenarioId }) => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.allocations(scenarioId) });
      queryClient.invalidateQueries({ queryKey: scenarioKeys.analysis(scenarioId) });
      queryClient.invalidateQueries({
        queryKey: scenarioKeys.calculator(scenarioId),
      });
      toast.success('Allocation updated successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update allocation');
    },
  });
}

export function useDeleteAllocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ scenarioId, allocationId }: { scenarioId: string; allocationId: string }) =>
      api.delete(`/allocations/${allocationId}`).then(() => ({ scenarioId })),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.allocations(result.scenarioId) });
      queryClient.invalidateQueries({ queryKey: scenarioKeys.analysis(result.scenarioId) });
      queryClient.invalidateQueries({
        queryKey: scenarioKeys.calculator(result.scenarioId),
      });
      // Invalidate all initiative-specific allocation queries for this scenario
      queryClient.invalidateQueries({
        queryKey: scenarioKeys.detail(result.scenarioId),
        predicate: (query) =>
          Array.isArray(query.queryKey) && query.queryKey.includes('initiativeAllocations'),
      });
      toast.success('Allocation deleted successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete allocation');
    },
  });
}

// Auto-Allocate Types
export interface ProposedAllocation {
  employeeId: string;
  employeeName: string;
  initiativeId: string;
  initiativeTitle: string;
  skill: string;
  percentage: number;
  hours: number;
  startDate: string;
  endDate: string;
}

export interface InitiativeCoverage {
  initiativeId: string;
  initiativeTitle: string;
  rank: number;
  skills: Array<{
    skill: string;
    demandHours: number;
    allocatedHours: number;
    coveragePercent: number;
  }>;
  overallCoveragePercent: number;
}

export interface AutoAllocateResult {
  proposedAllocations: ProposedAllocation[];
  coverage: InitiativeCoverage[];
  warnings: string[];
  summary: {
    totalAllocations: number;
    employeesUsed: number;
    initiativesCovered: number;
    totalHoursAllocated: number;
  };
}

export function useAutoAllocatePreview() {
  return useMutation({
    mutationFn: ({
      scenarioId,
      options,
    }: {
      scenarioId: string;
      options?: { maxAllocationPercentage?: number };
    }) => api.post<AutoAllocateResult>(`/scenarios/${scenarioId}/auto-allocate`, options || {}),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to compute auto-allocations');
    },
  });
}

export function useAutoAllocateApply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      scenarioId,
      proposedAllocations,
    }: {
      scenarioId: string;
      proposedAllocations: ProposedAllocation[];
    }) =>
      api.post<{ created: number }>(`/scenarios/${scenarioId}/auto-allocate/apply`, {
        proposedAllocations,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.allocations(variables.scenarioId) });
      queryClient.invalidateQueries({ queryKey: scenarioKeys.analysis(variables.scenarioId) });
      queryClient.invalidateQueries({
        queryKey: scenarioKeys.calculator(variables.scenarioId),
      });
      queryClient.invalidateQueries({
        queryKey: scenarioKeys.detail(variables.scenarioId),
      });
      toast.success('Auto-allocations applied successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to apply auto-allocations');
    },
  });
}

export function useInvalidateCalculatorCache() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (scenarioId: string) =>
      api.post(`/scenarios/${scenarioId}/calculator/invalidate`, {}).then(() => scenarioId),
    onSuccess: (scenarioId) => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.calculator(scenarioId) });
      toast.info('Calculator cache invalidated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to invalidate cache');
    },
  });
}

export function useTransitionScenarioStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ScenarioStatus }) =>
      api.put<Scenario>(`/scenarios/${id}/status`, { status }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: scenarioKeys.lists() });
      toast.success(`Scenario status updated to ${variables.status}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update scenario status');
    },
  });
}

const MUTATION_ROLES: UserRole[] = ['ADMIN', 'PRODUCT_OWNER', 'BUSINESS_OWNER'];

export function useScenarioPermissions(scenario: Scenario | undefined) {
  const user = useAuthStore((state) => state.user);
  const userRole = user?.role;

  const hasMutationRole = !!userRole && MUTATION_ROLES.includes(userRole);
  const status = scenario?.status;

  const canEdit = hasMutationRole && status !== 'LOCKED' && status !== 'APPROVED';
  const canTransition = hasMutationRole;
  const canModifyAllocations = hasMutationRole && status !== 'LOCKED' && status !== 'APPROVED';
  const isReadOnly = status === 'LOCKED' || status === 'APPROVED' || !hasMutationRole;

  return { canEdit, canTransition, canModifyAllocations, isReadOnly, hasMutationRole };
}
