import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';
import type { PaginatedResponse } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface PercentileResult {
  level: number;
  value: number;
}

export interface CompletionCdfEntry {
  periodId: string;
  periodLabel: string;
  cumulativeProbability: number;
}

export interface InitiativeForecast {
  initiativeId: string;
  initiativeTitle: string;
  completionCdf: CompletionCdfEntry[];
  percentiles: PercentileResult[];
  scopeItemCount: number;
  hasEstimates: boolean;
}

export interface ScopeBasedForecastResult {
  mode: 'SCOPE_BASED';
  scenarioId: string;
  simulationCount: number;
  initiativeForecasts: InitiativeForecast[];
  warnings: string[];
  durationMs: number;
}

export interface ScopeBasedForecastInput {
  scenarioId: string;
  initiativeIds: string[];
  simulationCount?: number;
  confidenceLevels?: number[];
  orgNodeId?: string;
}

export interface EmpiricalInitiativeForecast {
  initiativeId: string;
  initiativeTitle: string;
  currentStatus: string;
  elapsedDays: number;
  percentiles: PercentileResult[];
  estimatedCompletionDays: PercentileResult[];
}

export interface EmpiricalForecastResult {
  mode: 'EMPIRICAL';
  simulationCount: number;
  historicalDataPoints: number;
  lowConfidence: boolean;
  initiativeForecasts: EmpiricalInitiativeForecast[];
  warnings: string[];
  durationMs: number;
}

export interface EmpiricalForecastInput {
  initiativeIds: string[];
  simulationCount?: number;
  confidenceLevels?: number[];
}

export interface DataQualityResult {
  score: number;
  confidence: 'low' | 'moderate' | 'good';
  issues: string[];
  details: {
    totalScopeItems: number;
    scopeItemsWithEstimates: number;
    estimateCoverage: number;
    scopeItemsWithDistributions: number;
    distributionCoverage: number;
    historicalCompletions: number;
    modeBViable: boolean;
  };
}

export interface ForecastRun {
  id: string;
  mode: 'SCOPE_BASED' | 'EMPIRICAL';
  scenarioId: string | null;
  orgNodeId: string | null;
  initiativeIds: string[];
  simulationCount: number;
  confidenceLevels: number[];
  inputSnapshot: Record<string, unknown>;
  results: Record<string, unknown>;
  warnings: string[] | null;
  dataQuality: Record<string, unknown> | null;
  computedAt: string;
  durationMs: number | null;
  createdAt: string;
}

export interface ForecastRunFilters {
  page?: number;
  limit?: number;
  scenarioId?: string;
  mode?: 'SCOPE_BASED' | 'EMPIRICAL';
}

// ============================================================================
// Query Keys
// ============================================================================

export const forecastKeys = {
  all: ['forecast'] as const,
  runs: (filters?: ForecastRunFilters) => [...forecastKeys.all, 'runs', filters] as const,
  run: (id: string) => [...forecastKeys.all, 'run', id] as const,
  dataQuality: (params?: { scenarioId?: string; initiativeIds?: string }) =>
    [...forecastKeys.all, 'dataQuality', params] as const,
};

// ============================================================================
// Queries
// ============================================================================

export function useForecastRuns(filters?: ForecastRunFilters) {
  const params = new URLSearchParams();
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.scenarioId) params.set('scenarioId', filters.scenarioId);
  if (filters?.mode) params.set('mode', filters.mode);
  const qs = params.toString();

  return useQuery({
    queryKey: forecastKeys.runs(filters),
    queryFn: () =>
      api.get<PaginatedResponse<ForecastRun>>(
        `/forecast/runs${qs ? `?${qs}` : ''}`,
      ),
    staleTime: 30_000,
  });
}

export function useForecastRun(id: string) {
  return useQuery({
    queryKey: forecastKeys.run(id),
    queryFn: () => api.get<ForecastRun>(`/forecast/runs/${id}`),
    enabled: !!id,
  });
}

export function useDataQuality(scenarioId?: string, initiativeIds?: string[]) {
  const params = new URLSearchParams();
  if (scenarioId) params.set('scenarioId', scenarioId);
  if (initiativeIds && initiativeIds.length > 0) {
    params.set('initiativeIds', initiativeIds.join(','));
  }
  const qs = params.toString();

  return useQuery({
    queryKey: forecastKeys.dataQuality({
      scenarioId,
      initiativeIds: initiativeIds?.join(','),
    }),
    queryFn: () =>
      api.get<DataQualityResult>(
        `/forecast/data-quality${qs ? `?${qs}` : ''}`,
      ),
    enabled: !!(scenarioId || (initiativeIds && initiativeIds.length > 0)),
    staleTime: 60_000,
  });
}

// ============================================================================
// Mutations
// ============================================================================

export function useRunScopeBasedForecast() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ScopeBasedForecastInput) =>
      api.post<ScopeBasedForecastResult>('/forecast/scope-based', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: forecastKeys.all });
      toast.success('Scope-based forecast complete');
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Failed to run forecast',
      );
    },
  });
}

export function useRunEmpiricalForecast() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: EmpiricalForecastInput) =>
      api.post<EmpiricalForecastResult>('/forecast/empirical', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: forecastKeys.all });
      toast.success('Empirical forecast complete');
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Failed to run forecast',
      );
    },
  });
}
