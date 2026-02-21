// ============================================================================
// GovernanceEngine — Deterministic control layer for CohesionXL's solver
//
// Converts stochastic planning activity into auditable decisions.
// Every decision is logged with full context for traceability.
// ============================================================================

import { DecisionLog } from './decision-log.js';
import type {
  WorkItem,
  CapacityPlan,
  PeriodCapacity,
  ProjectedScenario,
  GovernanceDecision,
  Violation,
  Warning,
  PortfolioHealthReport,
  PortfolioSummary,
  AutoScheduleResult,
  ScheduledItem,
  WhatIfChange,
  WhatIfResult,
  WhatIfDelta,
  AlternativeSuggestion,
} from './types.js';

export class GovernanceEngine {
  private items: Map<string, WorkItem> = new Map();
  private capacityPlan: CapacityPlan;
  readonly decisionLog = new DecisionLog();

  constructor(capacityPlan: CapacityPlan) {
    this.capacityPlan = capacityPlan;
  }

  addItem(item: WorkItem): void {
    this.items.set(item.id, item);
  }

  addItems(items: WorkItem[]): void {
    for (const item of items) {
      this.items.set(item.id, item);
    }
  }

  getItem(id: string): WorkItem | undefined {
    return this.items.get(id);
  }

  getAllItems(): WorkItem[] {
    return [...this.items.values()];
  }

  // ==========================================================================
  // 1. requestTransition — Check if a state change is legal
  // ==========================================================================

  requestTransition(itemId: string, targetState: Partial<WorkItem>): GovernanceDecision {
    const start = performance.now();
    const item = this.items.get(itemId);
    if (!item) {
      const scenario = this.projectScenario([...this.items.values()]);
      const violation: Violation = {
        code: 'INVALID_STATE_TRANSITION',
        severity: 'critical',
        message: `Item "${itemId}" not found in portfolio`,
        affectedItems: [itemId],
        detail: { itemId },
      };
      const decision: GovernanceDecision = {
        approved: false,
        scenario,
        violations: [violation],
        warnings: [],
      };
      this.logDecision('REQUEST_TRANSITION', { itemId, targetState }, scenario, decision, start);
      return decision;
    }

    // L1: Structural legality — check dependencies, cycles
    const structuralViolations = this.checkStructuralLegality(item, targetState);
    if (structuralViolations.length > 0) {
      const scenario = this.projectScenario([...this.items.values()]);
      const decision: GovernanceDecision = {
        approved: false,
        scenario,
        violations: structuralViolations,
        warnings: [],
      };
      this.logDecision('REQUEST_TRANSITION', { itemId, targetState }, scenario, decision, start);
      return decision;
    }

    // L2: Build projected scenario with the change applied
    const projectedItem: WorkItem = { ...item, ...targetState };
    const projectedItems = [...this.items.values()].map((i) =>
      i.id === itemId ? projectedItem : i
    );
    const scenario = this.projectScenario(projectedItems);

    // L3: Validate projected scenario
    const violations = this.validateScenario(projectedItems, scenario);
    const warnings = this.generateWarnings(projectedItems, scenario);

    const approved = violations.length === 0;

    let alternativeSuggestions: AlternativeSuggestion | undefined;
    if (!approved) {
      alternativeSuggestions = this.findAlternative(projectedItem, projectedItems);
    }

    const decision: GovernanceDecision = {
      approved,
      scenario,
      violations,
      warnings,
      alternativeSuggestions,
    };

    if (approved) {
      this.items.set(itemId, projectedItem);
    }

    this.logDecision('REQUEST_TRANSITION', { itemId, targetState }, scenario, decision, start);
    return decision;
  }

  // ==========================================================================
  // 2. validatePortfolio — Global validation of current state
  // ==========================================================================

  validatePortfolio(): PortfolioHealthReport {
    const start = performance.now();
    const items = [...this.items.values()];
    const scenario = this.projectScenario(items);
    const violations = this.validateScenario(items, scenario);
    const warnings = this.generateWarnings(items, scenario);

    const constrainedSkills = new Set<string>();
    for (const v of violations) {
      if (v.code === 'CAPACITY_EXCEEDED' || v.code === 'SKILL_POOL_DEFICIT') {
        const skill = v.detail.skill as string | undefined;
        if (skill) constrainedSkills.add(skill);
      }
    }

    const totalDemand = scenario.totalDemand;
    const totalCapacity = scenario.totalCapacity;

    const summary: PortfolioSummary = {
      totalItems: items.length,
      scheduledItems: items.filter((i) => i.startPeriod >= 0).length,
      totalDemandHours: totalDemand,
      totalCapacityHours: totalCapacity,
      overallUtilization: totalCapacity > 0 ? totalDemand / totalCapacity : 0,
      constrainedSkills: [...constrainedSkills],
      criticalViolations: violations.filter((v) => v.severity === 'critical').length,
    };

    const healthy = violations.length === 0;
    const score = this.computeHealthScore(violations, warnings, summary);

    const report: PortfolioHealthReport = {
      healthy,
      score,
      items,
      periodCapacity: scenario.periodCapacity,
      violations,
      warnings,
      summary,
    };

    this.logDecision(
      'VALIDATE_PORTFOLIO',
      { itemCount: items.length },
      scenario,
      { approved: healthy, violations, warnings },
      start
    );

    return report;
  }

