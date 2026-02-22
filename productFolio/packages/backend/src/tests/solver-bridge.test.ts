import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InitiativeStatus } from '@prisma/client';

// Mock Prisma before imports
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    tokenDemand: { findMany: vi.fn() },
    tokenSupply: { findMany: vi.fn() },
    scenario: { findMany: vi.fn() },
    initiative: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    initiativeStatusLog: { create: vi.fn() },
    featureFlag: { findUnique: vi.fn() },
    approvalPolicy: { findMany: vi.fn().mockResolvedValue([]) },
    approvalRequest: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
  },
}));

vi.mock('./approval-enforcement.service.js', () => ({
  approvalEnforcementService: {
    checkApproval: vi.fn().mockResolvedValue({ allowed: true }),
  },
}));

import { prisma } from '../lib/prisma.js';
import {
  checkTransitionCapacity,
  requiresCapacityCheck,
} from '../services/solver-bridge.service.js';
import { transitionStatus } from '../services/initiatives.service.js';

// Helper to build UUID-like IDs for tests
function testUuid(suffix: string): string {
  return `00000000-0000-0000-0000-${suffix.padStart(12, '0')}`;
}

describe('solver-bridge — requiresCapacityCheck', () => {
  it('should require check for RESOURCING', () => {
    expect(requiresCapacityCheck(InitiativeStatus.RESOURCING)).toBe(true);
  });

  it('should require check for IN_EXECUTION', () => {
    expect(requiresCapacityCheck(InitiativeStatus.IN_EXECUTION)).toBe(true);
  });

  it('should not require check for SCOPING', () => {
    expect(requiresCapacityCheck(InitiativeStatus.SCOPING)).toBe(false);
  });

  it('should not require check for COMPLETE', () => {
    expect(requiresCapacityCheck(InitiativeStatus.COMPLETE)).toBe(false);
  });

  it('should not require check for ON_HOLD', () => {
    expect(requiresCapacityCheck(InitiativeStatus.ON_HOLD)).toBe(false);
  });
});

