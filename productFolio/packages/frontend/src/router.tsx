import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import {
  InitiativesList,
  InitiativeDetail,
  Capacity,
  ScenariosList,
  ScenarioPlanner,
  Reports,
} from './pages';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
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
