import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';

export interface Authority {
  id: string;
  code: string;
  description: string;
  category: string;
  deprecated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  authorityCode: string;
  changedBy: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface DriftResult {
  inSync: boolean;
  inCodeNotInRegistry: string[];
  inRegistryNotInCode: { code: string; deprecated: boolean }[];
  registryCount: number;
  codeCount: number;
}

export interface EffectivePermissions {
  userId: string;
  email: string;
  name: string;
  role: string;
  source: string;
  permissions: string[];
}

export const authorityKeys = {
  all: ['authorities'] as const,
  lists: () => [...authorityKeys.all, 'list'] as const,
  roleMapping: () => [...authorityKeys.all, 'role-mapping'] as const,
  drift: () => [...authorityKeys.all, 'drift'] as const,
  effective: (userId: string) => [...authorityKeys.all, 'effective', userId] as const,
  auditLog: (page: number) => [...authorityKeys.all, 'audit-log', page] as const,
};

export function useAuthorities() {
  return useQuery({
    queryKey: authorityKeys.lists(),
    queryFn: () => api.get<Authority[]>('/authorities'),
    staleTime: 60_000,
  });
}

export function useRoleMapping() {
  return useQuery({
    queryKey: authorityKeys.roleMapping(),
    queryFn: () => api.get<Record<string, string[]>>('/authorities/role-mapping'),
    staleTime: 5 * 60_000,
  });
}

export function useAuthorityDrift() {
  return useQuery({
    queryKey: authorityKeys.drift(),
    queryFn: () => api.get<DriftResult>('/authorities/drift'),
    staleTime: 30_000,
  });
}

export function useEffectivePermissions(userId: string) {
  return useQuery({
    queryKey: authorityKeys.effective(userId),
    queryFn: () => api.get<EffectivePermissions>(`/authorities/user/${userId}/effective`),
    enabled: !!userId,
  });
}

export function useAuthorityAuditLog(page = 1) {
  return useQuery({
    queryKey: authorityKeys.auditLog(page),
    queryFn: () =>
      api.get<{
        data: AuditLogEntry[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      }>(`/authorities/audit-log?page=${page}&limit=20`),
    staleTime: 15_000,
  });
}

export function useUpdateAuthority() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, data }: { code: string; data: { description?: string; deprecated?: boolean } }) =>
      api.put<Authority>(`/authorities/${code}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: authorityKeys.lists() });
      qc.invalidateQueries({ queryKey: authorityKeys.drift() });
      toast.success('Authority updated');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update authority'),
  });
}
