import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useCurrentUser, useLogin, useLogout } from './useAuth';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth.store';

// Mock API client
vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock router
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock toast
vi.mock('../stores/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('useAuth hooks', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create fresh query client for each test
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
          retry: false,
        },
      },
      logger: {
        log: console.log,
        warn: console.warn,
        error: () => {},
      },
    });

    // Reset auth store
    useAuthStore.setState({ user: null, isLoading: true });
  });

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  describe('useCurrentUser', () => {
    it('should fetch current user on mount', async () => {
      const mockUser = {
        id: '1',
        email: 'test@test.com',
        name: 'Test User',
        role: 'PLANNER',
      };

      vi.mocked(api.get).mockResolvedValue({ user: mockUser });

      const { result } = renderHook(() => useCurrentUser(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockUser);
      expect(useAuthStore.getState().user).toEqual(mockUser);
    });

    it('should set user to null when request fails', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Unauthorized'));

      const { result } = renderHook(() => useCurrentUser(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('should set loading to false after fetch', async () => {
      vi.mocked(api.get).mockResolvedValue({ user: null });

      renderHook(() => useCurrentUser(), { wrapper });

      await waitFor(() => {
        expect(useAuthStore.getState().isLoading).toBe(false);
      });
    });
  });

  describe('useLogin', () => {
    it('should login successfully', async () => {
      const mockUser = {
        id: '1',
        email: 'test@test.com',
        name: 'Test User',
        role: 'PLANNER',
      };

      vi.mocked(api.post).mockResolvedValue({ user: mockUser });

      const { result } = renderHook(() => useLogin(), { wrapper });

      result.current.mutate({
        email: 'test@test.com',
        password: 'password',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(api.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@test.com',
        password: 'password',
      });

      expect(useAuthStore.getState().user).toEqual(mockUser);
    });

    it('should handle login error', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Invalid credentials'));

      const { result } = renderHook(() => useLogin(), { wrapper });

      result.current.mutate({
        email: 'test@test.com',
        password: 'wrong',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(useAuthStore.getState().user).toBeNull();
    });

    it('should update query cache on success', async () => {
      const mockUser = {
        id: '1',
        email: 'test@test.com',
        name: 'Test User',
        role: 'PLANNER',
      };

      vi.mocked(api.post).mockResolvedValue({ user: mockUser });

      const { result } = renderHook(() => useLogin(), { wrapper });

      result.current.mutate({
        email: 'test@test.com',
        password: 'password',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const cachedUser = queryClient.getQueryData(['auth', 'me']);
      expect(cachedUser).toEqual(mockUser);
    });
  });

  describe('useLogout', () => {
    it('should logout successfully', async () => {
      // Set initial user
      useAuthStore.setState({
        user: {
          id: '1',
          email: 'test@test.com',
          name: 'Test User',
          role: 'PLANNER',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      vi.mocked(api.post).mockResolvedValue({});

      const { result } = renderHook(() => useLogout(), { wrapper });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(api.post).toHaveBeenCalledWith('/auth/logout', {});
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('should clear user even if API call fails', async () => {
      useAuthStore.setState({
        user: {
          id: '1',
          email: 'test@test.com',
          name: 'Test User',
          role: 'PLANNER',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      vi.mocked(api.post).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useLogout(), { wrapper });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(useAuthStore.getState().user).toBeNull();
    });

    it('should clear query cache on logout', async () => {
      // Set some cached data
      queryClient.setQueryData(['auth', 'me'], {
        id: '1',
        email: 'test@test.com',
        name: 'Test User',
      });

      vi.mocked(api.post).mockResolvedValue({});

      const { result } = renderHook(() => useLogout(), { wrapper });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Query cache should be cleared
      const cachedData = queryClient.getQueryData(['auth', 'me']);
      expect(cachedData).toBeUndefined();
    });
  });
});