  // ==========================================================================
  // 3. autoSchedule — Build optimal schedule for work items
  // ==========================================================================

  autoSchedule(workItems: WorkItem[]): AutoScheduleResult {
    const start = performance.now();

    // Add items to portfolio
    for (const item of workItems) {
      this.items.set(item.id, item);
    }

    // Topological sort respecting dependencies + priority
    const sorted = this.topologicalSort(workItems);
    const scheduled: ScheduledItem[] = [];
    const periodAlloc: Map<number, Record<string, number>> = new Map();

    // Greedy forward-pass scheduler
    for (const item of sorted) {
      const earliest = this.getEarliestStart(item, scheduled);
      let bestPeriod = earliest;
      let placed = false;

      for (let p = earliest; p < this.capacityPlan.periods; p++) {
        if (this.canFit(item, p, periodAlloc)) {
          bestPeriod = p;
          placed = true;
          break;
        }
      }

      if (!placed) {
        bestPeriod = earliest;
      }

      // Allocate
      const endPeriod = bestPeriod + item.duration - 1;
      const assignedCapacity: Record<string, number> = {};
      for (let p = bestPeriod; p <= endPeriod && p < this.capacityPlan.periods; p++) {
        if (!periodAlloc.has(p)) periodAlloc.set(p, {});
        const alloc = periodAlloc.get(p)!;
        for (const [skill, demand] of Object.entries(item.demandBySkill)) {
          const perPeriodDemand = demand / item.duration;
          alloc[skill] = (alloc[skill] ?? 0) + perPeriodDemand;
          assignedCapacity[skill] = (assignedCapacity[skill] ?? 0) + perPeriodDemand;
        }
      }

      item.startPeriod = bestPeriod;
      this.items.set(item.id, item);

      scheduled.push({
        itemId: item.id,
        startPeriod: bestPeriod,
        endPeriod: Math.min(endPeriod, this.capacityPlan.periods - 1),
        assignedCapacity,
      });
    }

    const allItems = [...this.items.values()];
    const scenario = this.projectScenario(allItems);
    const violations = this.validateScenario(allItems, scenario);
    const warnings = this.generateWarnings(allItems, scenario);

    const result: AutoScheduleResult = {
      feasible: violations.length === 0,
      scenario,
      schedule: scheduled,
      violations,
      warnings,
    };

    this.logDecision(
      'AUTO_SCHEDULE',
      { itemIds: workItems.map((i) => i.id) },
      scenario,
      { approved: result.feasible, violations, warnings },
      start
    );

    return result;
  }

  // ==========================================================================
  // 4. whatIf — Hypothetical scenario comparison
  // ==========================================================================

