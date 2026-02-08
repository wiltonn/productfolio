import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';
import { scenarioKeys, type Scenario } from './useScenarios';

// ============================================================================
// Types
// ============================================================================

export type PlanningMode = 'LEGACY' | 'TOKEN';

// ============================================================================
// Query Keys
// ============================================================================

export const planningModeKeys = {
  all: ['planningMode'] as const,
  detail: (scenarioId: string) => [...planningModeKeys.all, scenarioId] as const,
};

// ============================================================================
// Mutations
// ============================================================================

export function usePlanningModeToggle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, planningMode }: { id: string; planningMode: PlanningMode }) =>
      api.put<Scenario>(`/scenarios/${id}/planning-mode`, { mode: planningMode }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: scenarioKeys.lists() });
      toast.success(
        variables.planningMode === 'TOKEN'
          ? 'Switched to Token Flow planning mode'
          : 'Switched to Legacy planning mode',
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update planning mode');
    },
  });
}
