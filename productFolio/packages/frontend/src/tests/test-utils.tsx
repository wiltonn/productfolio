import { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

/**
 * Create a new QueryClient for each test
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
    logger: {
      log: console.log,
      warn: console.warn,
      error: () => {}, // Suppress error logs in tests
    },
  });
}

/**
 * Wrapper with all providers needed for testing
 */
interface AllProvidersProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

function AllProviders({ children, queryClient }: AllProvidersProps) {
  const client = queryClient || createTestQueryClient();

  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

/**
 * Custom render function with providers
 */
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  options?: CustomRenderOptions
) {
  const { queryClient, ...renderOptions } = options || {};

  return render(ui, {
    wrapper: ({ children }) => (
      <AllProviders queryClient={queryClient}>{children}</AllProviders>
    ),
    ...renderOptions,
  });
}

/**
 * Mock initiative data generator
 */
export function createMockInitiative(overrides?: any) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    title: 'Test Initiative',
    description: 'Test Description',
    status: 'PROPOSED',
    deliveryHealth: null,
    targetQuarter: '2024-Q1',
    businessOwnerId: '00000000-0000-0000-0000-000000000100',
    productOwnerId: '00000000-0000-0000-0000-000000000101',
    businessOwner: {
      id: '00000000-0000-0000-0000-000000000100',
      name: 'Business Owner',
      email: 'business@test.com',
    },
    productOwner: {
      id: '00000000-0000-0000-0000-000000000101',
      name: 'Product Owner',
      email: 'product@test.com',
    },
    customFields: null,
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
    ...overrides,
  };
}

/**
 * Mock employee data generator
 */
export function createMockEmployee(overrides?: any) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Employee',
    email: 'employee@test.com',
    role: 'Developer',
    employmentType: 'FULL_TIME',
    hoursPerWeek: 40,
    skills: { frontend: 3, backend: 4 },
    managerId: null,
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
    ...overrides,
  };
}

/**
 * Mock scenario data generator
 */
export function createMockScenario(overrides?: any) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Scenario',
    quarterRange: '2024-Q1:2024-Q4',
    assumptions: {},
    priorityRankings: [],
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
    ...overrides,
  };
}

/**
 * Mock scope item data generator
 */
export function createMockScopeItem(overrides?: any) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    initiativeId: '00000000-0000-0000-0000-000000000010',
    name: 'Test Scope Item',
    description: 'Test scope item description',
    skillDemand: { frontend: 2, backend: 3 },
    estimateP50: 100,
    estimateP90: 150,
    quarterDistribution: { '2024-Q1': 0.6, '2024-Q2': 0.4 },
    approvalStatus: 'DRAFT',
    approvedBy: null,
    approvedAt: null,
    version: 1,
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
    ...overrides,
  };
}

/**
 * Mock user data generator
 */
export function createMockUser(overrides?: any) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'test@example.com',
    name: 'Test User',
    role: 'PLANNER',
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
    ...overrides,
  };
}

/**
 * Wait for loading states to complete
 */
export async function waitForLoadingToFinish() {
  const { waitFor } = await import('@testing-library/react');
  await waitFor(
    () => {
      expect(document.querySelector('[data-testid="loading"]')).not.toBeInTheDocument();
    },
    { timeout: 3000 }
  );
}

// Re-export everything from testing library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
