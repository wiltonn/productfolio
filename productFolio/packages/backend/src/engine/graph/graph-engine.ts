import type { WorkflowState, Transition, WorkItem, TransitionResult } from './types.js';
import { LifecycleGraph } from './lifecycle-graph.js';
import { WorkflowError } from '../../lib/errors.js';

/**
 * GraphEngine — the runtime API for executing state transitions against a LifecycleGraph.
 *
 * This engine checks STRUCTURAL legality only. It does NOT call the constraint solver.
 * Structural rules include: "is this transition defined in the graph?" and
 * "do all guards pass for this item?"
 */
export class GraphEngine {
  private readonly graph: LifecycleGraph;

  constructor(graph: LifecycleGraph) {
    this.graph = graph;
  }

  /**
   * Returns all transitions available from the given state.
   * Does not evaluate guards — just returns structurally defined transitions.
   */
  getValidTransitions(currentState: WorkflowState): Transition[] {
    return this.graph.getOutgoing(currentState);
  }

  /**
   * Checks whether a specific item can transition to the target state.
   * Evaluates all guards on the transition edge.
   *
   * This does NOT call the constraint solver — only structural graph rules.
   */
  canTransition(item: WorkItem, targetState: WorkflowState): TransitionResult {
    if (!this.graph.hasState(item.state)) {
      return {
        allowed: false,
        reason: `Current state '${item.state}' is not defined in the lifecycle`,
      };
    }

    if (!this.graph.hasState(targetState)) {
      return {
        allowed: false,
        reason: `Target state '${targetState}' is not defined in the lifecycle`,
      };
    }

    const outgoing = this.graph.getOutgoing(item.state);
    const transition = outgoing.find((t) => t.to === targetState);

    if (!transition) {
      const validTargets = outgoing.map((t) => t.to);
      return {
        allowed: false,
        reason: `No transition from '${item.state}' to '${targetState}'. Valid targets: [${validTargets.join(', ')}]`,
      };
    }

    // Evaluate guards
    for (const guard of transition.guards) {
      if (!guard.check(item)) {
        return {
          allowed: false,
          reason: `Guard failed: ${guard.description}`,
        };
      }
    }

    return { allowed: true, reason: 'Transition allowed' };
  }

  /**
   * Applies a transition to the item, returning a new WorkItem with updated state.
   * Throws WorkflowError if the transition is not structurally allowed.
   *
   * This does NOT call the constraint solver.
   */
  applyTransition(item: WorkItem, targetState: WorkflowState): WorkItem {
    const result = this.canTransition(item, targetState);

    if (!result.allowed) {
      throw new WorkflowError(result.reason, item.state, targetState);
    }

    return {
      ...item,
      state: targetState,
      stateHistory: [...item.stateHistory, targetState],
    };
  }
}
