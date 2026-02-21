// ============================================================================
// Orchestration Graph Types
// ============================================================================

export type WorkflowState =
  | 'backlog'
  | 'ready'
  | 'planned'
  | 'in_progress'
  | 'review'
  | 'done'
  | 'blocked';

export interface TransitionGuard {
  /** Human-readable description of the structural rule */
  description: string;
  /**
   * Guard function that checks structural legality.
   * NOT a constraint check — only checks graph-level rules
   * (e.g., "item must have passed through 'ready' before entering 'in_progress'")
   */
  check: (item: WorkItem) => boolean;
}

export interface Transition {
  from: WorkflowState;
  to: WorkflowState;
  guards: TransitionGuard[];
}

export interface WorkItem {
  id: string;
  state: WorkflowState;
  /** Ordered history of states this item has been in */
  stateHistory: WorkflowState[];
  metadata?: Record<string, unknown>;
  /** IDs of items that must complete before this item can start */
  dependsOn?: string[];
}

export interface CyclePath {
  path: string[];
}

export interface DependencyCheckResult {
  allowed: boolean;
  reason: string;
  pendingDependencies: string[];
}

export interface TransitionResult {
  allowed: boolean;
  reason: string;
}

export interface LifecycleDefinition {
  id: string;
  name: string;
  states: WorkflowState[];
  transitions: SerializedTransition[];
}

export interface SerializedTransition {
  from: WorkflowState;
  to: WorkflowState;
  guards: SerializedGuard[];
}

export interface SerializedGuard {
  type: string;
  description: string;
  params?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ConstraintResult {
  approved: boolean;
  violations: string[];
}

export interface TransitionDecision {
  allowed: boolean;
  structuralResult: TransitionResult;
  dependencyResult: DependencyCheckResult | null;
  constraintResult: ConstraintResult;
  reason: string;
}

export type ConstraintHook = (
  itemId: string,
  targetState: WorkflowState,
  context?: Record<string, unknown>,
) => Promise<ConstraintResult>;
