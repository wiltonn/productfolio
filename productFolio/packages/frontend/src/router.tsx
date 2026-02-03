import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LoginPage, ProtectedRoute } from './components/auth';
import {
  PageLoadingSkeleton,
  DetailPageSkeleton,
  PlannerPageSkeleton,
  ErrorBoundary,
} from './components/ui';

// Lazy-load route components for code splitting
// Each route becomes its own chunk, loaded on-demand
const InitiativesList = lazy(() =>
  import('./pages/InitiativesList').then((m) => ({ default: m.InitiativesList }))
);

const InitiativeDetail = lazy(() =>
  import('./pages/InitiativeDetail').then((m) => ({ default: m.InitiativeDetail }))
);

const Capacity = lazy(() =>
  import('./pages/Capacity').then((m) => ({ default: m.Capacity }))
);

const ScenariosList = lazy(() =>
  import('./pages/ScenariosList').then((m) => ({ default: m.ScenariosList }))
);

const ScenarioPlanner = lazy(() =>
  import('./pages/ScenarioPlanner').then((m) => ({ default: m.ScenarioPlanner }))
);

const Reports = lazy(() =>
  import('./pages/Reports').then((m) => ({ default: m.Reports }))
);

const DeliveryForecast = lazy(() =>
  import('./pages/DeliveryForecast').then((m) => ({ default: m.DeliveryForecast }))
);

const OrgTreeAdmin = lazy(() =>
  import('./pages/OrgTreeAdmin').then((m) => ({ default: m.OrgTreeAdmin }))
);

const Approvals = lazy(() =>
  import('./pages/Approvals').then((m) => ({ default: m.Approvals }))
);

const PortfolioAreas = lazy(() =>
  import('./pages/PortfolioAreas').then((m) => ({ default: m.PortfolioAreas }))
);

const JiraSettings = lazy(() =>
  import('./pages/JiraSettings').then((m) => ({ default: m.JiraSettings }))
);

const IntakeList = lazy(() =>
  import('./pages/IntakeList').then((m) => ({ default: m.IntakeList }))
);

const IntakeRequestList = lazy(() =>
  import('./pages/IntakeRequestList').then((m) => ({ default: m.IntakeRequestList }))
);

const IntakeRequestDetail = lazy(() =>
  import('./pages/IntakeRequestDetail').then((m) => ({ default: m.IntakeRequestDetail }))
);

const Unauthorized = lazy(() =>
  import('./pages/Unauthorized').then((m) => ({ default: m.Unauthorized }))
);

// Suspense wrappers with appropriate skeletons for each route type
function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoadingSkeleton />}>{children}</Suspense>;
}

function LazyDetailPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<DetailPageSkeleton />}>{children}</Suspense>;
}

function LazyPlannerPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PlannerPageSkeleton />}>{children}</Suspense>;
}

// Minimal fallback for non-critical pages
function MinimalFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-3 text-surface-500">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span className="text-sm font-medium">Loading...</span>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/unauthorized',
    element: (
      <Suspense fallback={<MinimalFallback />}>
        <Unauthorized />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <ErrorBoundary>
          <Layout />
        </ErrorBoundary>
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/initiatives" replace />,
      },
      {
        path: 'initiatives',
        element: (
          <ErrorBoundary>
            <LazyPage>
              <InitiativesList />
            </LazyPage>
          </ErrorBoundary>
        ),
      },
      {
        path: 'initiatives/:id',
        element: (
          <ErrorBoundary>
            <LazyDetailPage>
              <InitiativeDetail />
            </LazyDetailPage>
          </ErrorBoundary>
        ),
      },
      {
        path: 'capacity',
        element: (
          <ErrorBoundary>
            <LazyPage>
              <Capacity />
            </LazyPage>
          </ErrorBoundary>
        ),
      },
      {
        path: 'scenarios',
        element: (
          <ErrorBoundary>
            <LazyPage>
              <ScenariosList />
            </LazyPage>
          </ErrorBoundary>
        ),
      },
      {
        path: 'scenarios/:id',
        element: (
          <ErrorBoundary>
            <LazyPlannerPage>
              <ScenarioPlanner />
            </LazyPlannerPage>
          </ErrorBoundary>
        ),
      },
      {
        path: 'reports',
        element: (
          <ErrorBoundary>
            <LazyPage>
              <Reports />
            </LazyPage>
          </ErrorBoundary>
        ),
      },
      {
        path: 'delivery',
        element: (
          <ErrorBoundary>
            <LazyPage>
              <DeliveryForecast />
            </LazyPage>
          </ErrorBoundary>
        ),
      },
      {
        path: 'admin/org-tree',
        element: (
          <ErrorBoundary>
            <LazyPage>
              <OrgTreeAdmin />
            </LazyPage>
          </ErrorBoundary>
        ),
      },
      {
        path: 'admin/portfolio-areas',
        element: (
          <ErrorBoundary>
            <LazyPage>
              <PortfolioAreas />
            </LazyPage>
          </ErrorBoundary>
        ),
      },
      {
        path: 'approvals',
        element: (
          <ErrorBoundary>
            <LazyPage>
              <Approvals />
            </LazyPage>
          </ErrorBoundary>
        ),
      },
      {
        path: 'intake',
        element: (
          <ErrorBoundary>
            <LazyPage>
              <IntakeList />
            </LazyPage>
          </ErrorBoundary>
        ),
      },
      {
        path: 'intake-requests',
        element: (
          <ErrorBoundary>
            <LazyPage>
              <IntakeRequestList />
            </LazyPage>
          </ErrorBoundary>
        ),
      },
      {
        path: 'intake-requests/:id',
        element: (
          <ErrorBoundary>
            <LazyDetailPage>
              <IntakeRequestDetail />
            </LazyDetailPage>
          </ErrorBoundary>
        ),
      },
      {
        path: 'admin/jira-settings',
        element: (
          <ErrorBoundary>
            <LazyPage>
              <JiraSettings />
            </LazyPage>
          </ErrorBoundary>
        ),
      },
    ],
  },
]);
