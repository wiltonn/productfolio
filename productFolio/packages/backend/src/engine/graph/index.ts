export { LifecycleGraph } from './lifecycle-graph.js';
export { GraphEngine } from './graph-engine.js';
export { DependencyResolver } from './dependency-resolver.js';
export { TransitionGateway } from './TransitionGateway.js';
export { requiresPriorState, notBlocked, deserializeGuard, registerGuard } from './guards.js';
export type {
  WorkflowState,
  WorkItem,
  Transition,
  TransitionGuard,
  TransitionResult,
  LifecycleDefinition,
  SerializedTransition,
  SerializedGuard,
  ValidationResult,
  CyclePath,
  DependencyCheckResult,
  ConstraintResult,
  TransitionDecision,
  ConstraintHook,
} from './types.js';

import defaultLifecycleJson from './default-lifecycle.json' with { type: 'json' };
import type { LifecycleDefinition } from './types.js';

export const defaultLifecycle: LifecycleDefinition = defaultLifecycleJson as LifecycleDefinition;
