import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LoginPage, ProtectedRoute } from './components/auth';
import {
  InitiativesList,
  InitiativeDetail,
  Capacity,
  ScenariosList,
  ScenarioPlanner,
  Reports,
  Unauthorized,
} from './pages';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/unauthorized',
    element: <Unauthorized />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/initiatives" replace />,
      },
      {
        path: 'initiatives',
        element: <InitiativesList />,
      },
      {
        path: 'initiatives/:id',
        element: <InitiativeDetail />,
      },
      {
        path: 'capacity',
        element: <Capacity />,
      },
      {
        path: 'scenarios',
        element: <ScenariosList />,
      },
      {
        path: 'scenarios/:id',
        element: <ScenarioPlanner />,
      },
      {
        path: 'reports',
        element: <Reports />,
      },
    ],
  },
]);
