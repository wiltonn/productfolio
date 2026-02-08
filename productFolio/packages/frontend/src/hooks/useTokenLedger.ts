import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';

// ============================================================================
// Types
// ============================================================================

export interface TokenLedgerRow {
  poolId: string;
  poolName: string;
  supply: number;
  demandP50: number;
  demandP90: number;
  deltaP50: number;
  deltaP90: number;
}

export interface TokenLedgerSummary {
  rows: TokenLedgerRow[];
  bindingConstraints: TokenLedgerRow[];
  totalSupply: number;
  totalDemandP50: number;
  totalDemandP90: number;
}

export interface SkillPool {
  id: string;
  name: string;
  skills: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TokenSupplyEntry {
  id: string;
  scenarioId: string;
  poolId: string;
  poolName: string;
  supply: number;
  createdAt: string;
  updatedAt: string;
}

export interface TokenDemandEntry {
  id: string;
  scenarioId: string;
  poolId: string;
  poolName: string;
  demandP50: number;
  demandP90: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Query Keys
// ============================================================================

export const tokenLedgerKeys = {
  all: ['tokenLedger'] as const,
  ledger: (scenarioId: string) => [...tokenLedgerKeys.all, 'ledger', scenarioId] as const,
  supply: (scenarioId: string) => [...tokenLedgerKeys.all, 'supply', scenarioId] as const,
  demand: (scenarioId: string) => [...tokenLedgerKeys.all, 'demand', scenarioId] as const,
  skillPools: () => [...tokenLedgerKeys.all, 'skillPools'] as const,
};

// ============================================================================
// Queries
// ============================================================================

export function useTokenLedger(scenarioId: string) {
  return useQuery({
    queryKey: tokenLedgerKeys.ledger(scenarioId),
    queryFn: () => api.get<TokenLedgerSummary>(`/scenarios/${scenarioId}/token-ledger`),
    enabled: !!scenarioId,
    staleTime: 60_000,
  });
}

export function useSkillPools() {
  return useQuery({
    queryKey: tokenLedgerKeys.skillPools(),
    queryFn: () => api.get<SkillPool[]>('/skill-pools'),
    staleTime: 5 * 60_000,
  });
}

export function useTokenSupply(scenarioId: string) {
  return useQuery({
    queryKey: tokenLedgerKeys.supply(scenarioId),
    queryFn: () => api.get<TokenSupplyEntry[]>(`/scenarios/${scenarioId}/token-supply`),
    enabled: !!scenarioId,
  });
}

export function useTokenDemand(scenarioId: string) {
  return useQuery({
    queryKey: tokenLedgerKeys.demand(scenarioId),
    queryFn: () => api.get<TokenDemandEntry[]>(`/scenarios/${scenarioId}/token-demand`),
    enabled: !!scenarioId,
  });
}

// ============================================================================
// Mutations
// ============================================================================

export function useUpdateTokenSupply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      scenarioId,
      poolId,
      supply,
    }: {
      scenarioId: string;
      poolId: string;
      supply: number;
    }) => api.put<TokenSupplyEntry>(`/scenarios/${scenarioId}/token-supply/${poolId}`, { supply }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: tokenLedgerKeys.supply(variables.scenarioId) });
      queryClient.invalidateQueries({ queryKey: tokenLedgerKeys.ledger(variables.scenarioId) });
      toast.success('Token supply updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update token supply');
    },
  });
}

export function useUpdateTokenDemand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      scenarioId,
      poolId,
      demandP50,
      demandP90,
    }: {
      scenarioId: string;
      poolId: string;
      demandP50: number;
      demandP90: number;
    }) =>
      api.put<TokenDemandEntry>(`/scenarios/${scenarioId}/token-demand/${poolId}`, {
        demandP50,
        demandP90,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: tokenLedgerKeys.demand(variables.scenarioId) });
      queryClient.invalidateQueries({ queryKey: tokenLedgerKeys.ledger(variables.scenarioId) });
      toast.success('Token demand updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update token demand');
    },
  });
}

export function useDeriveTokenDemand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (scenarioId: string) =>
      api.post<{ derived: number }>(`/scenarios/${scenarioId}/derive-token-demand`, {}),
    onSuccess: (_, scenarioId) => {
      queryClient.invalidateQueries({ queryKey: tokenLedgerKeys.demand(scenarioId) });
      queryClient.invalidateQueries({ queryKey: tokenLedgerKeys.ledger(scenarioId) });
      toast.success('Token demand derived from scope items');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to derive token demand');
    },
  });
}