  whatIf(changes: WhatIfChange[]): WhatIfResult {
    const start = performance.now();
    const currentItems = [...this.items.values()];
    const baseline = this.projectScenario(currentItems);
    const baselineViolations = this.validateScenario(currentItems, baseline);

    // Apply changes to a copy
    const modifiedItems = new Map(this.items);
    for (const change of changes) {
      switch (change.type) {
        case 'ADD_ITEM':
          if (change.item) modifiedItems.set(change.item.id, change.item);
          break;
        case 'REMOVE_ITEM':
          if (change.itemId) modifiedItems.delete(change.itemId);
          break;
        case 'MOVE_ITEM': {
          if (change.itemId && change.targetPeriod !== undefined) {
            const existing = modifiedItems.get(change.itemId);
            if (existing) {
              modifiedItems.set(change.itemId, { ...existing, startPeriod: change.targetPeriod });
            }
          }
          break;
        }
        case 'RESIZE_ITEM': {
          if (change.itemId && change.newDuration !== undefined) {
            const existing = modifiedItems.get(change.itemId);
            if (existing) {
              modifiedItems.set(change.itemId, { ...existing, duration: change.newDuration });
            }
          }
          break;
        }
        case 'ADD_CAPACITY':
        case 'REMOVE_CAPACITY':
          // Capacity changes are handled in projection
          break;
      }
    }

    // Build capacity adjustments
    const capacityAdjustments: Record<string, number> = {};
    for (const change of changes) {
      if (change.type === 'ADD_CAPACITY' && change.skill && change.capacityDelta) {
        capacityAdjustments[change.skill] = (capacityAdjustments[change.skill] ?? 0) + change.capacityDelta;
      }
      if (change.type === 'REMOVE_CAPACITY' && change.skill && change.capacityDelta) {
        capacityAdjustments[change.skill] = (capacityAdjustments[change.skill] ?? 0) - change.capacityDelta;
      }
    }

    const modifiedItemsList = [...modifiedItems.values()];
    const projected = this.projectScenario(modifiedItemsList, capacityAdjustments);
    const projectedViolations = this.validateScenario(modifiedItemsList, projected);
    const warnings = this.generateWarnings(modifiedItemsList, projected);

    // Compute delta
    const newViolations = projectedViolations.filter(
      (pv) => !baselineViolations.some((bv) => bv.code === pv.code && bv.message === pv.message)
    );
    const resolvedViolations = baselineViolations.filter(
      (bv) => !projectedViolations.some((pv) => pv.code === bv.code && pv.message === bv.message)
    );

    const delta: WhatIfDelta = {
      utilizationChange: projected.utilization - baseline.utilization,
      newViolations,
      resolvedViolations,
      capacityImpact: capacityAdjustments,
    };

    const result: WhatIfResult = {
      baseline,
      projected,
      delta,
      violations: projectedViolations,
      warnings,
      feasible: projectedViolations.length === 0,
    };

    this.logDecision(
      'WHAT_IF',
      { changes },
      projected,
      { approved: result.feasible, violations: projectedViolations, warnings },
      start
    );

    return result;
  }

  // ==========================================================================
  // Internal: L1 — Structural Legality
  // ==========================================================================

  private checkStructuralLegality(item: WorkItem, targetState: Partial<WorkItem>): Violation[] {
    const violations: Violation[] = [];

    // Check dependency cycle
    if (targetState.dependencies) {
      const cycle = this.detectCycle(item.id, targetState.dependencies);
      if (cycle) {
        violations.push({
          code: 'DEPENDENCY_CYCLE',
          severity: 'critical',
          message: `Adding dependencies would create a cycle: ${cycle.join(' → ')}`,
          affectedItems: cycle,
          detail: { cycle },
        });
      }
    }

    // Check dependencies are scheduled
    const deps = targetState.dependencies ?? item.dependencies;
    for (const depId of deps) {
      const dep = this.items.get(depId);
      if (!dep) {
        violations.push({
          code: 'DEPENDENCY_NOT_SCHEDULED',
          severity: 'high',
          message: `Dependency "${depId}" is not in the portfolio`,
          affectedItems: [item.id, depId],
          detail: { missingDependency: depId },
        });
      }
    }

    return violations;
  }

  // ==========================================================================
  // Internal: L2 — Scenario Projection
  // ==========================================================================

  private projectScenario(
    items: WorkItem[],
    capacityAdjustments?: Record<string, number>
  ): ProjectedScenario {
    const periodCapacity: PeriodCapacity[] = [];
    let totalDemand = 0;
    let totalCapacity = 0;

    for (let p = 0; p < this.capacityPlan.periods; p++) {
      const capBySkill: Record<string, number> = {};
      const allocBySkill: Record<string, number> = {};

      // Base capacity
      for (const [skill, cap] of Object.entries(this.capacityPlan.capacityBySkillPerPeriod)) {
        const adjusted = cap + (capacityAdjustments?.[skill] ?? 0);
        capBySkill[skill] = Math.max(0, adjusted);
      }

      // Demand from items active in this period
      for (const item of items) {
        if (p >= item.startPeriod && p < item.startPeriod + item.duration) {
          for (const [skill, demand] of Object.entries(item.demandBySkill)) {
            const perPeriodDemand = demand / item.duration;
            allocBySkill[skill] = (allocBySkill[skill] ?? 0) + perPeriodDemand;
            // Ensure skill appears in capacity even if not in plan
            if (!(skill in capBySkill)) capBySkill[skill] = 0;
          }
        }
      }

      const remainingBySkill: Record<string, number> = {};
      for (const skill of new Set([...Object.keys(capBySkill), ...Object.keys(allocBySkill)])) {
        const cap = capBySkill[skill] ?? 0;
        const alloc = allocBySkill[skill] ?? 0;
        remainingBySkill[skill] = cap - alloc;
        totalCapacity += cap;
        totalDemand += alloc;
      }

      periodCapacity.push({
        period: p,
        capacityBySkill: capBySkill,
        allocatedBySkill: allocBySkill,
        remainingBySkill,
      });
    }

    return {
      items: [...items],
      periodCapacity,
      totalDemand,
      totalCapacity,
      utilization: totalCapacity > 0 ? totalDemand / totalCapacity : 0,
      ledger: null,
    };
  }

