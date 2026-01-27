import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export interface Scenario {
  id: string;
  name: string;
  description: string | null;
  isBaseline: boolean;
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

export function useCreateScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Scenario>) =>
      api.post<Scenario>('/scenarios', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.lists() });
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
    },
  });
}

export function useUpdateAllocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      scenarioId,
      allocationId,
      data,
    }: {
      scenarioId: string;
      allocationId: string;
      data: Partial<Allocation>;
    }) => api.patch<Allocation>(`/scenarios/${scenarioId}/allocations/${allocationId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.allocations(variables.scenarioId) });
      queryClient.invalidateQueries({ queryKey: scenarioKeys.analysis(variables.scenarioId) });
    },
  });
}
