import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { router } from './router';
import { Toaster } from './components/ui/Toaster';
import { OfflineIndicator } from './components/ui/OfflineIndicator';
import { KeyboardShortcutsHelp } from './components/ui/KeyboardShortcutsHelp';
import { useCurrentUser } from './hooks/useAuth';

/**
 * Initializes authentication state on app mount.
 * Fetches current user to populate the auth store.
 */
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { isLoading } = useCurrentUser();

  useEffect(() => {
    // Query runs automatically, this hook ensures auth state is initialized
  }, [isLoading]);

  return <>{children}</>;
}

/**
 * Root application component.
 * Sets up providers and global configurations.
 */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>
        <RouterProvider router={router} />
        <Toaster />
        <OfflineIndicator />
        <KeyboardShortcutsHelp />
      </AuthInitializer>
    </QueryClientProvider>
  );
}

export default App;