  // ==========================================================================
  // Internal: L3 — Constraint Validation
  // ==========================================================================

  private validateScenario(items: WorkItem[], scenario: ProjectedScenario): Violation[] {
    const violations: Violation[] = [];

    // Check capacity violations per period per skill
    for (const pc of scenario.periodCapacity) {
      for (const [skill, remaining] of Object.entries(pc.remainingBySkill)) {
        if (remaining < 0) {
          const overBy = Math.abs(remaining);
          const capacity = pc.capacityBySkill[skill] ?? 0;
          const demand = pc.allocatedBySkill[skill] ?? 0;
          const affectedItems = items
            .filter(
              (i) =>
                pc.period >= i.startPeriod &&
                pc.period < i.startPeriod + i.duration &&
                skill in i.demandBySkill
            )
            .map((i) => i.id);

          violations.push({
            code: 'CAPACITY_EXCEEDED',
            severity: overBy / (capacity || 1) > 0.5 ? 'critical' : 'high',
            message: `${skill} capacity exceeded in period ${pc.period}: demand ${demand.toFixed(1)}h vs capacity ${capacity}h (over by ${overBy.toFixed(1)}h)`,
            affectedItems,
            detail: { skill, period: pc.period, demand, capacity, overBy },
          });
        }
      }
    }

    // Check dependency ordering
    for (const item of items) {
      for (const depId of item.dependencies) {
        const dep = this.items.get(depId);
        if (dep && dep.startPeriod + dep.duration > item.startPeriod) {
          violations.push({
            code: 'DEPENDENCY_NOT_SCHEDULED',
            severity: 'high',
            message: `"${item.title}" starts in period ${item.startPeriod} but dependency "${dep.title}" doesn't finish until period ${dep.startPeriod + dep.duration}`,
            affectedItems: [item.id, depId],
            detail: {
              itemStart: item.startPeriod,
              depEnd: dep.startPeriod + dep.duration,
            },
          });
        }
      }
    }

    return violations;
  }

  private generateWarnings(items: WorkItem[], scenario: ProjectedScenario): Warning[] {
    const warnings: Warning[] = [];

    // Near-capacity warnings (>80% utilization per skill per period)
    for (const pc of scenario.periodCapacity) {
      for (const [skill, cap] of Object.entries(pc.capacityBySkill)) {
        if (cap === 0) continue;
        const alloc = pc.allocatedBySkill[skill] ?? 0;
        const util = alloc / cap;
        if (util > 0.8 && util <= 1.0) {
          warnings.push({
            code: 'NEAR_CAPACITY',
            message: `${skill} at ${(util * 100).toFixed(0)}% utilization in period ${pc.period}`,
            affectedItems: items
              .filter(
                (i) =>
                  pc.period >= i.startPeriod &&
                  pc.period < i.startPeriod + i.duration &&
                  skill in i.demandBySkill
              )
              .map((i) => i.id),
          });
        }
      }
    }

    // Tight dependency chains (3+ items chained)
    for (const item of items) {
      const chainLength = this.getDependencyChainLength(item.id);
      if (chainLength >= 3) {
        warnings.push({
          code: 'TIGHT_DEPENDENCY_CHAIN',
          message: `"${item.title}" is at the end of a ${chainLength}-item dependency chain — any slip cascades`,
          affectedItems: [item.id],
        });
      }
    }

    return warnings;
  }

  // ==========================================================================
  // Internal: Scheduling Helpers
  // ==========================================================================

  private topologicalSort(items: WorkItem[]): WorkItem[] {
    const itemMap = new Map(items.map((i) => [i.id, i]));
    const visited = new Set<string>();
    const result: WorkItem[] = [];

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const item = itemMap.get(id);
      if (!item) return;
      for (const depId of item.dependencies) {
        visit(depId);
      }
      result.push(item);
    };

    // Sort by priority first so same-level items come out in priority order
    const sorted = [...items].sort((a, b) => a.priority - b.priority);
    for (const item of sorted) {
      visit(item.id);
    }

