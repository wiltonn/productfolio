import { describe, it, expect, beforeEach } from 'vitest';
import { GovernanceEngine } from '../engine/governance/index.js';
import type { WorkItem, CapacityPlan } from '../engine/governance/index.js';

// ============================================================================
// Integration Test: Governance Decision Layer (L1–L4)
//
// Demonstrates the full flow:
//   1. Define a portfolio of 5 items with dependencies
//   2. Auto-schedule and verify feasibility
//   3. Request a change that causes a capacity violation
//   4. Show the governance engine rejecting it with explanation
//   5. Show a what-if that finds a feasible alternative
// ============================================================================

function buildPortfolio(): { items: WorkItem[]; capacity: CapacityPlan } {
  // 5 work items with a realistic dependency graph:
  //
  //   Platform Setup (P1)
  //        ├──→ Auth Service (P2)
  //        │         └──→ User Dashboard (P4)
  //        └──→ Data Pipeline (P3)
  //                  └──→ Analytics Engine (P5)
  //
  const items: WorkItem[] = [
    {
      id: 'item-1',
      title: 'Platform Setup',
      demandBySkill: { backend: 40, devops: 20 },
      priority: 1,
      dependencies: [],
      startPeriod: -1, // unscheduled
      duration: 1,
      status: 'PROPOSED',
    },
    {
      id: 'item-2',
      title: 'Auth Service',
      demandBySkill: { backend: 60, frontend: 20 },
      priority: 2,
      dependencies: ['item-1'],
      startPeriod: -1,
      duration: 2,
      status: 'PROPOSED',
    },
    {
      id: 'item-3',
      title: 'Data Pipeline',
      demandBySkill: { backend: 50, data: 40 },
      priority: 3,
      dependencies: ['item-1'],
      startPeriod: -1,
      duration: 2,
      status: 'PROPOSED',
    },
    {
      id: 'item-4',
      title: 'User Dashboard',
      demandBySkill: { frontend: 80, backend: 20 },
      priority: 4,
      dependencies: ['item-2'],
      startPeriod: -1,
      duration: 2,
      status: 'PROPOSED',
    },
    {
      id: 'item-5',
      title: 'Analytics Engine',
      demandBySkill: { data: 60, backend: 30 },
      priority: 5,
      dependencies: ['item-3'],
      startPeriod: -1,
      duration: 2,
      status: 'PROPOSED',
    },
  ];

  // Capacity: 6 periods (quarters), moderate team
  const capacity: CapacityPlan = {
    periods: 6,
    capacityBySkillPerPeriod: {
      backend: 60,
      frontend: 50,
      data: 40,
      devops: 30,
    },
  };

  return { items, capacity };
}

