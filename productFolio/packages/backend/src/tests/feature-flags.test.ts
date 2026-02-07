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
    featureFlag: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    initiative: { findMany: vi.fn() },
    employee: { findMany: vi.fn() },
  };
  return { prisma: mockPrisma };
});

import { prisma } from '../lib/prisma.js';

const mockPrisma = prisma as any;

// ---------------------------------------------------------------------------
// FeatureFlagService unit tests
// ---------------------------------------------------------------------------

describe('FeatureFlagService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isEnabled', () => {
    // Dynamic import so the mock is in place
    let isEnabled: (key: string) => Promise<boolean>;

    beforeEach(async () => {
      const mod = await import('../services/feature-flag.service.js');
      isEnabled = mod.isEnabled;
    });

    it('returns true when DB flag has enabled: true', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });

      expect(await isEnabled('test_flag')).toBe(true);
    });

    it('returns false when DB flag has enabled: false', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.featureFlag.findUnique.mockResolvedValue({ enabled: false });

      expect(await isEnabled('test_flag')).toBe(false);
    });

    it('returns false when flag does not exist (findUnique returns null)', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

      expect(await isEnabled('nonexistent')).toBe(false);
    });

    it('returns cached "1" result from Redis (skips DB)', async () => {
      mockRedis.get.mockResolvedValue('1');

      expect(await isEnabled('cached_flag')).toBe(true);
      expect(mockPrisma.featureFlag.findUnique).not.toHaveBeenCalled();
    });

    it('returns cached "0" result from Redis (skips DB)', async () => {
      mockRedis.get.mockResolvedValue('0');

      expect(await isEnabled('cached_flag')).toBe(false);
      expect(mockPrisma.featureFlag.findUnique).not.toHaveBeenCalled();
    });

    it('falls through to DB when Redis throws', async () => {
      mockRedis.get.mockRejectedValue(new Error('ECONNREFUSED'));
      mockPrisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });

      expect(await isEnabled('test_flag')).toBe(true);
      expect(mockPrisma.featureFlag.findUnique).toHaveBeenCalled();
    });

    it('warms Redis cache after DB read', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });

      await isEnabled('warm_flag');

      expect(mockRedis.setex).toHaveBeenCalledWith('ff:warm_flag', 60, '1');
    });
  });

  describe('getFlag', () => {
    let getFlag: (key: string) => Promise<any>;

    beforeEach(async () => {
      const mod = await import('../services/feature-flag.service.js');
      getFlag = mod.getFlag;
    });

    it('returns full flag object from DB', async () => {
      const flag = { id: testUuid('1'), key: 'test', enabled: true, description: 'desc', metadata: null };
      mockPrisma.featureFlag.findUnique.mockResolvedValue(flag);

      const result = await getFlag('test');
      expect(result).toEqual(flag);
    });

    it('throws NotFoundError when flag missing', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

      await expect(getFlag('missing')).rejects.toThrow('not found');
    });
  });

  describe('listFlags', () => {
    let listFlags: () => Promise<any>;

    beforeEach(async () => {
      const mod = await import('../services/feature-flag.service.js');
      listFlags = mod.listFlags;
    });

    it('returns all flags ordered by key', async () => {
      const flags = [
        { id: testUuid('1'), key: 'a_flag', enabled: true },
        { id: testUuid('2'), key: 'b_flag', enabled: false },
      ];
      mockPrisma.featureFlag.findMany.mockResolvedValue(flags);

      const result = await listFlags();
      expect(result).toEqual(flags);
      expect(mockPrisma.featureFlag.findMany).toHaveBeenCalledWith({
        orderBy: { key: 'asc' },
      });
    });
  });

  describe('setFlag', () => {
    let setFlag: (key: string, data: any) => Promise<any>;

    beforeEach(async () => {
      const mod = await import('../services/feature-flag.service.js');
      setFlag = mod.setFlag;
    });

    it('updates flag via prisma.featureFlag.update', async () => {
      const existing = { id: testUuid('1'), key: 'test', enabled: false };
      const updated = { ...existing, enabled: true };
      mockPrisma.featureFlag.findUnique.mockResolvedValue(existing);
      mockPrisma.featureFlag.update.mockResolvedValue(updated);

      const result = await setFlag('test', { enabled: true });
      expect(result).toEqual(updated);
      expect(mockPrisma.featureFlag.update).toHaveBeenCalled();
    });

    it('throws NotFoundError when flag does not exist', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

      await expect(setFlag('missing', { enabled: true })).rejects.toThrow('not found');
    });

    it('invalidates Redis cache after update', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue({ id: testUuid('1'), key: 'inv' });
      mockPrisma.featureFlag.update.mockResolvedValue({ id: testUuid('1'), key: 'inv', enabled: true });

      await setFlag('inv', { enabled: true });

      expect(mockRedis.del).toHaveBeenCalledWith('ff:inv');
    });
  });
});

// ---------------------------------------------------------------------------
// requireFeature plugin tests
// ---------------------------------------------------------------------------