    return result;
  }

  private getEarliestStart(item: WorkItem, scheduled: ScheduledItem[]): number {
    let earliest = 0;
    for (const depId of item.dependencies) {
      const dep = scheduled.find((s) => s.itemId === depId);
      if (dep) {
        earliest = Math.max(earliest, dep.endPeriod + 1);
      }
    }
    return earliest;
  }

  private canFit(
    item: WorkItem,
    startPeriod: number,
    periodAlloc: Map<number, Record<string, number>>
  ): boolean {
    for (let p = startPeriod; p < startPeriod + item.duration && p < this.capacityPlan.periods; p++) {
      const existing = periodAlloc.get(p) ?? {};
      for (const [skill, demand] of Object.entries(item.demandBySkill)) {
        const perPeriodDemand = demand / item.duration;
        const currentAlloc = existing[skill] ?? 0;
        const capacity = this.capacityPlan.capacityBySkillPerPeriod[skill] ?? 0;
        if (currentAlloc + perPeriodDemand > capacity) {
          return false;
        }
      }
    }
    return true;
  }

  private detectCycle(itemId: string, newDeps: string[]): string[] | null {
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (current: string): boolean => {
      if (current === itemId) return true;
      if (visited.has(current)) return false;
      visited.add(current);
      path.push(current);

      const item = this.items.get(current);
      if (item) {
        for (const dep of item.dependencies) {
          if (dfs(dep)) return true;
        }
      }
      path.pop();
      return false;
    };

    for (const dep of newDeps) {
      visited.clear();
      path.length = 0;
      path.push(itemId);
      if (dfs(dep)) {
        return [...path, itemId];
      }
    }

    return null;
  }

  private getDependencyChainLength(itemId: string, visited = new Set<string>()): number {
    if (visited.has(itemId)) return 0;
    visited.add(itemId);
    const item = this.items.get(itemId);
    if (!item || item.dependencies.length === 0) return 1;

    let maxChain = 0;
    for (const depId of item.dependencies) {
      maxChain = Math.max(maxChain, this.getDependencyChainLength(depId, visited));
    }
    return maxChain + 1;
  }

  private findAlternative(
    item: WorkItem,
    currentItems: WorkItem[]
  ): AlternativeSuggestion | undefined {
    // Try shifting to later periods
    for (let p = item.startPeriod + 1; p < this.capacityPlan.periods - item.duration + 1; p++) {
      const testItem = { ...item, startPeriod: p };
      const testItems = currentItems.map((i) => (i.id === item.id ? testItem : i));
      const scenario = this.projectScenario(testItems);
      const violations = this.validateScenario(testItems, scenario);

      if (violations.length === 0) {
        return {
          startPeriod: p,
          tradeoffs: [
            `Delay start from period ${item.startPeriod} to period ${p}`,
            `Completion shifts to period ${p + item.duration - 1}`,
            ...(item.dependencies.length > 0
              ? [`Maintains dependency ordering with ${item.dependencies.length} upstream items`]
              : []),
          ],
        };
      }
    }

    return undefined;
  }

  private computeHealthScore(
    violations: Violation[],
    warnings: Warning[],
    summary: PortfolioSummary
  ): number {
    let score = 100;
    for (const v of violations) {
      if (v.severity === 'critical') score -= 25;
      else if (v.severity === 'high') score -= 15;
      else score -= 5;
    }
    for (const _w of warnings) {
      score -= 2;
    }
    if (summary.overallUtilization > 0.95) score -= 10;
    return Math.max(0, Math.min(100, score));
  }

  // ==========================================================================
  // Internal: Decision Logging
  // ==========================================================================

  private logDecision(
    action: 'REQUEST_TRANSITION' | 'VALIDATE_PORTFOLIO' | 'AUTO_SCHEDULE' | 'WHAT_IF',
    request: unknown,
    scenario: ProjectedScenario,
    result: { approved: boolean; violations: Violation[]; warnings: Warning[] },
    startTime: number
  ): void {
    const constraintsEvaluated = [
      'CAPACITY_CHECK',
      'DEPENDENCY_ORDER',
      'SKILL_AVAILABILITY',
      ...(action === 'REQUEST_TRANSITION' ? ['STRUCTURAL_LEGALITY'] : []),
    ];

    this.decisionLog.record({
      action,
      request,
      projectedScenario: scenario,
      constraintsEvaluated,
      result: result.approved ? 'APPROVED' : 'REJECTED',
      violations: result.violations,
      warnings: result.warnings,
      durationMs: performance.now() - startTime,
    });
  }
}
