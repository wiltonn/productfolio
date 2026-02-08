import { Navigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useAuthStore, UserRole } from '../../stores/auth.store';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated: auth0Authenticated, isLoading: auth0Loading } = useAuth0();
  const { isLoading: storeLoading, user } = useAuthStore();

  // Show loading spinner while Auth0 is loading OR while /auth/me hasn't resolved
  if (auth0Loading || (auth0Authenticated && storeLoading)) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
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
          <p className="text-surface-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated via Auth0
  if (!auth0Authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role-based access (user comes from Zustand, populated by /auth/me)
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
