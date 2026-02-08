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
    skillPool: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    featureFlag: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
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
// Helper
// ---------------------------------------------------------------------------

function mockPool(overrides: Record<string, any> = {}) {
  return {
    id: testUuid('a01'),
    name: 'Backend Engineering',
    description: 'Backend dev pool',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Skill Pool Route Tests
// ---------------------------------------------------------------------------

describe('Skill Pools Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsEnabled.mockResolvedValue(true);
  });

  async function buildSkillPoolApp() {
    const app = await buildTestApp();
    const { default: featureFlagPlugin } = await import('../plugins/feature-flag.plugin.js');
    await app.register(featureFlagPlugin);

    app.decorate('authenticate', async () => {});
    app.decorate('authorize', () => async () => {});
    app.decorateRequest('user', { sub: testUuid('999'), role: 'ADMIN' });

    const { skillPoolsRoutes } = await import('../routes/skill-pools.js');
    await app.register(skillPoolsRoutes);
    await app.ready();
    return app;
  }

  it('GET /api/skill-pools returns list of active pools', async () => {
    const pools = [mockPool(), mockPool({ id: testUuid('a02'), name: 'Frontend Engineering' })];
    mockPrisma.skillPool.findMany.mockResolvedValue(pools);

    const app = await buildSkillPoolApp();
    const res = await app.inject({ method: 'GET', url: '/api/skill-pools' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(2);
    await app.close();
  });

  it('POST /api/skill-pools creates pool and returns 201', async () => {
    mockPrisma.skillPool.findUnique.mockResolvedValue(null); // no duplicate
    mockPrisma.skillPool.create.mockResolvedValue(mockPool());

    const app = await buildSkillPoolApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/skill-pools',
      payload: { name: 'Backend Engineering', description: 'Backend dev pool' },
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).name).toBe('Backend Engineering');
    await app.close();
  });

  it('POST /api/skill-pools rejects duplicate name with 409', async () => {
    mockPrisma.skillPool.findUnique.mockResolvedValue(mockPool()); // duplicate exists

    const app = await buildSkillPoolApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/skill-pools',
      payload: { name: 'Backend Engineering' },
    });

    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('PUT /api/skill-pools/:id updates pool name', async () => {
    const updated = mockPool({ name: 'Updated Pool' });
    mockPrisma.skillPool.findUnique
      .mockResolvedValueOnce(mockPool()) // exists check
      .mockResolvedValueOnce(null);       // no name conflict
    mockPrisma.skillPool.update.mockResolvedValue(updated);

    const app = await buildSkillPoolApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/skill-pools/${testUuid('a01')}`,
      payload: { name: 'Updated Pool' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).name).toBe('Updated Pool');
    await app.close();
  });

  it('DELETE /api/skill-pools/:id soft-deletes pool', async () => {
    mockPrisma.skillPool.findUnique.mockResolvedValue(mockPool());
    mockPrisma.skillPool.update.mockResolvedValue({ ...mockPool(), isActive: false });

    const app = await buildSkillPoolApp();
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/skill-pools/${testUuid('a01')}`,
    });

    expect(res.statusCode).toBe(204);
    expect(mockPrisma.skillPool.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: testUuid('a01') },
        data: { isActive: false },
      })
    );
    await app.close();
  });

  it('GET /api/skill-pools returns 404 when feature flag disabled', async () => {
    mockIsEnabled.mockResolvedValue(false);

    const app = await buildSkillPoolApp();
    const res = await app.inject({ method: 'GET', url: '/api/skill-pools' });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('POST /api/skill-pools with empty name returns 400', async () => {
    const app = await buildSkillPoolApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/skill-pools',
      payload: { name: '' },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
