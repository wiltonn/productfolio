import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';

export interface Employee {
  id: string;
  name: string;
  email: string;
  title: string | null;
  department: string | null;
  managerId: string | null;
  skills: string[];
  domains: string[];
  defaultCapacityHours: number;
  createdAt: string;
  updatedAt: string;
}

export interface Domain {
  id: string;
  employeeId: string;
  name: string;
  proficiency: number;
  createdAt: string;
  updatedAt: string;
}

// Input types for API calls (matches backend schema)
export interface CreateEmployeeInput {
  name: string;
  role: string;
  managerId?: string | null;
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR' | 'INTERN';
  hoursPerWeek?: number;
  activeStart?: string;
  activeEnd?: string | null;
}

export interface UpdateEmployeeInput {
  name?: string;
  role?: string;
  managerId?: string | null;
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR' | 'INTERN';
  hoursPerWeek?: number;
  activeStart?: string;
  activeEnd?: string | null;
}

export interface Skill {
  id: string;
  employeeId: string;
  skillName: string;
  proficiencyLevel: number;
  createdAt: string;
  updatedAt: string;
}

export interface CapacityEntry {
  id: string;
  employeeId: string;
  date: string;
  availableHours: number;
  notes: string | null;
}

export interface Availability {
  totalHours: number;
  allocatedHours: number;
  availableHours: number;
  utilizationPercent: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface EmployeeFilters {
  page?: number;
  limit?: number;
  department?: string;
  skill?: string;
  search?: string;
}

export interface EmployeeAllocation {
  id: string;
  scenarioId: string;
  scenarioName: string;
  initiativeId: string | null;
  initiativeTitle: string | null;
  initiativeStatus: string | null;
  startDate: string;
  endDate: string;
  percentage: number;
}

export interface QuarterAllocationSummary {
  currentQuarterPct: number;
  nextQuarterPct: number;
  allocations: {
    id: string;
    scenarioId: string;
    scenarioName: string;
    initiativeId: string | null;
    initiativeTitle: string | null;
    initiativeStatus: string | null;
    startDate: string;
    endDate: string;
    percentage: number;
  }[];
}

export type AllocationSummariesResponse = Record<string, QuarterAllocationSummary>;

export const employeeKeys = {
  all: ['employees'] as const,
  lists: () => [...employeeKeys.all, 'list'] as const,
  list: (filters: EmployeeFilters) => [...employeeKeys.lists(), filters] as const,
  details: () => [...employeeKeys.all, 'detail'] as const,
  detail: (id: string) => [...employeeKeys.details(), id] as const,
  skills: (id: string) => [...employeeKeys.detail(id), 'skills'] as const,
  domains: (id: string) => [...employeeKeys.detail(id), 'domains'] as const,
  capacity: (id: string) => [...employeeKeys.detail(id), 'capacity'] as const,
  allocations: (id: string) => [...employeeKeys.detail(id), 'allocations'] as const,
  availability: (id: string, startDate: string, endDate: string) =>
    [...employeeKeys.detail(id), 'availability', startDate, endDate] as const,
  allocationSummaries: (ids: string[], dates: string) =>
    [...employeeKeys.all, 'allocation-summaries', ids.join(','), dates] as const,
  ptoHours: (ids: string[], dates: string) =>
    [...employeeKeys.all, 'pto-hours', ids.join(','), dates] as const,
};

export function useEmployees(filters: EmployeeFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.department) params.set('department', filters.department);
  if (filters.skill) params.set('skill', filters.skill);
  if (filters.search) params.set('search', filters.search);

  const queryString = params.toString();
  const endpoint = `/employees${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: employeeKeys.list(filters),
    queryFn: () => api.get<PaginatedResponse<Employee>>(endpoint),
  });
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: employeeKeys.detail(id),
    queryFn: () => api.get<Employee>(`/employees/${id}`),
    enabled: !!id,
  });
}

export function useEmployeeAllocations(employeeId: string) {
  return useQuery({
    queryKey: employeeKeys.allocations(employeeId),
    queryFn: () => api.get<EmployeeAllocation[]>(`/employees/${employeeId}/allocations`),
    enabled: !!employeeId,
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateEmployeeInput) =>
      api.post<Employee>('/employees', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
      toast.success('Employee created successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create employee');
    },
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEmployeeInput }) =>
      api.put<Employee>(`/employees/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
      toast.success('Employee updated successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update employee');
    },
  });
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/employees/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
      toast.success('Employee deleted successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete employee');
    },
  });
}

// Skills hooks
export function useEmployeeSkills(employeeId: string) {
  return useQuery({
    queryKey: employeeKeys.skills(employeeId),
    queryFn: () => api.get<{ skills: Skill[] }>(`/employees/${employeeId}/skills`),
    enabled: !!employeeId,
  });
}

export function useAddSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      employeeId,
      data,
    }: {
      employeeId: string;
      data: { skillName: string; proficiencyLevel?: number };
    }) => api.post<Skill>(`/employees/${employeeId}/skills`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.skills(variables.employeeId) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.detail(variables.employeeId) });
      toast.success('Skill added successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add skill');
    },
  });
}

