import type {
  WorkflowState,
  TransitionDecision,
  ConstraintHook,
} from './types.js';
import { LifecycleGraph } from './lifecycle-graph.js';
import { GraphEngine } from './graph-engine.js';
import { DependencyResolver } from './dependency-resolver.js';

const DEFAULT_CONSTRAINT_HOOK: ConstraintHook = async () => ({
  approved: true,
  violations: [],
});

export class TransitionGateway {
  private engine: GraphEngine;
  private resolver: DependencyResolver;
  private constraintHook: ConstraintHook;
  private workStartingStates: Set<WorkflowState>;

  constructor(
    graph: LifecycleGraph,
    resolver: DependencyResolver,
    workStartingStates: WorkflowState[] = ['in_progress'],
  ) {
    this.engine = new GraphEngine(graph);
    this.resolver = resolver;
    this.constraintHook = DEFAULT_CONSTRAINT_HOOK;
    this.workStartingStates = new Set(workStartingStates);
  }

  async requestTransition(
    itemId: string,
    targetState: WorkflowState,
    context?: Record<string, unknown>,
  ): Promise<TransitionDecision> {
    const item = this.resolver.getItem(itemId);

    // 1. Structural check
    const structuralResult = this.engine.canTransition(item, targetState);

    if (!structuralResult.allowed) {
      return {
        allowed: false,
        structuralResult,
        dependencyResult: null,
        constraintResult: { approved: true, violations: [] },
        reason: structuralResult.reason,
      };
    }

    // 2. Dependency check (only for work-starting states)
    let dependencyResult = null;
    if (this.workStartingStates.has(targetState)) {
      dependencyResult = this.resolver.canStart(itemId);
      if (!dependencyResult.allowed) {
        return {
          allowed: false,
          structuralResult,
          dependencyResult,
          constraintResult: { approved: true, violations: [] },
          reason: dependencyResult.reason,
        };
      }
    }

    // 3. Constraint hook
    const constraintResult = await this.constraintHook(
      itemId,
      targetState,
      context,
    );

    if (!constraintResult.approved) {
      return {
        allowed: false,
        structuralResult,
        dependencyResult,
        constraintResult,
        reason: `Constraint violation: ${constraintResult.violations.join('; ')}`,
      };
    }

    return {
      allowed: true,
      structuralResult,
      dependencyResult,
      constraintResult,
      reason: 'Transition allowed',
    };
  }

  registerConstraintHook(fn: ConstraintHook): void {
    this.constraintHook = fn;
  }
}
