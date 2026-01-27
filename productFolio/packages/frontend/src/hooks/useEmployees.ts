import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

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
    },
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Employee> }) =>
      api.patch<Employee>(`/employees/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
    },
  });
}
