import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';
import type { PaginatedResponse } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface JobProfileSkill {
  id: string;
  jobProfileId: string;
  skillName: string;
  expectedProficiency: number;
}

export interface CostBand {
  id: string;
  jobProfileId: string;
  annualCostMin: number | null;
  annualCostMax: number | null;
  hourlyRate: number | null;
  currency: string;
  effectiveDate: string;
}

export interface JobProfile {
  id: string;
  name: string;
  level: string | null;
  band: string | null;
  description: string | null;
  isActive: boolean;
  skills: JobProfileSkill[];
  costBand: CostBand | null;
  _count: { employees: number };
  createdAt: string;
  updatedAt: string;
}

export interface JobProfileFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface CreateJobProfileData {
  name: string;
  level?: string | null;
  band?: string | null;
  description?: string | null;
  isActive?: boolean;
  skills?: Array<{ skillName: string; expectedProficiency?: number }>;
  costBand?: {
    annualCostMin?: number | null;
    annualCostMax?: number | null;
    hourlyRate?: number | null;
    currency?: string;
    effectiveDate: string;
  } | null;
}

export interface UpdateJobProfileData {
  name?: string;
  level?: string | null;
  band?: string | null;
  description?: string | null;
  isActive?: boolean;
  skills?: Array<{ skillName: string; expectedProficiency?: number }>;
  costBand?: {
    annualCostMin?: number | null;
    annualCostMax?: number | null;
    hourlyRate?: number | null;
    currency?: string;
    effectiveDate: string;
  } | null;
}

// ============================================================================
// Query Keys
// ============================================================================

export const jobProfileKeys = {
  all: ['jobProfiles'] as const,
  lists: () => [...jobProfileKeys.all, 'list'] as const,
  list: (filters?: JobProfileFilters) => [...jobProfileKeys.lists(), filters] as const,
  details: () => [...jobProfileKeys.all, 'detail'] as const,
  detail: (id: string) => [...jobProfileKeys.details(), id] as const,
};

// ============================================================================
// Queries
// ============================================================================

export function useJobProfiles(filters?: JobProfileFilters) {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.isActive !== undefined) params.set('isActive', String(filters.isActive));
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: jobProfileKeys.list(filters),
    queryFn: () => api.get<PaginatedResponse<JobProfile>>(`/job-profiles${qs ? `?${qs}` : ''}`),
    staleTime: 30_000,
  });
}

export function useJobProfile(id: string) {
  return useQuery({
    queryKey: jobProfileKeys.detail(id),
    queryFn: () => api.get<JobProfile>(`/job-profiles/${id}`),
    enabled: !!id,
  });
}

// ============================================================================
// Mutations
// ============================================================================

export function useCreateJobProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateJobProfileData) =>
      api.post<JobProfile>('/job-profiles', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobProfileKeys.lists() });
      toast.success('Job profile created');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create job profile');
    },
  });
}

export function useUpdateJobProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateJobProfileData }) =>
      api.put<JobProfile>(`/job-profiles/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobProfileKeys.all });
      toast.success('Job profile updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update job profile');
    },
  });
}

export function useDeleteJobProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ success: boolean }>(`/job-profiles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobProfileKeys.lists() });
      toast.success('Job profile deleted');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete job profile');
    },
  });
}

export function useAssignJobProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ employeeId, jobProfileId }: { employeeId: string; jobProfileId: string | null }) =>
      api.put<unknown>(`/employees/${employeeId}/job-profile`, { jobProfileId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobProfileKeys.all });
      toast.success('Job profile assignment updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to assign job profile');
    },
  });
}