describe('solver-bridge — checkTransitionCapacity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip check when initiative has no token demands', async () => {
    (prisma.tokenDemand.findMany as any).mockResolvedValue([]);

    const result = await checkTransitionCapacity(
      testUuid('aaa'),
      InitiativeStatus.RESOURCING,
    );

    expect(result.checked).toBe(false);
    expect(result.approved).toBe(true);
  });

  it('should skip check when all scenarios are LEGACY mode', async () => {
    const scenarioId = testUuid('500');

    (prisma.tokenDemand.findMany as any).mockResolvedValue([
      {
        id: testUuid('d01'),
        scenarioId,
        initiativeId: testUuid('aaa'),
        skillPoolId: testUuid('sp1'),
        tokensP50: 100,
        skillPool: { id: testUuid('sp1'), name: 'backend' },
      },
    ]);

    // No TOKEN-mode scenarios
    (prisma.scenario.findMany as any).mockResolvedValue([]);

    const result = await checkTransitionCapacity(
      testUuid('aaa'),
      InitiativeStatus.RESOURCING,
    );

    expect(result.checked).toBe(false);
    expect(result.approved).toBe(true);
  });

  it('should APPROVE when demand fits within supply', async () => {
    const scenarioId = testUuid('500');
    const initiativeId = testUuid('aaa');
    const skillPoolId = testUuid('5a1');

    // Token demand: 50 backend tokens
    (prisma.tokenDemand.findMany as any)
      .mockResolvedValueOnce([
        {
          id: testUuid('d01'),
          scenarioId,
          initiativeId,
          skillPoolId,
          tokensP50: 50,
          skillPool: { id: skillPoolId, name: 'backend' },
        },
      ])
      // Second call inside checkScenarioCapacity — all demands in scenario
      .mockResolvedValueOnce([
        {
          id: testUuid('d01'),
          scenarioId,
          initiativeId,
          skillPoolId,
          tokensP50: 50,
          skillPool: { name: 'backend' },
        },
      ]);

    // TOKEN-mode scenario
    (prisma.scenario.findMany as any).mockResolvedValue([{ id: scenarioId }]);

    // Token supply: 100 backend tokens — plenty of room
    (prisma.tokenSupply.findMany as any).mockResolvedValue([
      {
        id: testUuid('501'),
        scenarioId,
        skillPoolId,
        tokens: 100,
        skillPool: { name: 'backend' },
      },
    ]);

    // Initiative lookup
    (prisma.initiative.findMany as any).mockResolvedValue([
      {
        id: initiativeId,
        title: 'Test Initiative',
        status: InitiativeStatus.SCOPING,
      },
    ]);

    const result = await checkTransitionCapacity(
      initiativeId,
      InitiativeStatus.RESOURCING,
    );

    expect(result.checked).toBe(true);
    expect(result.approved).toBe(true);
  });

  it('should REJECT when demand exceeds supply', async () => {
    const scenarioId = testUuid('500');
    const initiativeId = testUuid('aaa');
    const existingInitId = testUuid('bbb');
    const skillPoolId = testUuid('5a1');

    // First call: demands for the target initiative
    (prisma.tokenDemand.findMany as any)
      .mockResolvedValueOnce([
        {
          id: testUuid('d01'),
          scenarioId,
          initiativeId,
          skillPoolId,
          tokensP50: 80,
          skillPool: { id: skillPoolId, name: 'backend' },
        },
      ])
      // Second call: all demands in the scenario
      .mockResolvedValueOnce([
        {
          id: testUuid('d01'),
          scenarioId,
          initiativeId,
          skillPoolId,
          tokensP50: 80,
          skillPool: { name: 'backend' },
        },
        {
          id: testUuid('d02'),
          scenarioId,
          initiativeId: existingInitId,
          skillPoolId,
          tokensP50: 60,
          skillPool: { name: 'backend' },
        },
      ]);

    (prisma.scenario.findMany as any).mockResolvedValue([{ id: scenarioId }]);

    // Token supply: only 100 backend tokens — 80 + 60 = 140 exceeds 100
    (prisma.tokenSupply.findMany as any).mockResolvedValue([
      {
        id: testUuid('501'),
        scenarioId,
        skillPoolId,
        tokens: 100,
        skillPool: { name: 'backend' },
      },
    ]);

    (prisma.initiative.findMany as any).mockResolvedValue([
      {
        id: initiativeId,
        title: 'New Initiative',
        status: InitiativeStatus.SCOPING,
      },
      {
        id: existingInitId,
        title: 'Existing Initiative',
        status: InitiativeStatus.RESOURCING, // already consuming capacity
      },
    ]);

    const result = await checkTransitionCapacity(
      initiativeId,
      InitiativeStatus.RESOURCING,
    );

    expect(result.checked).toBe(true);
    expect(result.approved).toBe(false);
    expect(result.violations).toBeDefined();
    expect(result.violations!.length).toBeGreaterThan(0);
    expect(result.violations![0].code).toBe('CAPACITY_EXCEEDED');
    expect(result.violations![0].detail.skill).toBe('backend');
    expect(result.scenarioId).toBe(scenarioId);
  });

  it('should APPROVE after reducing demand below supply', async () => {
    const scenarioId = testUuid('500');
    const initiativeId = testUuid('aaa');
    const existingInitId = testUuid('bbb');
    const skillPoolId = testUuid('5a1');

    // Reduced demand: 30 (was 80)
    (prisma.tokenDemand.findMany as any)
      .mockResolvedValueOnce([
        {
          id: testUuid('d01'),
          scenarioId,
          initiativeId,
          skillPoolId,
          tokensP50: 30,
          skillPool: { id: skillPoolId, name: 'backend' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: testUuid('d01'),
          scenarioId,
          initiativeId,
          skillPoolId,
          tokensP50: 30,
          skillPool: { name: 'backend' },
        },
        {
          id: testUuid('d02'),
          scenarioId,
          initiativeId: existingInitId,
          skillPoolId,
          tokensP50: 60,
          skillPool: { name: 'backend' },
        },
      ]);

    (prisma.scenario.findMany as any).mockResolvedValue([{ id: scenarioId }]);

    // Supply: 100 tokens, demand: 30 + 60 = 90 → fits
    (prisma.tokenSupply.findMany as any).mockResolvedValue([
      {
        id: testUuid('501'),
        scenarioId,
        skillPoolId,
        tokens: 100,
        skillPool: { name: 'backend' },
      },
    ]);

    (prisma.initiative.findMany as any).mockResolvedValue([
      {
        id: initiativeId,
        title: 'New Initiative',
        status: InitiativeStatus.SCOPING,
      },
      {
        id: existingInitId,
        title: 'Existing Initiative',
        status: InitiativeStatus.RESOURCING,
      },
    ]);

    const result = await checkTransitionCapacity(
      initiativeId,
      InitiativeStatus.RESOURCING,
    );

    expect(result.checked).toBe(true);
    expect(result.approved).toBe(true);
  });
});