describe('requireFeature plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when isEnabled returns false', async () => {
    mockRedis.get.mockResolvedValue('0');

    const app = await buildTestApp();
    const { default: featureFlagPlugin } = await import('../plugins/feature-flag.plugin.js');
    await app.register(featureFlagPlugin);

    app.get('/test-gated', {
      preHandler: [app.requireFeature('test_flag')],
    }, async () => ({ ok: true }));

    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/test-gated' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('allows request when isEnabled returns true', async () => {
    mockRedis.get.mockResolvedValue('1');

    const app = await buildTestApp();
    const { default: featureFlagPlugin } = await import('../plugins/feature-flag.plugin.js');
    await app.register(featureFlagPlugin);

    app.get('/test-gated', {
      preHandler: [app.requireFeature('test_flag')],
    }, async () => ({ ok: true }));

    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/test-gated' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    await app.close();
  });

  it('returns 404 for unknown flag (unknown = disabled)', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

    const app = await buildTestApp();
    const { default: featureFlagPlugin } = await import('../plugins/feature-flag.plugin.js');
    await app.register(featureFlagPlugin);

    app.get('/test-gated', {
      preHandler: [app.requireFeature('nonexistent')],
    }, async () => ({ ok: true }));

    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/test-gated' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Non-guarded endpoint regression tests
// ---------------------------------------------------------------------------

describe('Non-guarded endpoint regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('non-guarded route works when all feature flags disabled', async () => {
    const app = await buildTestApp();
    const { default: featureFlagPlugin } = await import('../plugins/feature-flag.plugin.js');
    await app.register(featureFlagPlugin);

    // Register a non-guarded route (simulates /api/initiatives)
    app.get('/api/initiatives', async () => {
      return [{ id: testUuid('1'), title: 'Test Initiative' }];
    });

    await app.ready();

    // All flags disabled — should not matter for non-guarded routes
    mockRedis.get.mockResolvedValue('0');

    const res = await app.inject({ method: 'GET', url: '/api/initiatives' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('non-guarded route works when no flags exist in DB at all', async () => {
    const app = await buildTestApp();
    const { default: featureFlagPlugin } = await import('../plugins/feature-flag.plugin.js');
    await app.register(featureFlagPlugin);

    app.get('/api/employees', async () => {
      return [{ id: testUuid('1'), name: 'Test Employee' }];
    });

    await app.ready();

    mockRedis.get.mockResolvedValue(null);
    mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/api/employees' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('non-guarded endpoints unaffected when feature flags are enabled', async () => {
    const app = await buildTestApp();
    const { default: featureFlagPlugin } = await import('../plugins/feature-flag.plugin.js');
    await app.register(featureFlagPlugin);

    app.get('/api/initiatives', async () => {
      return [{ id: testUuid('1'), title: 'Test' }];
    });

    // Also register a gated route to show coexistence
    app.get('/api/gated', {
      preHandler: [app.requireFeature('some_flag')],
    }, async () => ({ gated: true }));

    await app.ready();

    mockRedis.get.mockResolvedValue('1');

    const res = await app.inject({ method: 'GET', url: '/api/initiatives' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Admin route tests (feature-flags routes)
// ---------------------------------------------------------------------------

describe('Feature Flags Admin Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function buildAdminApp() {
    const app = await buildTestApp();
    const { default: featureFlagPlugin } = await import('../plugins/feature-flag.plugin.js');
    await app.register(featureFlagPlugin);

    // Stub authenticate & authorize — no-op for test
    app.decorate('authenticate', async () => {});
    app.decorate('authorize', () => async () => {});
    app.decorateRequest('user', { sub: testUuid('999'), role: 'ADMIN' });

    const { featureFlagsRoutes } = await import('../routes/feature-flags.js');
    await app.register(featureFlagsRoutes);
    await app.ready();
    return app;
  }

  it('GET /api/feature-flags returns list of all flags', async () => {
    const flags = [
      { id: testUuid('1'), key: 'flag_a', enabled: true, description: null, metadata: null },
      { id: testUuid('2'), key: 'flag_b', enabled: false, description: null, metadata: null },
    ];
    mockPrisma.featureFlag.findMany.mockResolvedValue(flags);

    const app = await buildAdminApp();
    const res = await app.inject({ method: 'GET', url: '/api/feature-flags' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(flags);
    await app.close();
  });

  it('GET /api/feature-flags/:key returns single flag', async () => {
    const flag = { id: testUuid('1'), key: 'test', enabled: true, description: 'desc', metadata: null };
    mockPrisma.featureFlag.findUnique.mockResolvedValue(flag);

    const app = await buildAdminApp();
    const res = await app.inject({ method: 'GET', url: '/api/feature-flags/test' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(flag);
    await app.close();
  });

  it('GET /api/feature-flags/:key returns 404 for unknown key', async () => {
    mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

    const app = await buildAdminApp();
    const res = await app.inject({ method: 'GET', url: '/api/feature-flags/unknown' });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('PUT /api/feature-flags/:key updates flag fields', async () => {
    const existing = { id: testUuid('1'), key: 'upd', enabled: false };
    const updated = { ...existing, enabled: true, description: 'new desc' };
    mockPrisma.featureFlag.findUnique.mockResolvedValue(existing);
    mockPrisma.featureFlag.update.mockResolvedValue(updated);

    const app = await buildAdminApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/feature-flags/upd',
      payload: { enabled: true, description: 'new desc' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).enabled).toBe(true);
    await app.close();
  });

  it('PUT /api/feature-flags/:key returns 404 for unknown key', async () => {
    mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

    const app = await buildAdminApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/feature-flags/missing',
      payload: { enabled: true },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
