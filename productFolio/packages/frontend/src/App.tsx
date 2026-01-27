import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { router } from './router';
import { Toaster } from './components/ui/Toaster';
import { useCurrentUser } from './hooks/useAuth';

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { isLoading } = useCurrentUser();

  // The query will set auth state in the store
  // We just need it to run on mount
  useEffect(() => {
    // Query is already running, this effect is just for explicit initialization
  }, [isLoading]);

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>
        <RouterProvider router={router} />
        <Toaster />
      </AuthInitializer>
    </QueryClientProvider>
  );
}

export default App;