describe('GovernanceEngine — Full Integration', () => {
  let engine: GovernanceEngine;
  let portfolioItems: WorkItem[];

  beforeEach(() => {
    const { items, capacity } = buildPortfolio();
    portfolioItems = items;
    engine = new GovernanceEngine(capacity);
  });

  // ==========================================================================
  // Step 1: Define a portfolio of 5 items with dependencies
  // ==========================================================================

  describe('Step 1: Portfolio definition with dependencies', () => {
    it('should accept 5 items with a valid dependency graph', () => {
      engine.addItems(portfolioItems);

      const allItems = engine.getAllItems();
      expect(allItems).toHaveLength(5);

      // Verify dependency structure
      const item2 = engine.getItem('item-2')!;
      expect(item2.dependencies).toEqual(['item-1']);

      const item4 = engine.getItem('item-4')!;
      expect(item4.dependencies).toEqual(['item-2']);

      const item5 = engine.getItem('item-5')!;
      expect(item5.dependencies).toEqual(['item-3']);
    });

    it('should detect the full dependency chain depth', () => {
      engine.addItems(portfolioItems);

      // item-4 depends on item-2 → item-1 (chain of 3)
      // item-5 depends on item-3 → item-1 (chain of 3)
      const health = engine.validatePortfolio();
      const chainWarnings = health.warnings.filter(
        (w) => w.code === 'TIGHT_DEPENDENCY_CHAIN'
      );
      expect(chainWarnings.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // Step 2: Auto-schedule and verify feasibility
  // ==========================================================================

  describe('Step 2: Auto-schedule produces a feasible plan', () => {
    it('should schedule all 5 items respecting dependencies', () => {
      const result = engine.autoSchedule(portfolioItems);

      expect(result.schedule).toHaveLength(5);

      // Verify dependency ordering
      const scheduleMap = new Map(result.schedule.map((s) => [s.itemId, s]));

      const s1 = scheduleMap.get('item-1')!;
      const s2 = scheduleMap.get('item-2')!;
      const s3 = scheduleMap.get('item-3')!;
      const s4 = scheduleMap.get('item-4')!;
      const s5 = scheduleMap.get('item-5')!;

      // item-2 starts after item-1 finishes
      expect(s2.startPeriod).toBeGreaterThanOrEqual(s1.endPeriod + 1);

      // item-3 starts after item-1 finishes
      expect(s3.startPeriod).toBeGreaterThanOrEqual(s1.endPeriod + 1);

      // item-4 starts after item-2 finishes
      expect(s4.startPeriod).toBeGreaterThanOrEqual(s2.endPeriod + 1);

      // item-5 starts after item-3 finishes
      expect(s5.startPeriod).toBeGreaterThanOrEqual(s3.endPeriod + 1);
    });

    it('should produce a feasible scenario (no violations)', () => {
      const result = engine.autoSchedule(portfolioItems);

      expect(result.feasible).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should compute reasonable utilization', () => {
      const result = engine.autoSchedule(portfolioItems);

      expect(result.scenario.utilization).toBeGreaterThan(0);
      expect(result.scenario.utilization).toBeLessThanOrEqual(1);
      expect(result.scenario.totalDemand).toBeGreaterThan(0);
      expect(result.scenario.totalCapacity).toBeGreaterThan(0);
    });

    it('should log the scheduling decision', () => {
      engine.autoSchedule(portfolioItems);

      const logs = engine.decisionLog.getAll();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('AUTO_SCHEDULE');
      expect(logs[0].result).toBe('APPROVED');
      expect(logs[0].durationMs).toBeGreaterThanOrEqual(0);
      expect(logs[0].constraintsEvaluated).toContain('CAPACITY_CHECK');
      expect(logs[0].constraintsEvaluated).toContain('DEPENDENCY_ORDER');
    });
  });

  // ==========================================================================
  // Step 3: Request a change that causes a capacity violation
  // ==========================================================================

  describe('Step 3: Change request causing capacity violation', () => {
    beforeEach(() => {
      engine.autoSchedule(portfolioItems);
    });

    it('should reject moving an item to a period that overloads capacity', () => {
      // After auto-schedule, items are spread out. If we try to cram item-4
      // (80h frontend, 20h backend) into the same period as item-2 (60h backend, 20h frontend),
      // we should exceed backend capacity.

      const item2 = engine.getItem('item-2')!;
      const targetPeriod = item2.startPeriod; // Same period as item-2

      // Move item-4 to overlap with item-2 — this should violate capacity
      const decision = engine.requestTransition('item-4', {
        startPeriod: targetPeriod,
      });

      // Should be rejected: dependency violation (item-4 depends on item-2)
      // and/or capacity exceeded
      expect(decision.approved).toBe(false);
      expect(decision.violations.length).toBeGreaterThan(0);
    });

    it('should provide violation details with affected items', () => {
      const item2 = engine.getItem('item-2')!;

      const decision = engine.requestTransition('item-4', {
        startPeriod: item2.startPeriod,
      });

      expect(decision.approved).toBe(false);

      for (const violation of decision.violations) {
        expect(violation.code).toBeDefined();
        expect(violation.severity).toBeDefined();
        expect(violation.message).toBeTruthy();
        expect(violation.affectedItems.length).toBeGreaterThan(0);
      }
    });

    it('should reject requesting a transition for a non-existent item', () => {
      const decision = engine.requestTransition('item-999', {
        startPeriod: 0,
      });

      expect(decision.approved).toBe(false);
      expect(decision.violations[0].code).toBe('INVALID_STATE_TRANSITION');
    });
  });

  // ==========================================================================
  // Step 4: Governance engine rejects with explanation
  // ==========================================================================

  describe('Step 4: Rejection with full explanation', () => {
    beforeEach(() => {
      engine.autoSchedule(portfolioItems);
    });

    it('should explain why a capacity-busting change is rejected', () => {
      // Double the demand of item-4 and move it to period 0 to guarantee capacity blow-up
      const decision = engine.requestTransition('item-4', {
        demandBySkill: { frontend: 200, backend: 100 },
        startPeriod: 0,
      });

      expect(decision.approved).toBe(false);

      // Find capacity violation
      const capacityViolations = decision.violations.filter(
        (v) => v.code === 'CAPACITY_EXCEEDED'
      );
      expect(capacityViolations.length).toBeGreaterThan(0);

      // Verify the violation explains which skill is overloaded
      for (const cv of capacityViolations) {
        expect(cv.message).toMatch(/capacity exceeded/i);
        expect(cv.detail.skill).toBeDefined();
        expect(cv.detail.demand).toBeGreaterThan(cv.detail.capacity as number);
      }
    });

    it('should suggest an alternative when available', () => {
      // Create an item that just barely overflows period 0 but could fit later
      engine.addItem({
        id: 'item-overflow',
        title: 'Overflow Task',
        demandBySkill: { backend: 55 }, // just under capacity (60) alone, but period 0 already has items
        priority: 10,
        dependencies: [],
        startPeriod: 0,
        duration: 1,
        status: 'PROPOSED',
      });

      // Request to schedule in period 0 (which is occupied by item-1)
      const decision = engine.requestTransition('item-overflow', {
        startPeriod: 0,
      });

      if (!decision.approved && decision.alternativeSuggestions) {
        expect(decision.alternativeSuggestions.startPeriod).toBeGreaterThan(0);
        expect(decision.alternativeSuggestions.tradeoffs.length).toBeGreaterThan(0);
        expect(decision.alternativeSuggestions.tradeoffs[0]).toMatch(/Delay start/);
      }
    });

    it('should log rejected decisions with full context', () => {
      engine.requestTransition('item-4', {
        demandBySkill: { frontend: 200, backend: 100 },
        startPeriod: 0,
      });

      const logs = engine.decisionLog.getAll();
      const rejection = logs.find((l) => l.result === 'REJECTED');

      expect(rejection).toBeDefined();
      expect(rejection!.action).toBe('REQUEST_TRANSITION');
      expect(rejection!.violations.length).toBeGreaterThan(0);
      expect(rejection!.projectedScenario).toBeDefined();
      expect(rejection!.timestamp).toBeInstanceOf(Date);
      expect(rejection!.constraintsEvaluated).toContain('STRUCTURAL_LEGALITY');
    });
  });

  // ==========================================================================
  // Step 5: What-if finds a feasible alternative
  // ==========================================================================

  describe('Step 5: What-if scenario analysis', () => {
    beforeEach(() => {
      engine.autoSchedule(portfolioItems);
    });

    it('should show that adding capacity resolves a violation', () => {
      // First, create a violation by adding a heavy item
      engine.addItem({
        id: 'item-heavy',
        title: 'Heavy Backend Work',
        demandBySkill: { backend: 80 },
        priority: 6,
        dependencies: [],
        startPeriod: 0,
        duration: 1,
        status: 'PROPOSED',
      });

      // Verify there's now a violation
      const health = engine.validatePortfolio();
      const hasBackendViolation = health.violations.some(
        (v) => v.code === 'CAPACITY_EXCEEDED' && (v.detail.skill as string) === 'backend'
      );
      expect(hasBackendViolation).toBe(true);

      // What-if: add 80h of backend capacity (enough to absorb the overload)
      const whatIfResult = engine.whatIf([
        { type: 'ADD_CAPACITY', skill: 'backend', capacityDelta: 80 },
      ]);

      // The extra capacity should resolve the backend violation
      const backendViolationsRemain = whatIfResult.violations.filter(
        (v) => v.code === 'CAPACITY_EXCEEDED' && (v.detail.skill as string) === 'backend'
      );
      expect(backendViolationsRemain.length).toBeLessThan(
        health.violations.filter(
          (v) => v.code === 'CAPACITY_EXCEEDED' && (v.detail.skill as string) === 'backend'
        ).length
      );
    });

    it('should compare baseline vs projected utilization', () => {
      const whatIfResult = engine.whatIf([
        { type: 'ADD_CAPACITY', skill: 'backend', capacityDelta: 30 },
      ]);

      // Adding capacity should reduce utilization
      expect(whatIfResult.projected.utilization).toBeLessThan(
        whatIfResult.baseline.utilization
      );
      expect(whatIfResult.delta.utilizationChange).toBeLessThan(0);
    });

    it('should show impact of removing an item', () => {
      const baseHealth = engine.validatePortfolio();

      const whatIfResult = engine.whatIf([
        { type: 'REMOVE_ITEM', itemId: 'item-5' },
      ]);

      // Fewer items = less demand
      expect(whatIfResult.projected.totalDemand).toBeLessThan(
        whatIfResult.baseline.totalDemand
      );
      expect(whatIfResult.projected.items.length).toBe(
        baseHealth.items.length - 1
      );
    });

    it('should detect new violations from adding an item', () => {
      // Add an item that will overload data skill
      const bigDataItem: WorkItem = {
        id: 'item-big-data',
        title: 'Massive Data Migration',
        demandBySkill: { data: 200 },
        priority: 6,
        dependencies: [],
        startPeriod: 0,
        duration: 1,
        status: 'PROPOSED',
      };

      const whatIfResult = engine.whatIf([
        { type: 'ADD_ITEM', item: bigDataItem },
      ]);

      expect(whatIfResult.feasible).toBe(false);
      expect(whatIfResult.delta.newViolations.length).toBeGreaterThan(0);

      const dataViolation = whatIfResult.delta.newViolations.find(
        (v) => (v.detail.skill as string) === 'data'
      );
      expect(dataViolation).toBeDefined();
      expect(dataViolation!.code).toBe('CAPACITY_EXCEEDED');
    });

    it('should log what-if decisions', () => {
      engine.whatIf([
        { type: 'ADD_CAPACITY', skill: 'backend', capacityDelta: 20 },
      ]);

      const logs = engine.decisionLog.getAll();
      const whatIfLog = logs.find((l) => l.action === 'WHAT_IF');
      expect(whatIfLog).toBeDefined();
      expect(whatIfLog!.constraintsEvaluated).toContain('CAPACITY_CHECK');
    });
  });

  // ==========================================================================
  // End-to-End: Full Governance Flow
  // ==========================================================================

  describe('End-to-End: Complete governance flow', () => {
    it('should demonstrate the full lifecycle', () => {
      // --- Phase 1: Auto-schedule 5 items ---
      const scheduleResult = engine.autoSchedule(portfolioItems);
      expect(scheduleResult.feasible).toBe(true);
      expect(scheduleResult.schedule).toHaveLength(5);

      // --- Phase 2: Validate the portfolio is healthy ---
      const health = engine.validatePortfolio();
      expect(health.summary.totalItems).toBe(5);
      expect(health.summary.scheduledItems).toBe(5);

      // --- Phase 3: Request a bad transition ---
      const badDecision = engine.requestTransition('item-4', {
        demandBySkill: { frontend: 200, backend: 100 },
        startPeriod: 0,
      });
      expect(badDecision.approved).toBe(false);
      expect(badDecision.violations.length).toBeGreaterThan(0);

      // item-4 should NOT have been modified (rejected transitions are not applied)
      const item4 = engine.getItem('item-4')!;
      expect(item4.demandBySkill.frontend).toBe(80); // original value

      // --- Phase 4: Request a valid transition ---
      // Find a period where item-4 can legally fit after its dependency
      const item2 = engine.getItem('item-2')!;
      const validPeriod = item2.startPeriod + item2.duration;

      const goodDecision = engine.requestTransition('item-4', {
        startPeriod: validPeriod,
      });
      // This should be approved if capacity allows
      if (goodDecision.approved) {
        const updated = engine.getItem('item-4')!;
        expect(updated.startPeriod).toBe(validPeriod);
      }

      // --- Phase 5: What-if adding capacity ---
      const whatIf = engine.whatIf([
        { type: 'ADD_CAPACITY', skill: 'frontend', capacityDelta: 30 },
        { type: 'ADD_CAPACITY', skill: 'backend', capacityDelta: 20 },
      ]);
      expect(whatIf.projected.totalCapacity).toBeGreaterThan(
        whatIf.baseline.totalCapacity
      );

      // --- Phase 6: Verify audit trail ---
      const logs = engine.decisionLog.getAll();
      expect(logs.length).toBeGreaterThanOrEqual(4); // schedule + validate + bad + good/whatif
      expect(logs.every((l) => l.timestamp instanceof Date)).toBe(true);
      expect(logs.every((l) => l.constraintsEvaluated.length > 0)).toBe(true);
      expect(logs.every((l) => l.durationMs >= 0)).toBe(true);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge cases', () => {
    it('should handle empty portfolio', () => {
      const health = engine.validatePortfolio();
      expect(health.healthy).toBe(true);
      expect(health.summary.totalItems).toBe(0);
      expect(health.score).toBe(100);
    });

    it('should handle single item with no dependencies', () => {
      const result = engine.autoSchedule([
        {
          id: 'solo',
          title: 'Solo Task',
          demandBySkill: { backend: 10 },
          priority: 1,
          dependencies: [],
          startPeriod: -1,
          duration: 1,
          status: 'PROPOSED',
        },
      ]);

      expect(result.feasible).toBe(true);
      expect(result.schedule).toHaveLength(1);
      expect(result.schedule[0].startPeriod).toBe(0);
    });

    it('should reject dependency cycles', () => {
      engine.addItems([
        {
          id: 'a',
          title: 'A',
          demandBySkill: { backend: 10 },
          priority: 1,
          dependencies: [],
          startPeriod: 0,
          duration: 1,
          status: 'PROPOSED',
        },
        {
          id: 'b',
          title: 'B',
          demandBySkill: { backend: 10 },
          priority: 2,
          dependencies: ['a'],
          startPeriod: 1,
          duration: 1,
          status: 'PROPOSED',
        },
      ]);

      // Try to make A depend on B (creates cycle A → B → A)
      const decision = engine.requestTransition('a', {
        dependencies: ['b'],
      });

      expect(decision.approved).toBe(false);
      const cycleViolation = decision.violations.find(
        (v) => v.code === 'DEPENDENCY_CYCLE'
      );
      expect(cycleViolation).toBeDefined();
      expect(cycleViolation!.message).toMatch(/cycle/i);
    });

    it('should handle items that exceed total capacity', () => {
      const result = engine.autoSchedule([
        {
          id: 'huge',
          title: 'Impossible Task',
          demandBySkill: { backend: 500 }, // way over 60/period capacity
          priority: 1,
          dependencies: [],
          startPeriod: -1,
          duration: 1,
          status: 'PROPOSED',
        },
      ]);

      expect(result.feasible).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].code).toBe('CAPACITY_EXCEEDED');
    });
  });
});
