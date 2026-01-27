import Fastify, { FastifyInstance } from 'fastify';
import { registerErrorHandler } from '../lib/error-handler.js';

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  registerErrorHandler(app);

  return app;
}

export function createTestContext() {
  let app: FastifyInstance;

  return {
    async setup() {
      app = await buildTestApp();
      return app;
    },
    async teardown() {
      if (app) {
        await app.close();
      }
    },
    getApp() {
      return app;
    },
  };
}

// Helper to parse JSON response
export function parseJsonResponse<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

// Helper to generate test UUIDs
export function testUuid(suffix: string): string {
  const paddedSuffix = suffix.padStart(12, '0');
  return `00000000-0000-4000-8000-${paddedSuffix}`;
}

// Mock data generators
export const mockData = {
  user(overrides?: Partial<{ id: string; email: string; name: string; role: string }>) {
    return {
      id: testUuid('1'),
      email: 'test@example.com',
      name: 'Test User',
      role: 'VIEWER',
      ...overrides,
    };
  },

  employee(overrides?: Partial<{
    id: string;
    name: string;
    role: string;
    employmentType: string;
    hoursPerWeek: number;
  }>) {
    return {
      id: testUuid('1'),
      name: 'Test Employee',
      role: 'Developer',
      employmentType: 'FULL_TIME',
      hoursPerWeek: 40,
      ...overrides,
    };
  },

  initiative(overrides?: Partial<{
    id: string;
    title: string;
    description: string;
    status: string;
    targetQuarter: string;
    businessOwnerId: string;
    productOwnerId: string;
  }>) {
    return {
      id: testUuid('1'),
      title: 'Test Initiative',
      description: 'Test description',
      status: 'DRAFT',
      targetQuarter: '2024-Q1',
      businessOwnerId: testUuid('100'),
      productOwnerId: testUuid('101'),
      ...overrides,
    };
  },

  scopeItem(overrides?: Partial<{
    id: string;
    initiativeId: string;
    name: string;
    description: string;
    skillDemand: Record<string, number>;
    estimateP50: number;
    estimateP90: number;
    quarterDistribution: Record<string, number>;
  }>) {
    return {
      id: testUuid('1'),
      initiativeId: testUuid('10'),
      name: 'Test Scope Item',
      description: 'Test scope item description',
      skillDemand: { frontend: 2, backend: 3 },
      estimateP50: 100,
      estimateP90: 150,
      quarterDistribution: { '2024-Q1': 0.6, '2024-Q2': 0.4 },
      ...overrides,
    };
  },

  scenario(overrides?: Partial<{
    id: string;
    name: string;
    quarterRange: string;
    assumptions: Record<string, unknown>;
    priorityRankings: Array<{ initiativeId: string; rank: number }>;
  }>) {
    return {
      id: testUuid('1'),
      name: 'Test Scenario',
      quarterRange: '2024-Q1:2024-Q4',
      assumptions: {},
      priorityRankings: [],
      ...overrides,
    };
  },

  allocation(overrides?: Partial<{
    id: string;
    scenarioId: string;
    employeeId: string;
    initiativeId: string | null;
    startDate: Date;
    endDate: Date;
    percentage: number;
  }>) {
    return {
      id: testUuid('1'),
      scenarioId: testUuid('10'),
      employeeId: testUuid('20'),
      initiativeId: testUuid('30'),
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-03-31'),
      percentage: 100,
      ...overrides,
    };
  },
};
