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
  defaultCapacityHours: number;
  createdAt: string;
  updatedAt: string;
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

export const employeeKeys = {
  all: ['employees'] as const,
  lists: () => [...employeeKeys.all, 'list'] as const,
  list: (filters: EmployeeFilters) => [...employeeKeys.lists(), filters] as const,
  details: () => [...employeeKeys.all, 'detail'] as const,
  detail: (id: string) => [...employeeKeys.details(), id] as const,
  skills: (id: string) => [...employeeKeys.detail(id), 'skills'] as const,
  capacity: (id: string) => [...employeeKeys.detail(id), 'capacity'] as const,
  availability: (id: string, startDate: string, endDate: string) =>
    [...employeeKeys.detail(id), 'availability', startDate, endDate] as const,
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

export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Employee>) =>
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
    mutationFn: ({ id, data }: { id: string; data: Partial<Employee> }) =>
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
