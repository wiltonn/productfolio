import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';

export type UserRole = 'ADMIN' | 'PRODUCT_OWNER' | 'BUSINESS_OWNER' | 'RESOURCE_MANAGER' | 'VIEWER';
export type SeatType = 'decision' | 'observer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  auth0Linked: boolean;
  seatType: SeatType;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UserDetail extends User {
  permissions: string[];
  updatedAt: string;
}

export interface UsersResponse {
  data: User[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface UserFilters {
  role?: string;
  search?: string;
  includeInactive?: boolean;
  page?: number;
  limit?: number;
}

export interface CreateUserInput {
  email: string;
  name: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
}

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters: UserFilters) => [...userKeys.lists(), filters] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
};

export function useUsers(filters: UserFilters = {}) {
  const params = new URLSearchParams();
  if (filters.role) params.set('role', filters.role);
  if (filters.search) params.set('search', filters.search);
  if (filters.includeInactive) params.set('includeInactive', 'true');
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const queryString = params.toString();
  const endpoint = `/users${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: () => api.get<UsersResponse>(endpoint),
    staleTime: 60_000,
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => api.get<UserDetail>(`/users/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserInput) => api.post<User>('/users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success('User created successfully');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create user'),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserInput }) =>
      api.put<User>(`/users/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.lists() });
      qc.invalidateQueries({ queryKey: userKeys.details() });
      toast.success('User updated successfully');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update user'),
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success('User deactivated successfully');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to deactivate user'),
  });
}
