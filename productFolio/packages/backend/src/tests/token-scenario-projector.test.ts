import { describe, it, expect, beforeEach } from 'vitest';
import { TokenScenarioProjector } from '../engine/projection/token-scenario-projector.js';
import type {
  ScenarioDataProvider,
  ScenarioValidator,
  TokenSupplyEntry,
  TokenDemandEntry,
  InitiativeDemandSnapshot,
  InitiativeStatus,
  ConstraintScenario,
  ValidationResult,
} from '../engine/projection/token-types.js';

// ---------------------------------------------------------------------------
// Test helpers — in-memory data provider
// ---------------------------------------------------------------------------

function createMockProvider(opts: {
  supply: TokenSupplyEntry[];
  demand: TokenDemandEntry[];
  initiativeDemands: Record<string, InitiativeDemandSnapshot>;
  dependencies?: Record<string, string[]>;
}): ScenarioDataProvider {
  return {
    getTokenSupply: async () => opts.supply.map((s) => ({ ...s })),
    getTokenDemand: async () => opts.demand.map((d) => ({ ...d })),
    getInitiativeDemand: async (_scenarioId, initiativeId) => {
      return (
        opts.initiativeDemands[initiativeId] ?? {
          initiativeId,
          demands: [],
        }
      );
    },
    getInitiativeDependencies: async (initiativeId) => {
      return opts.dependencies?.[initiativeId] ?? [];
    },
  };
}

/** Validator that always reports feasible */
const feasibleValidator: ScenarioValidator = {
  validate: () => ({
    feasible: true,
    violations: [],
    warnings: [],
    utilizationMap: [],
  }),
};

