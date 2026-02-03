import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';
import type {
  JiraConnection,
  JiraSite,
  JiraProject,
  JiraProjectSelection,
  SyncStatus,
  SyncRun,
} from '../types/intake';
import type { PaginatedResponse } from '../types';

export const jiraKeys = {
  all: ['jira'] as const,
  connections: () => [...jiraKeys.all, 'connections'] as const,
  sites: (connectionId: string) => [...jiraKeys.all, 'sites', connectionId] as const,
  projects: (siteId: string) => [...jiraKeys.all, 'projects', siteId] as const,
  syncStatus: () => [...jiraKeys.all, 'sync-status'] as const,
  syncRuns: (filters: Record<string, unknown>) => [...jiraKeys.all, 'sync-runs', filters] as const,
};

// ---- Connections ----

export function useJiraConnections() {
  return useQuery({
    queryKey: jiraKeys.connections(),
    queryFn: () => api.get<JiraConnection[]>('/integrations/jira/connections'),
    staleTime: 30_000,
  });
}

export function useConnectJira() {
  return useMutation({
    mutationFn: () => api.get<{ authorizationUrl: string }>('/integrations/jira/connect'),
    onSuccess: (data) => {
      // Redirect to Atlassian
      window.location.href = data.authorizationUrl;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to initiate Jira connection');
    },
  });
}

export function useDisconnectJira() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      api.delete(`/integrations/jira/connections/${connectionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jiraKeys.connections() });
      toast.success('Jira connection removed');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to disconnect');
    },
  });
}

// ---- Sites ----

export function useJiraSites(connectionId: string) {
  return useQuery({
    queryKey: jiraKeys.sites(connectionId),
    queryFn: () => api.get<JiraSite[]>(`/integrations/jira/connections/${connectionId}/sites`),
    enabled: !!connectionId,
    staleTime: 60_000,
  });
}

export function useSelectSites() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ connectionId, siteIds }: { connectionId: string; siteIds: string[] }) =>
      api.put<JiraSite[]>(`/integrations/jira/connections/${connectionId}/sites`, { siteIds }),
    onSuccess: (_, { connectionId }) => {
      queryClient.invalidateQueries({ queryKey: jiraKeys.sites(connectionId) });
      queryClient.invalidateQueries({ queryKey: jiraKeys.connections() });
      toast.success('Sites updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update sites');
    },
  });
}

// ---- Projects ----

export function useJiraProjects(siteId: string) {
  return useQuery({
    queryKey: jiraKeys.projects(siteId),
    queryFn: () => api.get<JiraProject[]>(`/integrations/jira/sites/${siteId}/projects`),
    enabled: !!siteId,
    staleTime: 60_000,
  });
}

export function useSelectProjects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      siteId,
      projects,
    }: {
      siteId: string;
      projects: Array<{ projectId: string; projectKey: string; projectName: string }>;
    }) =>
      api.put<JiraProjectSelection[]>(`/integrations/jira/sites/${siteId}/projects`, { projects }),
    onSuccess: (_, { siteId }) => {
      queryClient.invalidateQueries({ queryKey: jiraKeys.projects(siteId) });
      queryClient.invalidateQueries({ queryKey: jiraKeys.connections() });
      toast.success('Projects updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update projects');
    },
  });
}

// ---- Sync ----

export function useSyncStatus() {
  return useQuery({
    queryKey: jiraKeys.syncStatus(),
    queryFn: () => api.get<SyncStatus>('/integrations/jira/sync/status'),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useSyncRuns(filters: { page?: number; limit?: number; siteId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: jiraKeys.syncRuns(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));
      if (filters.siteId) params.set('siteId', filters.siteId);
      if (filters.status) params.set('status', filters.status);
      return api.get<PaginatedResponse<SyncRun>>(`/integrations/jira/sync/runs?${params.toString()}`);
    },
    staleTime: 15_000,
  });
}

export function useTriggerSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data?: { connectionId?: string; siteId?: string; fullResync?: boolean }) =>
      api.post<{ jobId: string; message: string }>('/integrations/jira/sync', data || {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jiraKeys.syncStatus() });
      toast.success('Sync job enqueued');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to trigger sync');
    },
  });
}
