import { describe, it, expect } from 'vitest';
import {
  ConstraintValidator,
  ConstraintRegistry,
  BudgetConstraint,
  type Scenario,
  type ConstraintEvaluator,
  type ConstraintEvaluatorResult,
} from '../engine/constraints/index.js';

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'scenario-1',
    name: 'Test Scenario',
    horizon: 4,
    teams: [
      { id: 'team-1', name: 'Backend', capacityByPeriod: [10, 10, 10, 10] },
    ],
    items: [
      {
        id: 'item-1',
        name: 'Feature A',
        startPeriod: 0,
        duration: 2,
        dependencies: [],
        teamAllocations: [
          { teamId: 'team-1', periodIndex: 0, tokens: 5 },
          { teamId: 'team-1', periodIndex: 1, tokens: 5 },
        ],
      },
    ],
    ...overrides,
  };
}

describe('ConstraintValidator', () => {
  it('passes all constraints for a feasible scenario', () => {
    const validator = new ConstraintValidator();
    const result = validator.validate(makeScenario());

    expect(result.feasible).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.utilizationMap.length).toBeGreaterThan(0);
  });

  it('detects capacity violation when team is overloaded', () => {
    const scenario = makeScenario({
      items: [
        {
          id: 'item-1',
          name: 'Feature A',
          startPeriod: 0,
          duration: 1,
          dependencies: [],
          teamAllocations: [{ teamId: 'team-1', periodIndex: 0, tokens: 15 }],
        },
      ],
    });

    const validator = new ConstraintValidator();
    const result = validator.validate(scenario);

    expect(result.feasible).toBe(false);
    expect(result.violations.some((v) => v.constraintId === 'capacity')).toBe(true);
    const violation = result.violations.find((v) => v.constraintId === 'capacity')!;
    expect(violation.affectedTeamIds).toContain('team-1');
    expect(violation.affectedPeriods).toContain(0);
  });

  it('detects dependency violation when item starts before dependency completes', () => {
    const scenario = makeScenario({
      items: [
        {
          id: 'item-1',
          name: 'Feature A',
          startPeriod: 0,
          duration: 3,
          dependencies: [],
          teamAllocations: [{ teamId: 'team-1', periodIndex: 0, tokens: 5 }],
        },
        {
          id: 'item-2',
          name: 'Feature B',
          startPeriod: 1,
          duration: 1,
          dependencies: ['item-1'],
          teamAllocations: [{ teamId: 'team-1', periodIndex: 1, tokens: 5 }],
        },
      ],
    });

    const validator = new ConstraintValidator();
    const result = validator.validate(scenario);

    expect(result.feasible).toBe(false);
    expect(result.violations.some((v) => v.constraintId === 'dependency')).toBe(true);
    const violation = result.violations.find((v) => v.constraintId === 'dependency')!;
    expect(violation.affectedItemIds).toContain('item-2');
    expect(violation.affectedItemIds).toContain('item-1');
  });

  it('detects temporal fit violation when item exceeds horizon', () => {
    const scenario = makeScenario({
      horizon: 4,
      items: [
        {
          id: 'item-1',
          name: 'Feature A',
          startPeriod: 2,
          duration: 5,
          dependencies: [],
          teamAllocations: [{ teamId: 'team-1', periodIndex: 2, tokens: 5 }],
        },
      ],
    });

    const validator = new ConstraintValidator();
    const result = validator.validate(scenario);

    expect(result.feasible).toBe(false);
    expect(result.violations.some((v) => v.constraintId === 'temporal-fit')).toBe(true);
  });

  it('detects multiple constraint violations simultaneously', () => {
    const scenario = makeScenario({
      horizon: 4,
      items: [
        {
          id: 'item-1',
          name: 'Feature A',
          startPeriod: 0,
          duration: 3,
          dependencies: [],
          teamAllocations: [{ teamId: 'team-1', periodIndex: 0, tokens: 15 }],
        },
        {
          id: 'item-2',
          name: 'Feature B',
          startPeriod: 1,
          duration: 1,
          dependencies: ['item-1'],
          teamAllocations: [{ teamId: 'team-1', periodIndex: 1, tokens: 5 }],
        },
      ],
    });

    const validator = new ConstraintValidator();
    const result = validator.validate(scenario);

    expect(result.feasible).toBe(false);
    const constraintIds = new Set(result.violations.map((v) => v.constraintId));
    expect(constraintIds.has('capacity')).toBe(true);
    expect(constraintIds.has('dependency')).toBe(true);
  });

  it('warns when utilization exceeds 85% threshold', () => {
    const scenario = makeScenario({
      items: [
        {
          id: 'item-1',
          name: 'Feature A',
          startPeriod: 0,
          duration: 1,
          dependencies: [],
          teamAllocations: [{ teamId: 'team-1', periodIndex: 0, tokens: 9 }],
        },
      ],
    });

    const validator = new ConstraintValidator();
    const result = validator.validate(scenario);

    expect(result.feasible).toBe(true);
    expect(result.warnings.some((w) => w.constraintId === 'capacity')).toBe(true);
    const warning = result.warnings.find((w) => w.constraintId === 'capacity')!;
    expect(warning.metric).toBe('utilization');
    expect(warning.actual).toBeGreaterThan(0.85);
  });

  it('budget constraint stub always passes', () => {
    const budget = new BudgetConstraint();
    const result = budget.evaluate(makeScenario());

    expect(result.violations).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('supports custom constraints via registry plugin', () => {
    const customConstraint: ConstraintEvaluator = {
      id: 'custom',
      name: 'Custom Constraint',
      evaluate(_scenario: Scenario): ConstraintEvaluatorResult {
        return {
          violations: [
            {
              constraintId: 'custom',
              severity: 'error',
              message: 'Custom violation',
              affectedItemIds: [],
              affectedTeamIds: [],
              affectedPeriods: [],
            },
          ],
          warnings: [],
        };
      },
    };

    const registry = new ConstraintRegistry();
    registry.register(customConstraint);
    const validator = new ConstraintValidator(registry);
    const result = validator.validate(makeScenario());

    expect(result.feasible).toBe(false);
    expect(result.violations.some((v) => v.constraintId === 'custom')).toBe(true);
  });

  it('collects all violations without short-circuiting', () => {
    const scenario = makeScenario({
      horizon: 4,
      items: [
        {
          id: 'item-1',
          name: 'Feature A',
          startPeriod: 0,
          duration: 3,
          dependencies: [],
          teamAllocations: [{ teamId: 'team-1', periodIndex: 0, tokens: 15 }],
        },
        {
          id: 'item-2',
          name: 'Feature B',
          startPeriod: 1,
          duration: 1,
          dependencies: ['item-1'],
          teamAllocations: [{ teamId: 'team-1', periodIndex: 1, tokens: 5 }],
        },
        {
          id: 'item-3',
          name: 'Feature C',
          startPeriod: 2,
          duration: 5,
          dependencies: [],
          teamAllocations: [{ teamId: 'team-1', periodIndex: 2, tokens: 5 }],
        },
      ],
    });

    const validator = new ConstraintValidator();
    const result = validator.validate(scenario);

    expect(result.feasible).toBe(false);
    const constraintIds = new Set(result.violations.map((v) => v.constraintId));
    expect(constraintIds.has('capacity')).toBe(true);
    expect(constraintIds.has('dependency')).toBe(true);
    expect(constraintIds.has('temporal-fit')).toBe(true);
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });
});
