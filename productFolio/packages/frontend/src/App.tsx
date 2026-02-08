import { useEffect, useState, useCallback } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { router } from './router';
import { Toaster } from './components/ui/Toaster';
import { OfflineIndicator } from './components/ui/OfflineIndicator';
import { KeyboardShortcutsHelp } from './components/ui/KeyboardShortcutsHelp';
import { useCurrentUser } from './hooks/useAuth';
import { useAuthStore } from './stores/auth.store';
import { setTokenProvider } from './api/client';

/**
 * Syncs Auth0 authentication state with the local Zustand store
 * and wires up the API client token provider.
 */
function AuthSyncProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: auth0Loading, getAccessTokenSilently } = useAuth0();
  const setLoading = useAuthStore((state) => state.setLoading);
  const setUser = useAuthStore((state) => state.setUser);
  const [tokenReady, setTokenReady] = useState(false);

  // Wire up the API client to use Auth0 access tokens
  const stableGetToken = useCallback(() => getAccessTokenSilently(), [getAccessTokenSilently]);

  useEffect(() => {
    if (isAuthenticated) {
      setTokenProvider(stableGetToken);
      setTokenReady(true);
    } else {
      setTokenReady(false);
    }
  }, [isAuthenticated, stableGetToken]);

  // Fetch local user profile once token provider is ready
  useCurrentUser(tokenReady);

  // Sync loading state: true while Auth0 is loading OR /auth/me hasn't resolved
  useEffect(() => {
    if (auth0Loading) {
      setLoading(true);
    } else if (!isAuthenticated) {
      // Not authenticated via Auth0 — clear local state
      setUser(null);
    }
  }, [auth0Loading, isAuthenticated, setLoading, setUser]);

  // Show nothing while auth is initializing to prevent flash
  if (auth0Loading) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Root application component.
 * Sets up providers and global configurations.
 */
function App() {
  return (
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
        scope: 'openid profile email',
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AuthSyncProvider>
          <RouterProvider router={router} />
          <Toaster />
          <OfflineIndicator />
          <KeyboardShortcutsHelp />
        </AuthSyncProvider>
      </QueryClientProvider>
    </Auth0Provider>
  );
}

export default App;