describe('solver-bridge — transitionStatus integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow non-gated transitions without capacity check', async () => {
    const initId = testUuid('aaa');

    (prisma.initiative.findUnique as any).mockResolvedValue({
      id: initId,
      status: InitiativeStatus.PROPOSED,
      title: 'Test',
    });

    (prisma.initiative.update as any).mockResolvedValue({
      id: initId,
      status: InitiativeStatus.SCOPING,
      title: 'Test',
      businessOwner: null,
      productOwner: null,
      portfolioArea: null,
      productLeader: null,
      orgNode: null,
    });

    (prisma.initiativeStatusLog.create as any).mockResolvedValue({});

    const result = await transitionStatus(initId, InitiativeStatus.SCOPING, 'actor1');

    expect(result.approved).toBe(true);
    expect(result.initiative).toBeDefined();
    expect(result.capacityChecked).toBe(false);
  });

  it('should block gated transition when capacity is exceeded', async () => {
    const initId = testUuid('aaa');
    const scenarioId = testUuid('500');
    const existingInitId = testUuid('bbb');
    const skillPoolId = testUuid('5a1');

    // Initiative in SCOPING → RESOURCING
    (prisma.initiative.findUnique as any).mockResolvedValue({
      id: initId,
      status: InitiativeStatus.SCOPING,
      title: 'Test Initiative',
    });

    // Token demands for the target initiative
    (prisma.tokenDemand.findMany as any)
      .mockResolvedValueOnce([
        {
          id: testUuid('d01'),
          scenarioId,
          initiativeId: initId,
          skillPoolId,
          tokensP50: 80,
          skillPool: { id: skillPoolId, name: 'backend' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: testUuid('d01'),
          scenarioId,
          initiativeId: initId,
          skillPoolId,
          tokensP50: 80,
          skillPool: { name: 'backend' },
        },
        {
          id: testUuid('d02'),
          scenarioId,
          initiativeId: existingInitId,
          skillPoolId,
          tokensP50: 60,
          skillPool: { name: 'backend' },
        },
      ]);

    (prisma.scenario.findMany as any).mockResolvedValue([{ id: scenarioId }]);

    (prisma.tokenSupply.findMany as any).mockResolvedValue([
      {
        id: testUuid('501'),
        scenarioId,
        skillPoolId,
        tokens: 100,
        skillPool: { name: 'backend' },
      },
    ]);

    (prisma.initiative.findMany as any).mockResolvedValue([
      {
        id: initId,
        title: 'Test Initiative',
        status: InitiativeStatus.SCOPING,
      },
      {
        id: existingInitId,
        title: 'Existing Initiative',
        status: InitiativeStatus.RESOURCING,
      },
    ]);

    const result = await transitionStatus(initId, InitiativeStatus.RESOURCING, 'actor1');

    expect(result.approved).toBe(false);
    expect(result.violations).toBeDefined();
    expect(result.violations!.length).toBeGreaterThan(0);
    expect(result.violations![0].code).toBe('CAPACITY_EXCEEDED');

    // Verify DB was NOT updated
    expect(prisma.initiative.update).not.toHaveBeenCalled();
    expect(prisma.initiativeStatusLog.create).not.toHaveBeenCalled();
  });

  it('should allow gated transition when capacity fits', async () => {
    const initId = testUuid('aaa');
    const scenarioId = testUuid('500');
    const skillPoolId = testUuid('5a1');

    (prisma.initiative.findUnique as any).mockResolvedValue({
      id: initId,
      status: InitiativeStatus.SCOPING,
      title: 'Test Initiative',
    });

    // Low demand, high supply
    (prisma.tokenDemand.findMany as any)
      .mockResolvedValueOnce([
        {
          id: testUuid('d01'),
          scenarioId,
          initiativeId: initId,
          skillPoolId,
          tokensP50: 20,
          skillPool: { id: skillPoolId, name: 'backend' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: testUuid('d01'),
          scenarioId,
          initiativeId: initId,
          skillPoolId,
          tokensP50: 20,
          skillPool: { name: 'backend' },
        },
      ]);

    (prisma.scenario.findMany as any).mockResolvedValue([{ id: scenarioId }]);

    (prisma.tokenSupply.findMany as any).mockResolvedValue([
      {
        id: testUuid('501'),
        scenarioId,
        skillPoolId,
        tokens: 100,
        skillPool: { name: 'backend' },
      },
    ]);

    (prisma.initiative.findMany as any).mockResolvedValue([
      {
        id: initId,
        title: 'Test Initiative',
        status: InitiativeStatus.SCOPING,
      },
    ]);

    (prisma.initiative.update as any).mockResolvedValue({
      id: initId,
      status: InitiativeStatus.RESOURCING,
      title: 'Test Initiative',
      businessOwner: null,
      productOwner: null,
      portfolioArea: null,
      productLeader: null,
      orgNode: null,
    });

    (prisma.initiativeStatusLog.create as any).mockResolvedValue({});

    const result = await transitionStatus(initId, InitiativeStatus.RESOURCING, 'actor1');

    expect(result.approved).toBe(true);
    expect(result.initiative).toBeDefined();
    expect(result.capacityChecked).toBe(true);

    // Verify DB WAS updated
    expect(prisma.initiative.update).toHaveBeenCalled();
    expect(prisma.initiativeStatusLog.create).toHaveBeenCalled();
  });
});