export function useUpdateSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      employeeId,
      skillId,
      data,
    }: {
      employeeId: string;
      skillId: string;
      data: { proficiencyLevel?: number };
    }) => api.put<Skill>(`/employees/${employeeId}/skills/${skillId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.skills(variables.employeeId) });
      toast.success('Skill updated successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update skill');
    },
  });
}

export function useRemoveSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ employeeId, skillId }: { employeeId: string; skillId: string }) =>
      api.delete(`/employees/${employeeId}/skills/${skillId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.skills(variables.employeeId) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.detail(variables.employeeId) });
      toast.success('Skill removed successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to remove skill');
    },
  });
}

// Domain hooks
export function useEmployeeDomains(employeeId: string) {
  return useQuery({
    queryKey: employeeKeys.domains(employeeId),
    queryFn: () => api.get<{ domains: Domain[] }>(`/employees/${employeeId}/domains`),
    enabled: !!employeeId,
  });
}

export function useAddDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      employeeId,
      data,
    }: {
      employeeId: string;
      data: { name: string; proficiency?: number };
    }) => api.post<Domain>(`/employees/${employeeId}/domains`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.domains(variables.employeeId) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.detail(variables.employeeId) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
      toast.success('Domain added successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add domain');
    },
  });
}

export function useUpdateDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      employeeId,
      domainId,
      data,
    }: {
      employeeId: string;
      domainId: string;
      data: { proficiency: number };
    }) => api.put<Domain>(`/employees/${employeeId}/domains/${domainId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.domains(variables.employeeId) });
      toast.success('Domain updated successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update domain');
    },
  });
}

export function useRemoveDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ employeeId, domainId }: { employeeId: string; domainId: string }) =>
      api.delete(`/employees/${employeeId}/domains/${domainId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.domains(variables.employeeId) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.detail(variables.employeeId) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
      toast.success('Domain removed successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to remove domain');
    },
  });
}

// Capacity hooks
export function useEmployeeCapacity(employeeId: string) {
  return useQuery({
    queryKey: employeeKeys.capacity(employeeId),
    queryFn: () => api.get<{ capacity: CapacityEntry[] }>(`/employees/${employeeId}/capacity`),
    enabled: !!employeeId,
  });
}

export function useUpdateCapacity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      employeeId,
      entries,
    }: {
      employeeId: string;
      entries: Array<{ date: string; availableHours: number; notes?: string }>;
    }) => api.put<{ capacity: CapacityEntry[] }>(`/employees/${employeeId}/capacity`, { entries }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.capacity(variables.employeeId) });
      toast.success('Capacity updated successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update capacity');
    },
  });
}

export function useEmployeeAvailability(employeeId: string, startDate: string, endDate: string) {
  const params = new URLSearchParams({ startDate, endDate });

  return useQuery({
    queryKey: employeeKeys.availability(employeeId, startDate, endDate),
    queryFn: () =>
      api.get<{ availability: Availability }>(`/employees/${employeeId}/availability?${params}`),
    enabled: !!employeeId && !!startDate && !!endDate,
  });
}

export function useEmployeeAllocationSummaries(
  employeeIds: string[],
  currentQuarterStart: string,
  currentQuarterEnd: string,
  nextQuarterStart: string,
  nextQuarterEnd: string
) {
  const params = new URLSearchParams({
    employeeIds: employeeIds.join(','),
    currentQuarterStart,
    currentQuarterEnd,
    nextQuarterStart,
    nextQuarterEnd,
  });

  const datesKey = `${currentQuarterStart}-${currentQuarterEnd}-${nextQuarterStart}-${nextQuarterEnd}`;

  return useQuery({
    queryKey: employeeKeys.allocationSummaries(employeeIds, datesKey),
    queryFn: () =>
      api.get<AllocationSummariesResponse>(`/employees/allocation-summaries?${params}`),
    enabled: employeeIds.length > 0,
    staleTime: 30_000,
  });
}

export type PtoHoursResponse = Record<string, { currentQuarterPtoHours: number; nextQuarterPtoHours: number }>;

export function useEmployeePtoHours(
  employeeIds: string[],
  currentQuarterStart: string,
  currentQuarterEnd: string,
  nextQuarterStart: string,
  nextQuarterEnd: string
) {
  const params = new URLSearchParams({
    employeeIds: employeeIds.join(','),
    currentQuarterStart,
    currentQuarterEnd,
    nextQuarterStart,
    nextQuarterEnd,
  });

  const datesKey = `${currentQuarterStart}-${currentQuarterEnd}-${nextQuarterStart}-${nextQuarterEnd}`;

  return useQuery({
    queryKey: employeeKeys.ptoHours(employeeIds, datesKey),
    queryFn: () =>
      api.get<PtoHoursResponse>(`/employees/pto-hours?${params}`),
    enabled: employeeIds.length > 0,
    staleTime: 30_000,
  });
}
