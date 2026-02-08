import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildTestApp, testUuid } from './setup.js';

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
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    featureFlag: {
      findUnique: vi.fn(),
    },
    tokenSupply: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    tokenDemand: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    skillPool: {
      findUnique: vi.fn(),
    },
    initiative: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fns: any[]) => Promise.all(fns)),
  };
  return { prisma: mockPrisma };
});

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
// Planning mode route tests
// ---------------------------------------------------------------------------

describe('Planning Mode Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsEnabled.mockResolvedValue(true);
  });

  async function buildPlanningApp() {
    const app = await buildTestApp();
    const { default: featureFlagPlugin } = await import('../plugins/feature-flag.plugin.js');
    await app.register(featureFlagPlugin);

    app.decorate('authenticate', async () => {});
    app.decorate('authorize', () => async () => {});
    app.decorateRequest('user', { sub: testUuid('999'), role: 'ADMIN' });

    const { planningRoutes } = await import('../routes/planning.js');
    await app.register(planningRoutes);
    await app.ready();
    return app;
  }

  it('PUT /api/scenarios/:id/planning-mode with TOKEN mode returns 200', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
    });
    mockPrisma.scenario.update.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
    });

    const app = await buildPlanningApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/scenarios/${testUuid('5c0')}/planning-mode`,
      payload: { mode: 'TOKEN' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ planningMode: 'TOKEN' });
    await app.close();
  });

  it('PUT /api/scenarios/:id/planning-mode with invalid mode returns 400', async () => {
    const app = await buildPlanningApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/scenarios/${testUuid('5c0')}/planning-mode`,
      payload: { mode: 'INVALID' },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('PUT /api/scenarios/:id/planning-mode for non-existent scenario returns 404', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue(null);

    const app = await buildPlanningApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/scenarios/${testUuid('404')}/planning-mode`,
      payload: { mode: 'TOKEN' },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('PUT /api/scenarios/:id/planning-mode with LEGACY mode returns 200', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
    });
    mockPrisma.scenario.update.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'LEGACY',
    });

    const app = await buildPlanningApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/scenarios/${testUuid('5c0')}/planning-mode`,
      payload: { mode: 'LEGACY' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ planningMode: 'LEGACY' });
    await app.close();
  });
});
