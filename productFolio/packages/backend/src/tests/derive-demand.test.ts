import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testUuid } from './setup.js';
import { WorkflowError, NotFoundError } from '../lib/errors.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    scenario: {
      findUnique: vi.fn(),
    },
    scopeItem: {
      findMany: vi.fn(),
    },
    skillPool: {
      findMany: vi.fn(),
    },
    tokenCalibration: {
      findMany: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import { prisma } from '../lib/prisma.js';

const mockPrisma = prisma as any;

// ---------------------------------------------------------------------------
// deriveTokenDemand unit tests
// ---------------------------------------------------------------------------

describe('deriveTokenDemand', () => {
  let deriveTokenDemand: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../planning/derive-demand.js');
    deriveTokenDemand = mod.deriveTokenDemand;
  });

  it('converts scope item hours to tokens using calibration rate', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
      priorityRankings: [{ initiativeId: testUuid('1a0') }],
    });

    mockPrisma.scopeItem.findMany.mockResolvedValue([
      {
        id: testUuid('b01'),
        initiativeId: testUuid('1a0'),
        name: 'Feature A',
        skillDemand: { backend: 10 },
        estimateP50: 20,
        estimateP90: 30,
      },
    ]);

    mockPrisma.skillPool.findMany.mockResolvedValue([
      { id: testUuid('a01'), name: 'Backend', isActive: true },
    ]);

    // Calibration: 2 tokens per hour for Backend
    mockPrisma.tokenCalibration.findMany.mockResolvedValue([
      { skillPoolId: testUuid('a01'), tokenPerHour: 2.0, effectiveDate: new Date('2025-01-01') },
    ]);

    const result = await deriveTokenDemand(testUuid('5c0'));

    expect(result.derivedDemands).toHaveLength(1);
    const entry = result.derivedDemands[0];
    expect(entry.initiativeId).toBe(testUuid('1a0'));
    expect(entry.skillPoolId).toBe(testUuid('a01'));
    expect(entry.skillPoolName).toBe('Backend');
    expect(entry.tokensP50).toBe(20); // 10 hours * 2.0 tokenPerHour
    expect(entry.tokensP90).toBe(30); // 10 * (30/20) * 2.0
    expect(result.warnings).toHaveLength(0);
  });

  it('uses 1:1 fallback with warning when no calibration exists', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
      priorityRankings: [{ initiativeId: testUuid('1a0') }],
    });

    mockPrisma.scopeItem.findMany.mockResolvedValue([
      {
        id: testUuid('b01'),
        initiativeId: testUuid('1a0'),
        name: 'Feature A',
        skillDemand: { backend: 10 },
        estimateP50: 20,
        estimateP90: 40,
      },
    ]);

    mockPrisma.skillPool.findMany.mockResolvedValue([
      { id: testUuid('a01'), name: 'Backend', isActive: true },
    ]);

    // No calibrations
    mockPrisma.tokenCalibration.findMany.mockResolvedValue([]);

    const result = await deriveTokenDemand(testUuid('5c0'));

    expect(result.derivedDemands).toHaveLength(1);
    expect(result.derivedDemands[0].tokensP50).toBe(10); // 10 * 1.0 fallback
    expect(result.derivedDemands[0].tokensP90).toBe(20); // 10 * (40/20) * 1.0
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/calibration.*Backend.*1:1/i)])
    );
  });

  it('returns null tokensP90 when estimateP50 is null or zero', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
      priorityRankings: [{ initiativeId: testUuid('1a0') }],
    });

    mockPrisma.scopeItem.findMany.mockResolvedValue([
      {
        id: testUuid('b01'),
        initiativeId: testUuid('1a0'),
        name: 'Feature A',
        skillDemand: { backend: 10 },
        estimateP50: null,
        estimateP90: 30,
      },
    ]);

    mockPrisma.skillPool.findMany.mockResolvedValue([
      { id: testUuid('a01'), name: 'Backend', isActive: true },
    ]);

    mockPrisma.tokenCalibration.findMany.mockResolvedValue([]);

    const result = await deriveTokenDemand(testUuid('5c0'));

    expect(result.derivedDemands).toHaveLength(1);
    expect(result.derivedDemands[0].tokensP50).toBe(10); // 10 * 1.0
    expect(result.derivedDemands[0].tokensP90).toBeNull();
  });

  it('aggregates demands across multiple scope items for same initiative + pool', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
      priorityRankings: [{ initiativeId: testUuid('1a0') }],
    });

    mockPrisma.scopeItem.findMany.mockResolvedValue([
      {
        id: testUuid('b01'),
        initiativeId: testUuid('1a0'),
        name: 'Feature A',
        skillDemand: { backend: 10 },
        estimateP50: 20,
        estimateP90: 30,
      },
      {
        id: testUuid('b02'),
        initiativeId: testUuid('1a0'),
        name: 'Feature B',
        skillDemand: { backend: 5 },
        estimateP50: 10,
        estimateP90: 20,
      },
    ]);

    mockPrisma.skillPool.findMany.mockResolvedValue([
      { id: testUuid('a01'), name: 'Backend', isActive: true },
    ]);

    mockPrisma.tokenCalibration.findMany.mockResolvedValue([
      { skillPoolId: testUuid('a01'), tokenPerHour: 1.0, effectiveDate: new Date('2025-01-01') },
    ]);

    const result = await deriveTokenDemand(testUuid('5c0'));

    // Aggregated: 10 + 5 = 15 tokensP50
    expect(result.derivedDemands).toHaveLength(1);
    expect(result.derivedDemands[0].tokensP50).toBe(15);
  });

  it('handles multiple initiatives with different skill pools', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
      priorityRankings: [
        { initiativeId: testUuid('1a0') },
        { initiativeId: testUuid('1a1') },
      ],
    });

    mockPrisma.scopeItem.findMany.mockResolvedValue([
      {
        id: testUuid('b01'),
        initiativeId: testUuid('1a0'),
        name: 'Init1 Feature',
        skillDemand: { backend: 10 },
        estimateP50: 20,
        estimateP90: 30,
      },
      {
        id: testUuid('b02'),
        initiativeId: testUuid('1a1'),
        name: 'Init2 Feature',
        skillDemand: { frontend: 8 },
        estimateP50: 16,
        estimateP90: 24,
      },
    ]);

    mockPrisma.skillPool.findMany.mockResolvedValue([
      { id: testUuid('a01'), name: 'Backend', isActive: true },
      { id: testUuid('a02'), name: 'Frontend', isActive: true },
    ]);

    mockPrisma.tokenCalibration.findMany.mockResolvedValue([
      { skillPoolId: testUuid('a01'), tokenPerHour: 1.0, effectiveDate: new Date('2025-01-01') },
      { skillPoolId: testUuid('a02'), tokenPerHour: 1.5, effectiveDate: new Date('2025-01-01') },
    ]);

    const result = await deriveTokenDemand(testUuid('5c0'));

    expect(result.derivedDemands).toHaveLength(2);

    const backendEntry = result.derivedDemands.find((d: any) => d.skillPoolName === 'Backend');
    expect(backendEntry.initiativeId).toBe(testUuid('1a0'));
    expect(backendEntry.tokensP50).toBe(10); // 10 * 1.0

    const frontendEntry = result.derivedDemands.find((d: any) => d.skillPoolName === 'Frontend');
    expect(frontendEntry.initiativeId).toBe(testUuid('1a1'));
    expect(frontendEntry.tokensP50).toBe(12); // 8 * 1.5
  });

  it('warns when skill name does not match any active pool', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
      priorityRankings: [{ initiativeId: testUuid('1a0') }],
    });

    mockPrisma.scopeItem.findMany.mockResolvedValue([
      {
        id: testUuid('b01'),
        initiativeId: testUuid('1a0'),
        name: 'Feature A',
        skillDemand: { devops: 10 },
        estimateP50: 20,
        estimateP90: 30,
      },
    ]);

    mockPrisma.skillPool.findMany.mockResolvedValue([
      { id: testUuid('a01'), name: 'Backend', isActive: true },
    ]);

    mockPrisma.tokenCalibration.findMany.mockResolvedValue([]);

    const result = await deriveTokenDemand(testUuid('5c0'));

    expect(result.derivedDemands).toHaveLength(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/devops.*does not match/i)])
    );
  });

  it('filters by initiativeId when provided', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
      priorityRankings: [
        { initiativeId: testUuid('1a0') },
        { initiativeId: testUuid('1a1') },
      ],
    });

    // When initiativeId is provided, scopeItem.findMany is called with { where: { initiativeId } }
    mockPrisma.scopeItem.findMany.mockResolvedValue([
      {
        id: testUuid('b01'),
        initiativeId: testUuid('1a0'),
        name: 'Feature A',
        skillDemand: { backend: 10 },
        estimateP50: 20,
        estimateP90: 30,
      },
    ]);

    mockPrisma.skillPool.findMany.mockResolvedValue([
      { id: testUuid('a01'), name: 'Backend', isActive: true },
    ]);

    mockPrisma.tokenCalibration.findMany.mockResolvedValue([]);

    const result = await deriveTokenDemand(testUuid('5c0'), testUuid('1a0'));

    // Should have queried with the specific initiativeId
    expect(mockPrisma.scopeItem.findMany).toHaveBeenCalledWith({
      where: { initiativeId: testUuid('1a0') },
    });
    expect(result.derivedDemands).toHaveLength(1);
  });

  it('returns empty when no priority rankings exist', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
      priorityRankings: [],
    });

    const result = await deriveTokenDemand(testUuid('5c0'));

    expect(result.derivedDemands).toHaveLength(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/no priority rankings/i)])
    );
  });

  it('returns empty when scope items have no skill demand', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
      priorityRankings: [{ initiativeId: testUuid('1a0') }],
    });

    mockPrisma.scopeItem.findMany.mockResolvedValue([
      {
        id: testUuid('b01'),
        initiativeId: testUuid('1a0'),
        name: 'Feature A',
        skillDemand: null,
        estimateP50: 20,
        estimateP90: 30,
      },
    ]);

    mockPrisma.skillPool.findMany.mockResolvedValue([
      { id: testUuid('a01'), name: 'Backend', isActive: true },
    ]);

    mockPrisma.tokenCalibration.findMany.mockResolvedValue([]);

    const result = await deriveTokenDemand(testUuid('5c0'));

    expect(result.derivedDemands).toHaveLength(0);
  });

  it('throws WorkflowError for LEGACY mode scenario', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'LEGACY',
    });

    await expect(deriveTokenDemand(testUuid('5c0'))).rejects.toThrow(WorkflowError);
  });

  it('throws NotFoundError for missing scenario', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue(null);

    await expect(deriveTokenDemand(testUuid('404'))).rejects.toThrow('not found');
  });

  it('matches skill names case-insensitively', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
      priorityRankings: [{ initiativeId: testUuid('1a0') }],
    });

    mockPrisma.scopeItem.findMany.mockResolvedValue([
      {
        id: testUuid('b01'),
        initiativeId: testUuid('1a0'),
        name: 'Feature A',
        skillDemand: { BACKEND: 10 },
        estimateP50: 20,
        estimateP90: 30,
      },
    ]);

    mockPrisma.skillPool.findMany.mockResolvedValue([
      { id: testUuid('a01'), name: 'Backend', isActive: true },
    ]);

    mockPrisma.tokenCalibration.findMany.mockResolvedValue([]);

    const result = await deriveTokenDemand(testUuid('5c0'));

    // Should match despite case difference
    expect(result.derivedDemands).toHaveLength(1);
    expect(result.derivedDemands[0].skillPoolName).toBe('Backend');
  });

  it('picks most recent calibration when multiple exist', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
      priorityRankings: [{ initiativeId: testUuid('1a0') }],
    });

    mockPrisma.scopeItem.findMany.mockResolvedValue([
      {
        id: testUuid('b01'),
        initiativeId: testUuid('1a0'),
        name: 'Feature A',
        skillDemand: { backend: 10 },
        estimateP50: 20,
        estimateP90: 30,
      },
    ]);

    mockPrisma.skillPool.findMany.mockResolvedValue([
      { id: testUuid('a01'), name: 'Backend', isActive: true },
    ]);

    // Multiple calibrations — ordered desc by effectiveDate (most recent first)
    mockPrisma.tokenCalibration.findMany.mockResolvedValue([
      { skillPoolId: testUuid('a01'), tokenPerHour: 3.0, effectiveDate: new Date('2025-06-01') },
      { skillPoolId: testUuid('a01'), tokenPerHour: 2.0, effectiveDate: new Date('2025-01-01') },
    ]);

    const result = await deriveTokenDemand(testUuid('5c0'));

    // Should use 3.0 (most recent)
    expect(result.derivedDemands[0].tokensP50).toBe(30); // 10 * 3.0
  });
});
