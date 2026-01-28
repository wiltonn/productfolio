import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';

export interface Scenario {
  id: string;
  name: string;
  quarterRange: string;
  assumptions?: Record<string, unknown>;
  priorityRankings?: Array<{ initiativeId: string; rank: number }>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Allocation {
  id: string;
  scenarioId: string;
  employeeId: string;
  initiativeId: string;
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
  analysis: (id: string) => [...scenarioKeys.detail(id), 'analysis'] as const,
  calculator: (id: string, options?: { includeBreakdown?: boolean }) =>
    [...scenarioKeys.detail(id), 'calculator', options] as const,
  compare: (ids: string[]) => [...scenarioKeys.all, 'compare', ids] as const,
};

export function useScenarios() {
  return useQuery({
    queryKey: scenarioKeys.list(),
    queryFn: () => api.get<PaginatedResponse<Scenario>>('/scenarios'),
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
    mutationFn: (data: Partial<Scenario>) => api.post<Scenario>('/scenarios', data),
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
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.post<Scenario>(`/scenarios/${id}/clone`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.lists() });
      toast.success('Scenario cloned successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to clone scenario');
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
      toast.success('Allocation deleted successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete allocation');
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
