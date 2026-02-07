import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';

// ============================================================================
// Types
// ============================================================================

export interface FeatureFlag {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Query Keys
// ============================================================================

export const featureFlagKeys = {
  all: ['featureFlags'] as const,
  list: () => [...featureFlagKeys.all, 'list'] as const,
};

// ============================================================================
// Queries
// ============================================================================

export function useFeatureFlags() {
  return useQuery({
    queryKey: featureFlagKeys.list(),
    queryFn: () => api.get<FeatureFlag[]>('/feature-flags'),
    staleTime: 5 * 60_000, // 5 minutes — flags rarely change
  });
}

/**
 * Convenience hook for checking a single feature flag.
 * Returns { enabled: false } while loading or if the flag doesn't exist (safe default).
 */
export function useFeatureFlag(key: string): { enabled: boolean; isLoading: boolean } {
  const { data: flags, isLoading } = useFeatureFlags();
  const flag = flags?.find((f) => f.key === key);
  return { enabled: flag?.enabled ?? false, isLoading };
}

// ============================================================================
// Mutations
// ============================================================================

export function useUpdateFeatureFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      key,
      data,
    }: {
      key: string;
      data: { enabled?: boolean; description?: string | null; metadata?: Record<string, unknown> | null };
    }) => api.put<FeatureFlag>(`/feature-flags/${key}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: featureFlagKeys.list() });
      toast.success('Feature flag updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update feature flag');
    },
  });
}
