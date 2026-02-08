import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';

export function LoginPage() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  // Redirect if already logged in
  if (isAuthenticated) {
    return <Navigate to="/initiatives" replace />;
  }

  // Auto-redirect to Auth0 Universal Login
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      loginWithRedirect();
    }
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  // Show spinner while Auth0 is loading or redirecting
  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 shadow-soft mb-4">
            <span className="text-xl font-bold text-white">P</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-surface-900">
            ProductFolio
          </h1>
          <p className="mt-2 text-surface-500">Redirecting to login...</p>
        </div>
        <div className="flex justify-center">
          <svg
            className="animate-spin h-8 w-8 text-accent-600"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
