import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildTestApp, testUuid } from './setup.js';
import { WorkflowError } from '../lib/errors.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRedis = {
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
};

vi.mock('../lib/redis.js', () => ({
  getRedisClient: () => mockRedis,
  getCachedData: vi.fn(),
  setCachedData: vi.fn(),
  deleteKey: vi.fn(),
  CACHE_KEYS: { scenarioCalculation: (id: string) => `scenario:${id}:calculations` },
  CACHE_TTL: { CALCULATION: 300 },
}));

vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    scenario: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    allocation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    employee: {
      findUnique: vi.fn(),
    },
    initiative: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    allocationPeriod: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    period: {
      findMany: vi.fn(),
    },
    skillPool: {
      findMany: vi.fn(),
    },
    tokenSupply: {
      findMany: vi.fn(),
    },
    tokenDemand: {
      findMany: vi.fn(),
    },
    featureFlag: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fns: any[]) => Promise.all(fns)),
  };
  return { prisma: mockPrisma };
});

const mockCalculateCapacityDemand = vi.fn();
const mockCalculate = vi.fn();

vi.mock('../services/allocation.service.js', () => ({
  allocationService: {
    calculateCapacityDemand: mockCalculateCapacityDemand,
    compareScenarios: vi.fn(),
  },
  AllocationService: vi.fn(),
}));

vi.mock('../services/scenario-calculator.service.js', () => ({
  scenarioCalculatorService: {
    calculate: mockCalculate,
    invalidateCache: vi.fn(),
  },
  ScenarioCalculatorService: vi.fn(),
}));

vi.mock('../services/scenarios.service.js', () => ({
  scenariosService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updatePriorities: vi.fn(),
    transitionStatus: vi.fn(),
    clone: vi.fn(),
  },
  ScenariosService: vi.fn(),
}));

vi.mock('../services/baseline.service.js', () => ({
  baselineService: {
    getHistory: vi.fn(),
    createRevision: vi.fn(),
  },
}));

vi.mock('../services/delta-engine.service.js', () => ({
  deltaEngineService: {
    getDelta: vi.fn(),
    getDeltas: vi.fn(),
  },
}));

vi.mock('../services/ramp.service.js', () => ({
  rampService: {
    recomputeRamp: vi.fn(),
  },
}));

vi.mock('../services/feature-flag.service.js', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    isEnabled: vi.fn(),
  };
});

import { prisma } from '../lib/prisma.js';
import { isEnabled } from '../services/feature-flag.service.js';

const mockPrisma = prisma as any;
const mockIsEnabled = isEnabled as any;

// ---------------------------------------------------------------------------
// Integration tests: Legacy outputs unchanged through PlanningService
// ---------------------------------------------------------------------------

describe('Legacy outputs through PlanningService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsEnabled.mockResolvedValue(true);
  });

  async function buildScenarioApp() {
    const app = await buildTestApp();
    const { default: featureFlagPlugin } = await import('../plugins/feature-flag.plugin.js');
    await app.register(featureFlagPlugin);

    app.decorate('authenticate', async () => {});
    app.decorate('authorize', () => async () => {});
    app.decorateRequest('user', { sub: testUuid('999'), role: 'ADMIN' });

    const { scenariosRoutes } = await import('../routes/scenarios.js');
    await app.register(scenariosRoutes);
    await app.ready();
    return app;
  }

  it('GET /api/scenarios/:id/capacity-demand delegates to allocationService for LEGACY scenario', async () => {
    // PlanningService.getEngine reads planningMode
    mockPrisma.scenario.findUnique.mockResolvedValue({
      planningMode: 'LEGACY',
    });

    const expectedResult = [
      { quarter: 'Q1 2025', skill: 'backend', demand: 200, capacity: 150, gap: -50 },
      { quarter: 'Q1 2025', skill: 'frontend', demand: 100, capacity: 120, gap: 20 },
    ];
    mockCalculateCapacityDemand.mockResolvedValue(expectedResult);

    const app = await buildScenarioApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/scenarios/${testUuid('5c0')}/capacity-demand`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual(expectedResult);
    expect(mockCalculateCapacityDemand).toHaveBeenCalledWith(testUuid('5c0'));
    await app.close();
  });

  it('GET /api/scenarios/:id/calculator delegates to scenarioCalculatorService for LEGACY scenario', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      planningMode: 'LEGACY',
    });

    const expectedResult = {
      scenarioId: testUuid('5c0'),
      scenarioName: 'Q1 Plan',
      periods: [
        { periodId: testUuid('aaa'), label: 'Q1 2025', demand: 400, capacity: 350 },
      ],
      summary: { totalDemandHours: 400, totalCapacityHours: 350 },
      cacheHit: false,
    };
    mockCalculate.mockResolvedValue(expectedResult);

    const app = await buildScenarioApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/scenarios/${testUuid('5c0')}/calculator`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.scenarioId).toBe(testUuid('5c0'));
    expect(body.summary).toEqual(expectedResult.summary);
    expect(mockCalculate).toHaveBeenCalledWith(testUuid('5c0'), expect.any(Object));
    expect(res.headers['x-cache']).toBe('MISS');
    await app.close();
  });

  it('GET /api/scenarios/:id/capacity-demand throws WorkflowError for TOKEN scenario', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      planningMode: 'TOKEN',
    });

    const app = await buildScenarioApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/scenarios/${testUuid('5c1')}/capacity-demand`,
    });

    // TokenFlowModel.getCapacityDemand throws WorkflowError (422)
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('GET /api/scenarios/:id/calculator throws WorkflowError for TOKEN scenario', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      planningMode: 'TOKEN',
    });

    const app = await buildScenarioApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/scenarios/${testUuid('5c1')}/calculator`,
    });

    // TokenFlowModel.getCalculator throws WorkflowError (422)
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('GET /api/scenarios/:id/capacity-demand returns 404 for missing scenario', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue(null);

    const app = await buildScenarioApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/scenarios/${testUuid('404')}/capacity-demand`,
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
