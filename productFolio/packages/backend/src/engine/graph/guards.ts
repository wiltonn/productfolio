import type { TransitionGuard, WorkItem, WorkflowState, SerializedGuard } from './types.js';

/**
 * Built-in guard: requires the item to have visited a specific state
 * before the transition is allowed.
 */
export function requiresPriorState(requiredState: WorkflowState): TransitionGuard {
  return {
    description: `Item must have previously been in '${requiredState}'`,
    check: (item: WorkItem) => item.stateHistory.includes(requiredState),
  };
}

/**
 * Built-in guard: prevents transition if item is in 'blocked' state.
 * Items must be explicitly unblocked first.
 */
export function notBlocked(): TransitionGuard {
  return {
    description: 'Item must not be in blocked state',
    check: (item: WorkItem) => item.state !== 'blocked',
  };
}

/**
 * Registry of guard factories keyed by type name.
 * Used for deserializing guards from JSON config.
 */
const guardRegistry: Record<string, (params?: Record<string, unknown>) => TransitionGuard> = {
  requires_prior_state: (params) => {
    const state = params?.state as WorkflowState;
    if (!state) throw new Error('requires_prior_state guard requires a "state" param');
    return requiresPriorState(state);
  },
  not_blocked: () => notBlocked(),
};

/**
 * Deserializes a guard from its JSON representation using the guard registry.
 */
export function deserializeGuard(serialized: SerializedGuard): TransitionGuard {
  const factory = guardRegistry[serialized.type];
  if (!factory) {
    throw new Error(`Unknown guard type: '${serialized.type}'`);
  }
  return factory(serialized.params);
}

/**
 * Registers a custom guard factory. Orgs can extend the guard system.
 */
export function registerGuard(
  type: string,
  factory: (params?: Record<string, unknown>) => TransitionGuard,
): void {
  guardRegistry[type] = factory;
}
