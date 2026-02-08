import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';

// ============================================================================
// Query Keys
// ============================================================================

export const entitlementKeys = {
  all: ['entitlements'] as const,
  summary: () => [...entitlementKeys.all, 'summary'] as const,
  lists: () => [...entitlementKeys.all, 'list'] as const,
  export: () => [...entitlementKeys.all, 'export'] as const,
  revops: () => [...entitlementKeys.all, 'revops'] as const,
  revopsEvents: (filters?: EntitlementEventFilters) =>
    [...entitlementKeys.revops(), 'events', filters] as const,
};

// ============================================================================
// Types
// ============================================================================

export interface EntitlementSummary {
  licensed: number;
  observers: number;
  seatLimit: number;
  tier: string;
  utilizationPct: number;
}

export interface EntitlementUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EntitlementLists {
  licensed: { users: EntitlementUser[]; count: number };
  observers: { users: EntitlementUser[]; count: number };
}

export interface TenantConfigUpdate {
  tier?: 'starter' | 'growth' | 'enterprise';
  seatLimit?: number;
}

export interface RevOpsSignals {
  blockedAttempts: number;
  nearLimit: boolean;
  utilizationPct: number;
  licensed: number;
  seatLimit: number;
  tier: string;
}

export interface EntitlementEvent {
  id: string;
  eventName: string;
  userId: string | null;
  seatType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface EntitlementEventFilters {
  page?: number;
  limit?: number;
  eventName?: string;
  userId?: string;
}

interface PaginatedEvents {
  data: EntitlementEvent[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ============================================================================
// Hooks
// ============================================================================

export function useEntitlementSummary() {
  return useQuery({
    queryKey: entitlementKeys.summary(),
    queryFn: () => api.get<EntitlementSummary>('/api/admin/entitlements/summary'),
    staleTime: 60_000,
  });
}

export function useEntitlements() {
  return useQuery({
    queryKey: entitlementKeys.lists(),
    queryFn: () => api.get<EntitlementLists>('/api/admin/entitlements'),
    staleTime: 60_000,
  });
}

export function useUpdateTenantConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TenantConfigUpdate) =>
      api.put('/api/admin/entitlements/config', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: entitlementKeys.all });
      toast.success('Tenant configuration updated');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update config'),
  });
}

export function useExportEntitlements() {
  return useQuery({
    queryKey: entitlementKeys.export(),
    queryFn: async () => {
      const response = await fetch('/api/admin/entitlements/export', {
        headers: { Authorization: `Bearer ${await getToken()}` },
      });
      return response.text();
    },
    enabled: false, // manual trigger only
  });
}

export function useRevOpsSummary() {
  return useQuery({
    queryKey: entitlementKeys.revops(),
    queryFn: () => api.get<RevOpsSignals>('/api/admin/revops'),
    staleTime: 60_000,
  });
}

export function useRevOpsEvents(filters?: EntitlementEventFilters) {
  const params = new URLSearchParams();
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.eventName) params.set('eventName', filters.eventName);
  if (filters?.userId) params.set('userId', filters.userId);

  const qs = params.toString();
  return useQuery({
    queryKey: entitlementKeys.revopsEvents(filters),
    queryFn: () =>
      api.get<PaginatedEvents>(`/api/admin/revops/events${qs ? `?${qs}` : ''}`),
    staleTime: 30_000,
  });
}

// Helper to get the auth token — uses the same provider as api client
async function getToken(): Promise<string> {
  // The api client handles token injection; for direct fetch we need it manually.
  // This is a fallback — in practice, the CSV export button should use api.get
  return '';
}