describe('solver-bridge — full scenario: tight supply then fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should block SCOPING→RESOURCING with tight supply, then succeed after demand reduction', async () => {
    const scenarioId = testUuid('500');
    const initId = testUuid('aaa');
    const existingId1 = testUuid('bb1');
    const existingId2 = testUuid('bb2');
    const backendPoolId = testUuid('5a1');
    const frontendPoolId = testUuid('5a2');

    // === ATTEMPT 1: High demand, should be BLOCKED ===

    // Initiative to transition
    (prisma.initiative.findUnique as any).mockResolvedValue({
      id: initId,
      status: InitiativeStatus.SCOPING,
      title: 'Big Feature',
    });

    // Token demands for target initiative (high demand)
    (prisma.tokenDemand.findMany as any)
      .mockResolvedValueOnce([
        {
          id: testUuid('d01'),
          scenarioId,
          initiativeId: initId,
          skillPoolId: backendPoolId,
          tokensP50: 70,
          skillPool: { id: backendPoolId, name: 'backend' },
        },
        {
          id: testUuid('d02'),
          scenarioId,
          initiativeId: initId,
          skillPoolId: frontendPoolId,
          tokensP50: 50,
          skillPool: { id: frontendPoolId, name: 'frontend' },
        },
      ])
      .mockResolvedValueOnce([
        // All demands in scenario (including existing active initiatives)
        {
          id: testUuid('d01'),
          scenarioId,
          initiativeId: initId,
          skillPoolId: backendPoolId,
          tokensP50: 70,
          skillPool: { name: 'backend' },
        },
        {
          id: testUuid('d02'),
          scenarioId,
          initiativeId: initId,
          skillPoolId: frontendPoolId,
          tokensP50: 50,
          skillPool: { name: 'frontend' },
        },
        {
          id: testUuid('d03'),
          scenarioId,
          initiativeId: existingId1,
          skillPoolId: backendPoolId,
          tokensP50: 50,
          skillPool: { name: 'backend' },
        },
        {
          id: testUuid('d04'),
          scenarioId,
          initiativeId: existingId2,
          skillPoolId: frontendPoolId,
          tokensP50: 40,
          skillPool: { name: 'frontend' },
        },
      ]);

    (prisma.scenario.findMany as any).mockResolvedValue([{ id: scenarioId }]);

    // Supply: backend=100, frontend=80
    // Demand: backend=70+50=120 (over!), frontend=50+40=90 (over!)
    (prisma.tokenSupply.findMany as any).mockResolvedValue([
      {
        id: testUuid('501'),
        scenarioId,
        skillPoolId: backendPoolId,
        tokens: 100,
        skillPool: { name: 'backend' },
      },
      {
        id: testUuid('502'),
        scenarioId,
        skillPoolId: frontendPoolId,
        tokens: 80,
        skillPool: { name: 'frontend' },
      },
    ]);

    (prisma.initiative.findMany as any).mockResolvedValue([
      { id: initId, title: 'Big Feature', status: InitiativeStatus.SCOPING },
      { id: existingId1, title: 'Active Backend Work', status: InitiativeStatus.IN_EXECUTION },
      { id: existingId2, title: 'Active Frontend Work', status: InitiativeStatus.RESOURCING },
    ]);

    const blockedResult = await transitionStatus(
      initId,
      InitiativeStatus.RESOURCING,
      'actor1',
    );

    // --- Assertions: transition is BLOCKED ---
    expect(blockedResult.approved).toBe(false);
    expect(blockedResult.violations).toBeDefined();
    expect(blockedResult.violations!.length).toBeGreaterThan(0);

    // Should have capacity violations for both backend and frontend
    const violationSkills = blockedResult.violations!.map(
      (v: any) => v.detail.skill as string,
    );
    expect(violationSkills).toContain('backend');
    expect(violationSkills).toContain('frontend');

    // Each violation should have the CAPACITY_EXCEEDED code
    for (const v of blockedResult.violations!) {
      expect(v.code).toBe('CAPACITY_EXCEEDED');
      expect(v.severity).toBeDefined();
      expect(v.message).toBeTruthy();
      expect(v.affectedItems.length).toBeGreaterThan(0);
    }

    // DB should NOT have been touched
    expect(prisma.initiative.update).not.toHaveBeenCalled();
    expect(prisma.initiativeStatusLog.create).not.toHaveBeenCalled();

    // === ATTEMPT 2: Reduced demand, should SUCCEED ===

    vi.clearAllMocks();

    (prisma.initiative.findUnique as any).mockResolvedValue({
      id: initId,
      status: InitiativeStatus.SCOPING,
      title: 'Big Feature',
    });

    // Reduced demand: backend 20, frontend 10
    (prisma.tokenDemand.findMany as any)
      .mockResolvedValueOnce([
        {
          id: testUuid('d01'),
          scenarioId,
          initiativeId: initId,
          skillPoolId: backendPoolId,
          tokensP50: 20,
          skillPool: { id: backendPoolId, name: 'backend' },
        },
        {
          id: testUuid('d02'),
          scenarioId,
          initiativeId: initId,
          skillPoolId: frontendPoolId,
          tokensP50: 10,
          skillPool: { id: frontendPoolId, name: 'frontend' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: testUuid('d01'),
          scenarioId,
          initiativeId: initId,
          skillPoolId: backendPoolId,
          tokensP50: 20,
          skillPool: { name: 'backend' },
        },
        {
          id: testUuid('d02'),
          scenarioId,
          initiativeId: initId,
          skillPoolId: frontendPoolId,
          tokensP50: 10,
          skillPool: { name: 'frontend' },
        },
        {
          id: testUuid('d03'),
          scenarioId,
          initiativeId: existingId1,
          skillPoolId: backendPoolId,
          tokensP50: 50,
          skillPool: { name: 'backend' },
        },
        {
          id: testUuid('d04'),
          scenarioId,
          initiativeId: existingId2,
          skillPoolId: frontendPoolId,
          tokensP50: 40,
          skillPool: { name: 'frontend' },
        },
      ]);

    (prisma.scenario.findMany as any).mockResolvedValue([{ id: scenarioId }]);

    // Same supply: backend=100, frontend=80
    // Now demand: backend=20+50=70 (fits!), frontend=10+40=50 (fits!)
    (prisma.tokenSupply.findMany as any).mockResolvedValue([
      {
        id: testUuid('501'),
        scenarioId,
        skillPoolId: backendPoolId,
        tokens: 100,
        skillPool: { name: 'backend' },
      },
      {
        id: testUuid('502'),
        scenarioId,
        skillPoolId: frontendPoolId,
        tokens: 80,
        skillPool: { name: 'frontend' },
      },
    ]);

    (prisma.initiative.findMany as any).mockResolvedValue([
      { id: initId, title: 'Big Feature', status: InitiativeStatus.SCOPING },
      { id: existingId1, title: 'Active Backend Work', status: InitiativeStatus.IN_EXECUTION },
      { id: existingId2, title: 'Active Frontend Work', status: InitiativeStatus.RESOURCING },
    ]);

    (prisma.initiative.update as any).mockResolvedValue({
      id: initId,
      status: InitiativeStatus.RESOURCING,
      title: 'Big Feature',
      businessOwner: null,
      productOwner: null,
      portfolioArea: null,
      productLeader: null,
      orgNode: null,
    });

    (prisma.initiativeStatusLog.create as any).mockResolvedValue({});

    const successResult = await transitionStatus(
      initId,
      InitiativeStatus.RESOURCING,
      'actor1',
    );

    // --- Assertions: transition SUCCEEDS ---
    expect(successResult.approved).toBe(true);
    expect(successResult.initiative).toBeDefined();
    expect(successResult.initiative.status).toBe(InitiativeStatus.RESOURCING);
    expect(successResult.capacityChecked).toBe(true);

    // DB should have been updated
    expect(prisma.initiative.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: initId },
        data: { status: InitiativeStatus.RESOURCING },
      }),
    );
    expect(prisma.initiativeStatusLog.create).toHaveBeenCalled();
  });
});