/** Validator that checks capacity (demand <= supply per team) */
function capacityCheckValidator(): ScenarioValidator {
  return {
    validate(scenario: ConstraintScenario): ValidationResult {
      const violations: ValidationResult['violations'] = [];
      const utilizationMap: ValidationResult['utilizationMap'] = [];

      for (const team of scenario.teams) {
        const capacity = team.capacityByPeriod[0] ?? 0;
        let totalAllocated = 0;

        for (const item of scenario.items) {
          for (const alloc of item.teamAllocations) {
            if (alloc.teamId === team.id && alloc.periodIndex === 0) {
              totalAllocated += alloc.tokens;
            }
          }
        }

        const utilization = capacity > 0 ? totalAllocated / capacity : totalAllocated > 0 ? Infinity : 0;
        utilizationMap.push({
          teamId: team.id,
          periodIndex: 0,
          allocated: totalAllocated,
          available: capacity,
          utilization,
        });

        if (totalAllocated > capacity) {
          violations.push({
            constraintId: 'capacity',
            severity: 'error',
            message: `Team "${team.name}" over-allocated: ${totalAllocated} > ${capacity}`,
            affectedItemIds: scenario.items
              .filter((i) =>
                i.teamAllocations.some((a) => a.teamId === team.id),
              )
              .map((i) => i.id),
            affectedTeamIds: [team.id],
            affectedPeriods: [0],
          });
        }
      }

      return {
        feasible: violations.length === 0,
        violations,
        warnings: [],
        utilizationMap,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const SCENARIO_ID = 'scenario-1';

const baseSupply: TokenSupplyEntry[] = [
  { skillPoolId: 'sp-backend', skillPoolName: 'Backend', tokens: 100 },
  { skillPoolId: 'sp-frontend', skillPoolName: 'Frontend', tokens: 80 },
  { skillPoolId: 'sp-qa', skillPoolName: 'QA', tokens: 40 },
];

const baseDemand: TokenDemandEntry[] = [
  {
    initiativeId: 'init-existing',
    skillPoolId: 'sp-backend',
    skillPoolName: 'Backend',
    tokensP50: 30,
    tokensP90: 40,
  },
  {
    initiativeId: 'init-existing',
    skillPoolId: 'sp-frontend',
    skillPoolName: 'Frontend',
    tokensP50: 20,
    tokensP90: 25,
  },
];

const newInitiativeDemand: InitiativeDemandSnapshot = {
  initiativeId: 'init-new',
  demands: [
    {
      skillPoolId: 'sp-backend',
      skillPoolName: 'Backend',
      tokensP50: 40,
      tokensP90: 55,
    },
    {
      skillPoolId: 'sp-qa',
      skillPoolName: 'QA',
      tokensP50: 15,
      tokensP90: 20,
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TokenScenarioProjector', () => {
  let projector: TokenScenarioProjector;
  let provider: ScenarioDataProvider;

  beforeEach(() => {
    provider = createMockProvider({
      supply: baseSupply,
      demand: baseDemand,
      initiativeDemands: {
        'init-new': newInitiativeDemand,
        'init-existing': {
          initiativeId: 'init-existing',
          demands: [
            {
              skillPoolId: 'sp-backend',
              skillPoolName: 'Backend',
              tokensP50: 30,
              tokensP90: 40,
            },
            {
              skillPoolId: 'sp-frontend',
              skillPoolName: 'Frontend',
              tokensP50: 20,
              tokensP90: 25,
            },
          ],
        },
      },
    });
    projector = new TokenScenarioProjector(provider);
  });

  // =========================================================================
  // 1. projectTransition — single initiative entering RESOURCING
  // =========================================================================
  describe('projectTransition — add demand on RESOURCING', () => {
    it('adds initiative demand when transitioning to RESOURCING', async () => {
      const result = await projector.projectTransition(
        SCENARIO_ID,
        'init-new',
        'RESOURCING',
      );

      // Supply unchanged
      expect(result.supply).toHaveLength(3);
      expect(result.supply).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ skillPoolId: 'sp-backend', tokens: 100 }),
        ]),
      );

      // New demand entries added
      const newBackendDemand = result.demand.filter(
        (d) => d.initiativeId === 'init-new' && d.skillPoolId === 'sp-backend',
      );
      expect(newBackendDemand).toHaveLength(1);
      expect(newBackendDemand[0].tokensP50).toBe(40);

      const newQaDemand = result.demand.filter(
        (d) => d.initiativeId === 'init-new' && d.skillPoolId === 'sp-qa',
      );
      expect(newQaDemand).toHaveLength(1);
      expect(newQaDemand[0].tokensP50).toBe(15);

      // Original demand still present
      const existingDemand = result.demand.filter(
        (d) => d.initiativeId === 'init-existing',
      );
      expect(existingDemand).toHaveLength(2);

      // Total demand entries: 2 existing + 2 new = 4
      expect(result.demand).toHaveLength(4);

      // Applied change recorded
      expect(result.appliedChanges).toHaveLength(1);
      expect(result.appliedChanges[0]).toEqual({
        initiativeId: 'init-new',
        targetStatus: 'RESOURCING',
        action: 'add_demand',
        affectedSkillPools: ['sp-backend', 'sp-qa'],
      });
    });

    it('adds demand for IN_EXECUTION as well', async () => {
      const result = await projector.projectTransition(
        SCENARIO_ID,
        'init-new',
        'IN_EXECUTION',
      );

      expect(result.appliedChanges[0].action).toBe('add_demand');
      expect(result.demand).toHaveLength(4);
    });

    it('does not duplicate demand if initiative already has entries', async () => {
      // init-existing already has demand in the base set
      const result = await projector.projectTransition(
        SCENARIO_ID,
        'init-existing',
        'RESOURCING',
      );

      // Should not add duplicates — existing demand stays, no new entries
      const existingDemand = result.demand.filter(
        (d) => d.initiativeId === 'init-existing',
      );
      expect(existingDemand).toHaveLength(2);
      expect(result.appliedChanges[0].affectedSkillPools).toHaveLength(0);
    });

    it('computes ledger deltas correctly after adding demand', async () => {
      const result = await projector.projectTransition(
        SCENARIO_ID,
        'init-new',
        'RESOURCING',
      );

      const backendLedger = result.ledger.find(
        (l) => l.skillPoolId === 'sp-backend',
      )!;
      // Supply: 100, Existing demand: 30, New demand: 40 → delta = 30
      expect(backendLedger.supplyTokens).toBe(100);
      expect(backendLedger.demandP50).toBe(70); // 30 + 40
      expect(backendLedger.deltaP50).toBe(30); // 100 - 70

      const qaLedger = result.ledger.find(
        (l) => l.skillPoolId === 'sp-qa',
      )!;
      // Supply: 40, New demand: 15 → delta = 25
      expect(qaLedger.supplyTokens).toBe(40);
      expect(qaLedger.demandP50).toBe(15);
      expect(qaLedger.deltaP50).toBe(25);
    });
  });

  // =========================================================================
  // 2. projectTransition — initiative completing (demand removed)
  // =========================================================================
  describe('projectTransition — remove demand on COMPLETE/CANCELLED', () => {
    it('removes initiative demand when transitioning to COMPLETE', async () => {
      const result = await projector.projectTransition(
        SCENARIO_ID,
        'init-existing',
        'COMPLETE',
      );

      // All demand for init-existing should be gone
      const remaining = result.demand.filter(
        (d) => d.initiativeId === 'init-existing',
      );
      expect(remaining).toHaveLength(0);
      expect(result.demand).toHaveLength(0);

      expect(result.appliedChanges[0]).toEqual({
        initiativeId: 'init-existing',
        targetStatus: 'COMPLETE',
        action: 'remove_demand',
        affectedSkillPools: ['sp-backend', 'sp-frontend'],
      });
    });

    it('removes demand on CANCELLED', async () => {
      const result = await projector.projectTransition(
        SCENARIO_ID,
        'init-existing',
        'CANCELLED',
      );

      const remaining = result.demand.filter(
        (d) => d.initiativeId === 'init-existing',
      );
      expect(remaining).toHaveLength(0);
      expect(result.appliedChanges[0].action).toBe('remove_demand');
    });

    it('ledger shows freed capacity after removal', async () => {
      const result = await projector.projectTransition(
        SCENARIO_ID,
        'init-existing',
        'COMPLETE',
      );

      const backendLedger = result.ledger.find(
        (l) => l.skillPoolId === 'sp-backend',
      )!;
      // Supply: 100, no demand remaining → delta = 100
      expect(backendLedger.demandP50).toBe(0);
      expect(backendLedger.deltaP50).toBe(100);
    });
  });

  // =========================================================================
  // 3. projectTransition — no demand change for intermediate statuses
  // =========================================================================
  describe('projectTransition — no change for PROPOSED/SCOPING/ON_HOLD', () => {
    it.each<InitiativeStatus>(['PROPOSED', 'SCOPING', 'ON_HOLD'])(
      'does not change demand for %s',
      async (status) => {
        const result = await projector.projectTransition(
          SCENARIO_ID,
          'init-new',
          status,
        );

        // Demand unchanged (still just the existing ones)
        expect(result.demand).toHaveLength(2);
        expect(result.appliedChanges[0].action).toBe('no_change');
        expect(result.appliedChanges[0].affectedSkillPools).toHaveLength(0);
      },
    );
  });

  // =========================================================================
  // 4. projectPortfolio — multiple changes, cumulative effect
  // =========================================================================
  describe('projectPortfolio — cumulative changes', () => {
    it('applies multiple changes cumulatively', async () => {
      const result = await projector.projectPortfolio(SCENARIO_ID, [
        { initiativeId: 'init-new', targetStatus: 'RESOURCING' },
        { initiativeId: 'init-existing', targetStatus: 'COMPLETE' },
      ]);

      // init-existing demand removed, init-new demand added
      const existingDemand = result.demand.filter(
        (d) => d.initiativeId === 'init-existing',
      );
      expect(existingDemand).toHaveLength(0);

      const newDemand = result.demand.filter(
        (d) => d.initiativeId === 'init-new',
      );
      expect(newDemand).toHaveLength(2); // backend + qa

      // Applied changes recorded in order
      expect(result.appliedChanges).toHaveLength(2);
    });

    it('handles empty change list', async () => {
      const result = await projector.projectPortfolio(SCENARIO_ID, []);

      expect(result.demand).toHaveLength(2); // unchanged
      expect(result.appliedChanges).toHaveLength(0);
    });
  });

  // =========================================================================
  // 5. projectPortfolio — dependency ordering
  // =========================================================================
  describe('projectPortfolio — dependency ordering', () => {
    it('respects dependency ordering in multi-change projection', async () => {
      const orderedProvider = createMockProvider({
        supply: baseSupply,
        demand: [],
        initiativeDemands: {
          'init-A': {
            initiativeId: 'init-A',
            demands: [
              {
                skillPoolId: 'sp-backend',
                skillPoolName: 'Backend',
                tokensP50: 20,
                tokensP90: null,
              },
            ],
          },
          'init-B': {
            initiativeId: 'init-B',
            demands: [
              {
                skillPoolId: 'sp-backend',
                skillPoolName: 'Backend',
                tokensP50: 30,
                tokensP90: null,
              },
            ],
          },
          'init-C': {
            initiativeId: 'init-C',
            demands: [
              {
                skillPoolId: 'sp-frontend',
                skillPoolName: 'Frontend',
                tokensP50: 25,
                tokensP90: null,
              },
            ],
          },
        },
        // B depends on A, C depends on B → order should be A, B, C
        dependencies: {
          'init-A': [],
          'init-B': ['init-A'],
          'init-C': ['init-B'],
        },
      });

      const orderedProjector = new TokenScenarioProjector(orderedProvider);

      // Submit in reverse order — projector should sort by deps
      const result = await orderedProjector.projectPortfolio(SCENARIO_ID, [
        { initiativeId: 'init-C', targetStatus: 'RESOURCING' },
        { initiativeId: 'init-A', targetStatus: 'RESOURCING' },
        { initiativeId: 'init-B', targetStatus: 'RESOURCING' },
      ]);

      // Changes should be applied in dependency order: A, B, C
      expect(result.appliedChanges.map((c) => c.initiativeId)).toEqual([
        'init-A',
        'init-B',
        'init-C',
      ]);

      // All demands present
      expect(result.demand).toHaveLength(3);
    });
  });

  // =========================================================================
  // 6. whatIf — returns both projection and validation
  // =========================================================================
  describe('whatIf — projection + validation', () => {
    it('returns both projection and validation result', async () => {
      const validatedProjector = new TokenScenarioProjector(
        provider,
        feasibleValidator,
      );

      const result = await validatedProjector.whatIf(SCENARIO_ID, [
        { initiativeId: 'init-new', targetStatus: 'RESOURCING' },
      ]);

      // Projection present
      expect(result.projection.sourceScenarioId).toBe(SCENARIO_ID);
      expect(result.projection.demand).toHaveLength(4);

      // Validation present
      expect(result.validation.feasible).toBe(true);
      expect(result.validation.violations).toHaveLength(0);

      // Constraint scenario present
      expect(result.constraintScenario.id).toBe(SCENARIO_ID);
      expect(result.constraintScenario.teams.length).toBeGreaterThan(0);
    });

    it('detects infeasibility when demand exceeds supply', async () => {
      // Create a scenario where adding demand will exceed supply
      const tightProvider = createMockProvider({
        supply: [
          { skillPoolId: 'sp-backend', skillPoolName: 'Backend', tokens: 50 },
        ],
        demand: [
          {
            initiativeId: 'init-existing',
            skillPoolId: 'sp-backend',
            skillPoolName: 'Backend',
            tokensP50: 40,
            tokensP90: null,
          },
        ],
        initiativeDemands: {
          'init-heavy': {
            initiativeId: 'init-heavy',
            demands: [
              {
                skillPoolId: 'sp-backend',
                skillPoolName: 'Backend',
                tokensP50: 30,
                tokensP90: null,
              },
            ],
          },
        },
      });

      const validatedProjector = new TokenScenarioProjector(
        tightProvider,
        capacityCheckValidator(),
      );

      const result = await validatedProjector.whatIf(SCENARIO_ID, [
        { initiativeId: 'init-heavy', targetStatus: 'RESOURCING' },
      ]);

      // Projection is built regardless
      expect(result.projection.demand).toHaveLength(2);

      // But validation reports infeasibility (40 + 30 = 70 > 50)
      expect(result.validation.feasible).toBe(false);
      expect(result.validation.violations).toHaveLength(1);
      expect(result.validation.violations[0].constraintId).toBe('capacity');
    });

    it('uses no-op validator when none provided', async () => {
      // Projector without explicit validator
      const noValidatorProjector = new TokenScenarioProjector(provider);

      const result = await noValidatorProjector.whatIf(SCENARIO_ID, [
        { initiativeId: 'init-new', targetStatus: 'RESOURCING' },
      ]);

      // Should still return a result (no-op validator = always feasible)
      expect(result.validation.feasible).toBe(true);
    });
  });

  // =========================================================================
  // 7. Immutability — original data not mutated
  // =========================================================================
  describe('immutability', () => {
    it('does not mutate original supply or demand arrays', async () => {
      const supplyBefore = JSON.stringify(baseSupply);
      const demandBefore = JSON.stringify(baseDemand);

      await projector.projectTransition(
        SCENARIO_ID,
        'init-new',
        'RESOURCING',
      );

      expect(JSON.stringify(baseSupply)).toBe(supplyBefore);
      expect(JSON.stringify(baseDemand)).toBe(demandBefore);
    });
  });

  // =========================================================================
  // 8. Ledger P90 handling
  // =========================================================================
  describe('ledger P90 computation', () => {
    it('computes P90 deltas when P90 data is available', async () => {
      const result = await projector.projectTransition(
        SCENARIO_ID,
        'init-new',
        'RESOURCING',
      );

      const backendLedger = result.ledger.find(
        (l) => l.skillPoolId === 'sp-backend',
      )!;
      // Existing P90: 40, New P90: 55 → total P90 = 95
      expect(backendLedger.demandP90).toBe(95);
      expect(backendLedger.deltaP90).toBe(5); // 100 - 95
    });

    it('handles null P90 values gracefully', async () => {
      const nullP90Provider = createMockProvider({
        supply: [
          { skillPoolId: 'sp-data', skillPoolName: 'Data', tokens: 50 },
        ],
        demand: [],
        initiativeDemands: {
          'init-null-p90': {
            initiativeId: 'init-null-p90',
            demands: [
              {
                skillPoolId: 'sp-data',
                skillPoolName: 'Data',
                tokensP50: 20,
                tokensP90: null,
              },
            ],
          },
        },
      });

      const nullProjector = new TokenScenarioProjector(nullP90Provider);
      const result = await nullProjector.projectTransition(
        SCENARIO_ID,
        'init-null-p90',
        'RESOURCING',
      );

      const dataLedger = result.ledger.find(
        (l) => l.skillPoolId === 'sp-data',
      )!;
      expect(dataLedger.demandP90).toBeNull();
      expect(dataLedger.deltaP90).toBeNull();
    });
  });

  // =========================================================================
  // 9. Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('handles initiative with no skill demands', async () => {
      const emptyDemandProvider = createMockProvider({
        supply: baseSupply,
        demand: baseDemand,
        initiativeDemands: {
          'init-empty': { initiativeId: 'init-empty', demands: [] },
        },
      });

      const emptyProjector = new TokenScenarioProjector(emptyDemandProvider);
      const result = await emptyProjector.projectTransition(
        SCENARIO_ID,
        'init-empty',
        'RESOURCING',
      );

      // No new demand added
      expect(result.demand).toHaveLength(2);
      expect(result.appliedChanges[0].action).toBe('add_demand');
      expect(result.appliedChanges[0].affectedSkillPools).toHaveLength(0);
    });

    it('removing demand for non-existent initiative is a no-op', async () => {
      const result = await projector.projectTransition(
        SCENARIO_ID,
        'init-ghost',
        'COMPLETE',
      );

      // Demand unchanged
      expect(result.demand).toHaveLength(2);
      expect(result.appliedChanges[0].action).toBe('remove_demand');
      expect(result.appliedChanges[0].affectedSkillPools).toHaveLength(0);
    });

    it('constraint scenario maps skill pools to teams', async () => {
      const validatedProjector = new TokenScenarioProjector(
        provider,
        feasibleValidator,
      );

      const result = await validatedProjector.whatIf(SCENARIO_ID, [
        { initiativeId: 'init-new', targetStatus: 'RESOURCING' },
      ]);

      // Each supply pool → one team
      expect(result.constraintScenario.teams).toHaveLength(3);
      expect(
        result.constraintScenario.teams.map((t) => t.name).sort(),
      ).toEqual(['Backend', 'Frontend', 'QA']);

      // Each initiative → one scheduled item
      expect(result.constraintScenario.items).toHaveLength(2);
    });
  });
});
