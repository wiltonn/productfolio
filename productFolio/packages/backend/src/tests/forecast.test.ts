import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildTestApp, testUuid } from './setup.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRedis = {
  get: vi.fn().mockResolvedValue(null),
  setex: vi.fn(),
  del: vi.fn(),
};

vi.mock('../lib/redis.js', () => ({
  getRedisClient: () => mockRedis,
  getCachedData: vi.fn().mockResolvedValue(null),
  setCachedData: vi.fn().mockResolvedValue(true),
  deleteKey: vi.fn(),
  CACHE_KEYS: { scenarioCalculation: (id: string) => `scenario:${id}:calculations` },
  CACHE_TTL: { CALCULATION: 300 },
}));

vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    initiative: {
      findMany: vi.fn(),
    },
    scenario: {
      findUnique: vi.fn(),
    },
    allocation: {
      findMany: vi.fn(),
    },
    forecastRun: {
      create: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000900' }),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    initiativeStatusLog: {
      findMany: vi.fn(),
    },
    scopeItem: {
      findMany: vi.fn(),
    },
    featureFlag: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    orgNode: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    orgMembership: {
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
// Helpers
// ---------------------------------------------------------------------------

function makePeriod(id: string, label: string) {
  return {
    id,
    label,
    type: 'QUARTER',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-03-31'),
  };
}

function makeScenarioForCalc(periodId: string) {
  return {
    id: testUuid('100'),
    name: 'Test Scenario',
    assumptions: {},
    priorityRankings: [],
    period: makePeriod(periodId, 'Q1 2024'),
    allocations: [
      {
        id: testUuid('200'),
        employeeId: testUuid('300'),
        percentage: 100,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31'),
        employee: {
          id: testUuid('300'),
          name: 'Alice',
          hoursPerWeek: 40,
          employmentType: 'FULL_TIME',
          skills: [{ name: 'backend', proficiency: 4 }],
          capacityCalendar: [],
        },
        initiative: null,
        allocationPeriods: [{
          periodId,
          hoursInPeriod: 520,
          overlapRatio: 1,
          period: { id: periodId, label: 'Q1 2024' },
        }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Pure engine tests
// ---------------------------------------------------------------------------

describe('Monte Carlo Engine (Pure Functions)', () => {
  let boxMullerNormal: () => number;
  let lognormalSample: (p50: number, p90: number) => number;
  let createLognormalSampler: (p50: number, p90: number) => () => number;
  let runSimulation: (n: number, sampleFn: () => number) => any;
  let computePercentiles: (results: any, levels: number[]) => any;

  beforeEach(async () => {
    const mod = await import('../services/forecast.service.js');
    boxMullerNormal = mod.boxMullerNormal;
    lognormalSample = mod.lognormalSample;
    createLognormalSampler = mod.createLognormalSampler;
    runSimulation = mod.runSimulation;
    computePercentiles = mod.computePercentiles;
  });

  describe('boxMullerNormal', () => {
    it('generates values with approximately zero mean', () => {
      const samples = Array.from({ length: 10000 }, () => boxMullerNormal());
      const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
      expect(Math.abs(mean)).toBeLessThan(0.05);
    });

    it('generates values with approximately unit standard deviation', () => {
      const samples = Array.from({ length: 10000 }, () => boxMullerNormal());
      const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
      const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
      expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.05);
    });
  });

  describe('lognormalSample', () => {
    it('throws when p50 <= 0', () => {
      expect(() => lognormalSample(0, 10)).toThrow('p50 must be positive');
    });

    it('throws when p90 < p50', () => {
      expect(() => lognormalSample(100, 50)).toThrow('p90 must be >= p50');
    });

    it('returns deterministic value when p50 === p90', () => {
      const samples = Array.from({ length: 100 }, () => lognormalSample(100, 100));
      // All values should be exactly 100 (sigma = 0)
      for (const v of samples) {
        expect(v).toBeCloseTo(100, 5);
      }
    });

    it('median of samples converges to p50', () => {
      const samples = Array.from({ length: 5000 }, () => lognormalSample(100, 150));
      samples.sort((a, b) => a - b);
      const median = samples[Math.floor(samples.length / 2)];
      // Within 10% of p50
      expect(median).toBeGreaterThan(85);
      expect(median).toBeLessThan(115);
    });
  });

  describe('createLognormalSampler', () => {
    it('creates a reusable sampler', () => {
      const sampler = createLognormalSampler(100, 150);
      expect(typeof sampler).toBe('function');
      const val = sampler();
      expect(val).toBeGreaterThan(0);
    });

    it('throws for invalid inputs', () => {
      expect(() => createLognormalSampler(-1, 10)).toThrow();
      expect(() => createLognormalSampler(100, 50)).toThrow();
    });
  });

  describe('runSimulation', () => {
    it('returns sorted values array with correct count', () => {
      const result = runSimulation(100, () => Math.random() * 100);
      expect(result.count).toBe(100);
      expect(result.values).toHaveLength(100);
      // Verify sorted
      for (let i = 1; i < result.values.length; i++) {
        expect(result.values[i]).toBeGreaterThanOrEqual(result.values[i - 1]);
      }
    });

    it('throws when n < 1', () => {
      expect(() => runSimulation(0, () => 1)).toThrow('Simulation count must be >= 1');
    });
  });

  describe('computePercentiles', () => {
    it('computes correct percentiles from sorted values', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
      const result = { values, count: 100 };
      const percentiles = computePercentiles(result, [50, 75, 95]);

      expect(percentiles).toHaveLength(3);
      expect(percentiles[0].level).toBe(50);
      expect(percentiles[0].value).toBeCloseTo(50.5, 0);
      expect(percentiles[1].level).toBe(75);
      expect(percentiles[2].level).toBe(95);
    });

    it('returns empty array for empty levels', () => {
      const result = { values: [1, 2, 3], count: 3 };
      expect(computePercentiles(result, [])).toEqual([]);
    });

    it('returns zeros for empty simulation', () => {
      const result = { values: [], count: 0 };
      const percentiles = computePercentiles(result, [50]);
      expect(percentiles[0].value).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Mode A: Scope-Based Forecast (integration)
// ---------------------------------------------------------------------------

describe('Mode A: Scope-Based Forecast', () => {
  let runScopeBasedForecast: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/forecast.service.js');
    runScopeBasedForecast = mod.runScopeBasedForecast;
  });

  it('runs full Mode A pipeline and returns per-initiative completion probabilities', async () => {
    const periodId = testUuid('10');

    // Mock scenario calculator data
    mockPrisma.scenario.findUnique.mockResolvedValue(makeScenarioForCalc(periodId));
    mockPrisma.allocation.findMany.mockResolvedValue([]);
    mockPrisma.initiative.findMany.mockResolvedValue([
      {
        id: testUuid('50'),
        title: 'Project Alpha',
        status: 'RESOURCING',
        scopeItems: [
          {
            id: testUuid('51'),
            name: 'Feature A',
            estimateP50: 100,
            estimateP90: 150,
            skillDemand: { backend: 100 },
            periodDistributions: [{ periodId, distribution: 1.0 }],
          },
        ],
      },
    ]);

    const result = await runScopeBasedForecast({
      scenarioId: testUuid('100'),
      initiativeIds: [testUuid('50')],
      simulationCount: 100,
    });

    expect(result.mode).toBe('SCOPE_BASED');
    expect(result.scenarioId).toBe(testUuid('100'));
    expect(result.simulationCount).toBe(100);
    expect(result.initiativeForecasts).toHaveLength(1);

    const forecast = result.initiativeForecasts[0];
    expect(forecast.initiativeId).toBe(testUuid('50'));
    expect(forecast.initiativeTitle).toBe('Project Alpha');
    expect(forecast.completionCdf).toHaveLength(1); // 1 period
    expect(forecast.completionCdf[0].cumulativeProbability).toBeGreaterThanOrEqual(0);
    expect(forecast.completionCdf[0].cumulativeProbability).toBeLessThanOrEqual(1);
    expect(forecast.percentiles).toHaveLength(4); // default [50,75,85,95]
    expect(forecast.hasEstimates).toBe(true);
    expect(forecast.scopeItemCount).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    // Verify ForecastRun was persisted
    expect(mockPrisma.forecastRun.create).toHaveBeenCalled();
  });

  it('warns when initiative not found', async () => {
    const periodId = testUuid('10');
    mockPrisma.scenario.findUnique.mockResolvedValue(makeScenarioForCalc(periodId));
    mockPrisma.allocation.findMany.mockResolvedValue([]);
    mockPrisma.initiative.findMany.mockResolvedValue([]); // no initiatives found

    const result = await runScopeBasedForecast({
      scenarioId: testUuid('100'),
      initiativeIds: [testUuid('50')],
      simulationCount: 100,
    });

    expect(result.warnings).toContain(`Initiative ${testUuid('50')} not found`);
  });

  it('warns when scope items have missing P50/P90 estimates', async () => {
    const periodId = testUuid('10');
    mockPrisma.scenario.findUnique.mockResolvedValue(makeScenarioForCalc(periodId));
    mockPrisma.allocation.findMany.mockResolvedValue([]);
    mockPrisma.initiative.findMany.mockResolvedValue([
      {
        id: testUuid('50'),
        title: 'Incomplete',
        status: 'RESOURCING',
        scopeItems: [
          {
            id: testUuid('51'),
            name: 'No Estimates',
            estimateP50: null,
            estimateP90: null,
            skillDemand: { frontend: 50 },
            periodDistributions: [{ periodId, distribution: 1.0 }],
          },
        ],
      },
    ]);

    const result = await runScopeBasedForecast({
      scenarioId: testUuid('100'),
      initiativeIds: [testUuid('50')],
      simulationCount: 100,
    });

    expect(result.warnings.some(w => w.includes('missing P50/P90'))).toBe(true);
    expect(result.initiativeForecasts[0].hasEstimates).toBe(false);
  });

  it('warns when initiative has no scope items', async () => {
    const periodId = testUuid('10');
    mockPrisma.scenario.findUnique.mockResolvedValue(makeScenarioForCalc(periodId));
    mockPrisma.allocation.findMany.mockResolvedValue([]);
    mockPrisma.initiative.findMany.mockResolvedValue([
      {
        id: testUuid('50'),
        title: 'Empty',
        status: 'RESOURCING',
        scopeItems: [],
      },
    ]);

    const result = await runScopeBasedForecast({
      scenarioId: testUuid('100'),
      initiativeIds: [testUuid('50')],
      simulationCount: 100,
    });

    expect(result.warnings.some(w => w.includes('no scope items'))).toBe(true);
  });

  it('persists ForecastRun with mode SCOPE_BASED', async () => {
    const periodId = testUuid('10');
    mockPrisma.scenario.findUnique.mockResolvedValue(makeScenarioForCalc(periodId));
    mockPrisma.allocation.findMany.mockResolvedValue([]);
    mockPrisma.initiative.findMany.mockResolvedValue([]);

    await runScopeBasedForecast({
      scenarioId: testUuid('100'),
      initiativeIds: [testUuid('50')],
      simulationCount: 100,
    });

    expect(mockPrisma.forecastRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mode: 'SCOPE_BASED',
          scenarioId: testUuid('100'),
          simulationCount: 100,
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Mode B: Empirical Forecast (integration)
// ---------------------------------------------------------------------------

describe('Mode B: Empirical Forecast', () => {
  let runEmpiricalForecast: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/forecast.service.js');
    runEmpiricalForecast = mod.runEmpiricalForecast;
  });

  function seedHistoricalCycleTimes(count: number, avgDays = 90) {
    // Seed COMPLETE logs
    const completedLogs = Array.from({ length: count }, (_, i) => ({
      initiativeId: testUuid(String(700 + i)),
      transitionedAt: new Date(`2023-${String(6 + (i % 6)).padStart(2, '0')}-15`),
    }));

    // Seed RESOURCING logs (started ~avgDays before completion)
    const resourcingLogs = completedLogs.map(cl => ({
      initiativeId: cl.initiativeId,
      transitionedAt: new Date(cl.transitionedAt.getTime() - avgDays * 24 * 60 * 60 * 1000),
    }));

    // First call (toStatus: COMPLETE), second call (toStatus: RESOURCING)
    mockPrisma.initiativeStatusLog.findMany
      .mockResolvedValueOnce(completedLogs)
      .mockResolvedValueOnce(resourcingLogs);
  }

  it('runs full Mode B pipeline with historical data and returns forecasts', async () => {
    seedHistoricalCycleTimes(15);

    // In-progress initiatives
    mockPrisma.initiative.findMany.mockResolvedValue([
      { id: testUuid('50'), title: 'In Progress Alpha', status: 'IN_EXECUTION' },
    ]);

    // Resourcing start for in-progress
    mockPrisma.initiativeStatusLog.findMany.mockResolvedValueOnce([
      { initiativeId: testUuid('50'), transitionedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    ]);

    const result = await runEmpiricalForecast({
      initiativeIds: [testUuid('50')],
      simulationCount: 500,
    });

    expect(result.mode).toBe('EMPIRICAL');
    expect(result.simulationCount).toBe(500);
    expect(result.historicalDataPoints).toBe(15);
    expect(result.lowConfidence).toBe(false);
    expect(result.initiativeForecasts).toHaveLength(1);

    const forecast = result.initiativeForecasts[0];
    expect(forecast.initiativeId).toBe(testUuid('50'));
    expect(forecast.currentStatus).toBe('IN_EXECUTION');
    expect(forecast.elapsedDays).toBeGreaterThan(0);
    expect(forecast.percentiles).toHaveLength(4);
    expect(forecast.estimatedCompletionDays).toHaveLength(4);

    // Remaining days should generally be less than total
    const totalP50 = forecast.percentiles.find((p: any) => p.level === 50)!.value;
    expect(totalP50).toBeGreaterThan(0);

    // ForecastRun persisted
    expect(mockPrisma.forecastRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mode: 'EMPIRICAL',
          simulationCount: 500,
        }),
      })
    );
  });

  it('low confidence warning when < 10 historical data points', async () => {
    seedHistoricalCycleTimes(5);

    mockPrisma.initiative.findMany.mockResolvedValue([
      { id: testUuid('50'), title: 'Test', status: 'IN_EXECUTION' },
    ]);
    mockPrisma.initiativeStatusLog.findMany.mockResolvedValueOnce([
      { initiativeId: testUuid('50'), transitionedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    ]);

    const result = await runEmpiricalForecast({
      initiativeIds: [testUuid('50')],
      simulationCount: 100,
    });

    expect(result.lowConfidence).toBe(true);
    expect(result.historicalDataPoints).toBe(5);
    expect(result.warnings.some(w => w.includes('Low confidence'))).toBe(true);
    expect(result.warnings.some(w => w.includes('5 historical data points'))).toBe(true);
  });

  it('returns zero forecasts when no historical data exists', async () => {
    mockPrisma.initiativeStatusLog.findMany
      .mockResolvedValueOnce([])  // no completed
      .mockResolvedValueOnce([]); // no resourcing

    mockPrisma.initiative.findMany.mockResolvedValue([
      { id: testUuid('50'), title: 'Test', status: 'IN_EXECUTION' },
    ]);
    mockPrisma.initiativeStatusLog.findMany.mockResolvedValueOnce([]);

    const result = await runEmpiricalForecast({
      initiativeIds: [testUuid('50')],
      simulationCount: 100,
    });

    expect(result.historicalDataPoints).toBe(0);
    expect(result.warnings.some(w => w.includes('No historical cycle time data'))).toBe(true);
    // Forecasts return 0 values
    const forecast = result.initiativeForecasts[0];
    expect(forecast.percentiles.every((p: any) => p.value === 0)).toBe(true);
  });

  it('warns when initiative has no RESOURCING transition', async () => {
    seedHistoricalCycleTimes(12);

    mockPrisma.initiative.findMany.mockResolvedValue([
      { id: testUuid('50'), title: 'No Start', status: 'RESOURCING' },
    ]);
    // No resourcing log for this initiative
    mockPrisma.initiativeStatusLog.findMany.mockResolvedValueOnce([]);

    const result = await runEmpiricalForecast({
      initiativeIds: [testUuid('50')],
      simulationCount: 100,
    });

    expect(result.warnings.some(w => w.includes('no RESOURCING transition found'))).toBe(true);
    expect(result.initiativeForecasts[0].elapsedDays).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Data Quality Assessment
// ---------------------------------------------------------------------------

describe('Data Quality Assessment', () => {
  let assessDataQuality: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/forecast.service.js');
    assessDataQuality = mod.assessDataQuality;
  });

  it('returns perfect score when all data is present', async () => {
    mockPrisma.scopeItem.findMany.mockResolvedValue([
      { id: testUuid('1'), estimateP50: 100, estimateP90: 150, periodDistributions: [{ periodId: testUuid('10') }] },
      { id: testUuid('2'), estimateP50: 80, estimateP90: 120, periodDistributions: [{ periodId: testUuid('10') }] },
    ]);
    // 10+ completed initiatives
    mockPrisma.initiativeStatusLog.findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({ initiativeId: testUuid(String(800 + i)) }))
    );

    const result = await assessDataQuality({
      initiativeIds: [testUuid('50')],
    });

    expect(result.score).toBe(100);
    expect(result.confidence).toBe('good');
    expect(result.details.estimateCoverage).toBe(1);
    expect(result.details.distributionCoverage).toBe(1);
    expect(result.details.modeBViable).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('returns low score when no data exists', async () => {
    mockPrisma.scopeItem.findMany.mockResolvedValue([]);
    mockPrisma.initiativeStatusLog.findMany.mockResolvedValue([]);

    const result = await assessDataQuality({});

    expect(result.score).toBe(0);
    expect(result.confidence).toBe('low');
    expect(result.issues.some(i => i.includes('No scope items'))).toBe(true);
    expect(result.details.modeBViable).toBe(false);
  });

  it('moderate score with partial estimates and no history', async () => {
    mockPrisma.scopeItem.findMany.mockResolvedValue([
      { id: testUuid('1'), estimateP50: 100, estimateP90: 150, periodDistributions: [{ periodId: testUuid('10') }] },
      { id: testUuid('2'), estimateP50: null, estimateP90: null, periodDistributions: [] },
    ]);
    mockPrisma.initiativeStatusLog.findMany.mockResolvedValue([]);

    const result = await assessDataQuality({
      initiativeIds: [testUuid('50')],
    });

    // 40 * 0.5 (estimates) + 30 * 0.5 (distributions) + 30 * 0 (history) = 35
    expect(result.score).toBe(35);
    expect(result.confidence).toBe('moderate');
    expect(result.issues.some(i => i.includes('missing P50/P90'))).toBe(true);
    expect(result.issues.some(i => i.includes('missing period distributions'))).toBe(true);
  });

  it('reports Mode B not viable when < 10 completions', async () => {
    mockPrisma.scopeItem.findMany.mockResolvedValue([]);
    mockPrisma.initiativeStatusLog.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ initiativeId: testUuid(String(800 + i)) }))
    );

    const result = await assessDataQuality({});

    expect(result.details.modeBViable).toBe(false);
    expect(result.details.historicalCompletions).toBe(5);
    expect(result.issues.some(i => i.includes('Only 5 historical completions'))).toBe(true);
  });

  it('uses scenarioId to find relevant scope items when no initiativeIds given', async () => {
    mockPrisma.allocation.findMany.mockResolvedValue([
      { initiativeId: testUuid('50') },
    ]);
    mockPrisma.scopeItem.findMany.mockResolvedValue([]);
    mockPrisma.initiativeStatusLog.findMany.mockResolvedValue([]);

    await assessDataQuality({ scenarioId: testUuid('100') });

    expect(mockPrisma.allocation.findMany).toHaveBeenCalledWith({
      where: { scenarioId: testUuid('100') },
      select: { initiativeId: true },
      distinct: ['initiativeId'],
    });
  });
});

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

describe('Performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('N=1000 scope-based simulation completes in < 5 seconds', async () => {
    const periodId = testUuid('10');
    mockPrisma.scenario.findUnique.mockResolvedValue(makeScenarioForCalc(periodId));
    mockPrisma.allocation.findMany.mockResolvedValue([]);
    mockPrisma.initiative.findMany.mockResolvedValue([
      {
        id: testUuid('50'),
        title: 'Perf Test',
        status: 'RESOURCING',
        scopeItems: Array.from({ length: 10 }, (_, i) => ({
          id: testUuid(String(51 + i)),
          name: `Feature ${i}`,
          estimateP50: 50 + i * 10,
          estimateP90: 80 + i * 15,
          skillDemand: { backend: 30, frontend: 20 },
          periodDistributions: [{ periodId, distribution: 1.0 }],
        })),
      },
    ]);

    const { runScopeBasedForecast } = await import('../services/forecast.service.js');

    const start = performance.now();
    const result = await runScopeBasedForecast({
      scenarioId: testUuid('100'),
      initiativeIds: [testUuid('50')],
      simulationCount: 1000,
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
    expect(result.simulationCount).toBe(1000);
  });

  it('N=1000 empirical simulation completes in < 5 seconds', async () => {
    // Seed 20 historical data points
    const completedLogs = Array.from({ length: 20 }, (_, i) => ({
      initiativeId: testUuid(String(700 + i)),
      transitionedAt: new Date('2023-06-15'),
    }));
    const resourcingLogs = completedLogs.map(cl => ({
      initiativeId: cl.initiativeId,
      transitionedAt: new Date(cl.transitionedAt.getTime() - 90 * 24 * 60 * 60 * 1000),
    }));

    mockPrisma.initiativeStatusLog.findMany
      .mockResolvedValueOnce(completedLogs)
      .mockResolvedValueOnce(resourcingLogs);

    mockPrisma.initiative.findMany.mockResolvedValue([
      { id: testUuid('50'), title: 'Perf Test', status: 'IN_EXECUTION' },
    ]);
    mockPrisma.initiativeStatusLog.findMany.mockResolvedValueOnce([
      { initiativeId: testUuid('50'), transitionedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    ]);

    const { runEmpiricalForecast } = await import('../services/forecast.service.js');

    const start = performance.now();
    const result = await runEmpiricalForecast({
      initiativeIds: [testUuid('50')],
      simulationCount: 1000,
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
    expect(result.simulationCount).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Forecast Routes (behind flow_forecast_v1 flag)
// ---------------------------------------------------------------------------

describe('Forecast Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function buildForecastApp() {
    const app = await buildTestApp();
    const { default: featureFlagPlugin } = await import('../plugins/feature-flag.plugin.js');
    await app.register(featureFlagPlugin);

    app.decorate('authenticate', async () => {});
    app.decorate('authorize', () => async () => {});
    app.decorateRequest('user', { sub: testUuid('999'), role: 'ADMIN' });

    const { forecastRoutes } = await import('../routes/forecast.js');
    await app.register(forecastRoutes);
    await app.ready();
    return app;
  }

  it('POST /api/forecast/scope-based returns 404 when flow_forecast_v1 disabled', async () => {
    mockIsEnabled.mockResolvedValue(false);

    const app = await buildForecastApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast/scope-based',
      payload: {
        scenarioId: testUuid('100'),
        initiativeIds: [testUuid('50')],
      },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('POST /api/forecast/empirical returns 404 when flow_forecast_v1 disabled', async () => {
    mockIsEnabled.mockResolvedValue(false);

    const app = await buildForecastApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast/empirical',
      payload: {
        initiativeIds: [testUuid('50')],
      },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('GET /api/forecast/runs returns paginated runs when flag enabled', async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPrisma.forecastRun.findMany.mockResolvedValue([]);
    mockPrisma.forecastRun.count.mockResolvedValue(0);

    const app = await buildForecastApp();
    const res = await app.inject({ method: 'GET', url: '/api/forecast/runs' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    expect(body.page).toBe(1);
    await app.close();
  });

  it('GET /api/forecast/runs/:id returns 404 for missing run', async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPrisma.forecastRun.findUnique.mockResolvedValue(null);

    const app = await buildForecastApp();
    const res = await app.inject({ method: 'GET', url: `/api/forecast/runs/${testUuid('404')}` });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('GET /api/forecast/data-quality returns assessment when flag enabled', async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPrisma.scopeItem.findMany.mockResolvedValue([]);
    mockPrisma.initiativeStatusLog.findMany.mockResolvedValue([]);

    const app = await buildForecastApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/forecast/data-quality?scenarioId=${testUuid('100')}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.score).toBeDefined();
    expect(body.confidence).toBeDefined();
    await app.close();
  });
});
