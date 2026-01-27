import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuthStore, User } from '../stores/auth.store';
import { toast } from '../stores/toast';
import { useNavigate } from 'react-router-dom';

interface AuthResponse {
  user: User;
}

interface LoginInput {
  email: string;
  password: string;
}

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
};

/**
 * Fetch current user on app load
 */
export function useCurrentUser() {
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);

  return useQuery({
    queryKey: authKeys.me(),
    queryFn: async () => {
      try {
        const response = await api.get<AuthResponse>('/auth/me');
        setUser(response.user);
        return response.user;
      } catch {
        setUser(null);
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    meta: {
      onSettled: () => setLoading(false),
    },
  });
}

/**
 * Login mutation
 */
export function useLogin() {
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (input: LoginInput) =>
      api.post<AuthResponse>('/auth/login', input),
    onSuccess: (data) => {
      setUser(data.user);
      queryClient.setQueryData(authKeys.me(), data.user);
      toast.success('Logged in successfully');
      navigate('/initiatives');
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Login failed'
      );
    },
  });
}

/**
 * Logout mutation
 */
export function useLogout() {
  const logout = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => api.post('/auth/logout', {}),
    onSuccess: () => {
      logout();
      queryClient.clear();
      navigate('/login');
      toast.success('Logged out successfully');
    },
    onError: () => {
      // Even if the API call fails, clear local state
      logout();
      queryClient.clear();
      navigate('/login');
    },
  });
}

/**
 * Change password mutation
 */
export function useChangePassword() {
  const logout = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      api.put('/auth/password', input),
    onSuccess: () => {
      logout();
      queryClient.clear();
      toast.success('Password changed. Please log in again.');
      navigate('/login');
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Failed to change password'
      );
    },
  });
}

/**
 * Register user mutation (admin only)
 */
export function useRegisterUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      email: string;
      name: string;
      password: string;
      role?: string;
    }) => api.post<AuthResponse>('/auth/register', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User created successfully');
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Failed to create user'
      );
    },
  });
}
