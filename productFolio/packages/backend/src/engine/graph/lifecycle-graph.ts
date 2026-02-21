import type {
  WorkflowState,
  Transition,
  LifecycleDefinition,
  ValidationResult,
} from './types.js';
import { deserializeGuard } from './guards.js';

/**
 * LifecycleGraph — a directed graph of WorkflowStates and Transitions.
 *
 * Configurable per-org, serializable as JSON, and validated for structural
 * integrity (no orphan states, no unreachable states, DAG-like forward flow).
 */
export class LifecycleGraph {
  readonly id: string;
  readonly name: string;
  private readonly states: Set<WorkflowState>;
  private readonly transitions: Transition[];
  /** Adjacency list: state → outgoing transitions */
  private readonly adjacency: Map<WorkflowState, Transition[]>;

  constructor(definition: LifecycleDefinition) {
    this.id = definition.id;
    this.name = definition.name;
    this.states = new Set(definition.states);
    this.transitions = definition.transitions.map((st) => ({
      from: st.from,
      to: st.to,
      guards: st.guards.map(deserializeGuard),
    }));

    this.adjacency = new Map();
    for (const state of this.states) {
      this.adjacency.set(state, []);
    }
    for (const t of this.transitions) {
      this.adjacency.get(t.from)!.push(t);
    }
  }

  getStates(): WorkflowState[] {
    return [...this.states];
  }

  getTransitions(): Transition[] {
    return [...this.transitions];
  }

  getOutgoing(state: WorkflowState): Transition[] {
    return this.adjacency.get(state) ?? [];
  }

  hasState(state: WorkflowState): boolean {
    return this.states.has(state);
  }

  /**
   * Validate the lifecycle graph for structural integrity.
   *
   * Checks:
   * 1. At least one state exists
   * 2. All transition endpoints reference declared states
   * 3. No orphan states (states with no incoming or outgoing transitions,
   *    excluding terminal states like 'done')
   * 4. All states are reachable from the first declared state
   */
  validate(): ValidationResult {
    const errors: string[] = [];

    if (this.states.size === 0) {
      errors.push('Lifecycle must have at least one state');
      return { valid: false, errors };
    }

    // Check transition endpoints
    for (const t of this.transitions) {
      if (!this.states.has(t.from)) {
        errors.push(`Transition references undeclared source state '${t.from}'`);
      }
      if (!this.states.has(t.to)) {
        errors.push(`Transition references undeclared target state '${t.to}'`);
      }
    }

    // Build incoming set
    const hasIncoming = new Set<WorkflowState>();
    const hasOutgoing = new Set<WorkflowState>();
    for (const t of this.transitions) {
      hasIncoming.add(t.to);
      hasOutgoing.add(t.from);
    }

    const stateArray = [...this.states];
    const firstState = stateArray[0];
    const terminalStates: WorkflowState[] = ['done'];

    // Check orphans (skip first state — it's the entry point, so no incoming is OK;
    // skip terminal states — no outgoing is OK)
    for (const state of this.states) {
      const isEntry = state === firstState;
      const isTerminal = terminalStates.includes(state);

      if (!isEntry && !hasIncoming.has(state)) {
        errors.push(`State '${state}' is unreachable (no incoming transitions)`);
      }
      if (!isTerminal && !hasOutgoing.has(state)) {
        errors.push(`State '${state}' is a dead-end (no outgoing transitions)`);
      }
    }

    // Check reachability from first state via BFS
    const reachable = new Set<WorkflowState>();
    const queue: WorkflowState[] = [firstState];
    reachable.add(firstState);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const t of this.getOutgoing(current)) {
        if (!reachable.has(t.to)) {
          reachable.add(t.to);
          queue.push(t.to);
        }
      }
    }

    for (const state of this.states) {
      if (!reachable.has(state) && state !== firstState) {
        errors.push(`State '${state}' is not reachable from entry state '${firstState}'`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
