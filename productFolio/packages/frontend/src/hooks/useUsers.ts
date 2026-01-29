import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'PRODUCT_OWNER' | 'BUSINESS_OWNER' | 'RESOURCE_MANAGER' | 'VIEWER';
}

export interface UsersResponse {
  data: User[];
}

export interface UserFilters {
  role?: string | string[];
  search?: string;
}

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters: UserFilters) => [...userKeys.lists(), filters] as const,
};

export function useUsers(filters: UserFilters = {}) {
  const params = new URLSearchParams();
  if (filters.role) {
    if (Array.isArray(filters.role)) {
      filters.role.forEach((r) => params.append('role', r));
    } else {
      params.set('role', filters.role);
    }
  }
  if (filters.search) params.set('search', filters.search);

  const queryString = params.toString();
  const endpoint = `/users${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: () => api.get<UsersResponse>(endpoint),
  });
}
