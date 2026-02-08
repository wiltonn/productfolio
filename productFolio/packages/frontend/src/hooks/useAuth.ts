import { useQuery } from '@tanstack/react-query';
import { useAuth0 } from '@auth0/auth0-react';
import { api } from '../api/client';
import { useAuthStore, User } from '../stores/auth.store';

interface AuthResponse {
  user: User;
}

export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
};

/**
 * Fetch current user on app load.
 * Calls GET /auth/me to get local user profile (role, etc.)
 * Only fires once the token provider is ready (tokenReady = true).
 */
export function useCurrentUser(tokenReady = false) {
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
    enabled: tokenReady,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    meta: {
      onSettled: () => setLoading(false),
    },
  });
}

/**
 * Logout via Auth0.
 * Returns a function that triggers Auth0 logout and clears local state.
 */
export function useLogout() {
  const { logout: auth0Logout } = useAuth0();
  const clearUser = useAuthStore((state) => state.logout);

  const logout = () => {
    clearUser();
    auth0Logout({ logoutParams: { returnTo: window.location.origin } });
  };

  return { logout, isPending: false };
}
