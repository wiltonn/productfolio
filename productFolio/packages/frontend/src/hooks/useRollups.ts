import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { RollupResponse } from '../types/rollup.types';

export const rollupKeys = {
  all: ['rollups'] as const,
  portfolioAreas: (scenarioId: string) => [...rollupKeys.all, 'portfolio-areas', scenarioId] as const,
  orgNodes: (scenarioId: string) => [...rollupKeys.all, 'org-nodes', scenarioId] as const,
  businessOwners: (scenarioId: string) => [...rollupKeys.all, 'business-owners', scenarioId] as const,
};

export function usePortfolioAreaRollup(scenarioId: string) {
  return useQuery({
    queryKey: rollupKeys.portfolioAreas(scenarioId),
    queryFn: () => api.get<RollupResponse>(`/scenarios/${scenarioId}/rollups/portfolio-areas`),
    enabled: !!scenarioId,
    staleTime: 60_000,
  });
}

export function useOrgNodeRollup(scenarioId: string) {
  return useQuery({
    queryKey: rollupKeys.orgNodes(scenarioId),
    queryFn: () => api.get<RollupResponse>(`/scenarios/${scenarioId}/rollups/org-nodes`),
    enabled: !!scenarioId,
    staleTime: 60_000,
  });
}

export function useBusinessOwnerRollup(scenarioId: string) {
  return useQuery({
    queryKey: rollupKeys.businessOwners(scenarioId),
    queryFn: () => api.get<RollupResponse>(`/scenarios/${scenarioId}/rollups/business-owners`),
    enabled: !!scenarioId,
    staleTime: 60_000,
  });
}
