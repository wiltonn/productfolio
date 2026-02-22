# CohesionXL Solver Engine

## Overview

The `v1/solver` branch introduces a four-layer planning engine that adds **capacity-aware governance** to ProductFolio. On `main`, status transitions (e.g. SCOPING → RESOURCING) are purely structural — the system checks the state machine and writes to the DB. The solver branch adds layers that project demand against supply and **block transitions that would exceed capacity**, returning actionable violation details instead of silently approving.

## What Changed vs. `main`

| Area | `main` branch | `v1/solver` branch |
|------|---------------|-------------------|
| Status transitions | Structural validation only (`isValidStatusTransition`) | Structural + capacity validation via GovernanceEngine |
| Capacity checking | None — transitions always succeed if structurally valid | TOKEN-mode scenarios validate supply vs demand before DB write |
| Engine code | Does not exist | `packages/backend/src/engine/` — 4 layers, ~3,500 lines |
| Shared types | Does not exist | `src/types/` — branded IDs, canonical domain model |
| Route response | Returns the updated initiative | Returns `{ approved, initiative, violations, suggestion }` |
| Rejection behavior | Only WorkflowError for invalid state machine edges | 422 with CAPACITY_EXCEEDED violations, affected items, and alternative suggestions |
| Test coverage | 0 engine tests | ~110 engine + bridge tests across 7 test files |

### New directories

```
src/types/                              # Canonical domain types (branded IDs, work items, tokens)
packages/backend/src/engine/
├── graph/                              # L1: Orchestration graph
├── projection/                         # L2: Scenario projection
├── constraints/                        # L3: Constraint validation
└── governance/                         # L4: Governance decision engine
packages/backend/src/services/
└── solver-bridge.service.ts            # DB ↔ Engine adapter
```

### Modified files

- `services/initiatives.service.ts` — `transitionStatus()` now runs capacity check for RESOURCING/IN_EXECUTION targets
- `routes/initiatives.ts` — `POST /api/initiatives/:id/status` returns richer response with `_governance` metadata on success, violations on rejection

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   API Route Layer                    │
│  POST /api/initiatives/:id/status                   │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              initiatives.service.ts                  │
│  transitionStatus(id, newStatus, actorId)            │
│                                                      │
│  1. Structural validation (isValidStatusTransition)  │
│  2. IF target ∈ {RESOURCING, IN_EXECUTION}:          │
│     └──→ solver-bridge.checkTransitionCapacity()     │
│  3. IF approved → DB update + log                    │
│     IF rejected → return violations (no DB write)    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│           solver-bridge.service.ts                   │
│                                                      │
│  • Loads TokenSupply/TokenDemand from Prisma         │
│  • Builds CapacityPlan + WorkItem[] for engine       │
│  • Delegates to GovernanceEngine.requestTransition() │
│  • Returns CapacityCheckResult                       │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │    L1    │  │    L2    │  │    L3    │
   │  Graph   │→│Projection│→│Constraints│
   │Structural│  │  Build   │  │ Validate │
   │ Legality │  │ Scenario │  │ Capacity │
   └──────────┘  └──────────┘  └──────────┘
          │            │            │
          └────────────┼────────────┘
                       ▼
              ┌──────────────┐
              │      L4      │
              │  Governance  │
              │   Decision   │
              │  + Audit Log │
              └──────────────┘
```

## Layer Details

### L1: Orchestration Graph (`engine/graph/`)

Structural state machine validation. Pure graph theory — no capacity awareness.

| Component | Purpose |
|-----------|---------|
| `LifecycleGraph` | Directed graph of workflow states and transitions; JSON-serializable, per-org configurable |
| `GraphEngine` | Runtime API: `canTransition()`, `applyTransition()`, `getValidTransitions()` |
| `DependencyResolver` | Topological sort (Kahn's), cycle detection (DFS coloring), critical path (DP) |
| `TransitionGateway` | Orchestrator: structural check → dependency check → constraint hook (L3 seam) |
| Guards | Pluggable structural rules (`requiresPriorState`, `notBlocked`, extensible via registry) |

**Workflow states:** backlog → ready → planned → in_progress → review → done (+ blocked)

### L2: Scenario Projection (`engine/projection/`)

Builds projected portfolio state by applying proposed changes. Does NOT validate — that's L3's job.

| Component | Purpose |
|-----------|---------|
| `ScenarioProjector` | Hour-based projection: auto-schedule (greedy forward), what-if analysis |
| `TokenScenarioProjector` | Token-based projection for TOKEN-mode planning: `projectTransition()`, `projectPortfolio()`, `whatIf()` |

**Key design decision:** L2 is pure transformation. It produces a projected scenario but never decides feasibility. This separation means L3 constraints can evolve independently.

**Status rules for token demand:**
- RESOURCING, IN_EXECUTION → demand is active (consumes tokens)
- COMPLETE, CANCELLED → demand is removed
- Other statuses → no demand change

### L3: Constraint Validation (`engine/constraints/`)

Pluggable constraint system that evaluates projected scenarios for feasibility.

| Constraint | What it checks |
|------------|---------------|
| `CapacityConstraint` | Team/skill capacity not exceeded per period; warns at >85% utilization |
| `TemporalFitConstraint` | Items fit within planning horizon |
| `DependencyConstraint` | Dependency ordering respected (dep.end ≤ item.start) |
| `BudgetConstraint` | Placeholder for future budget validation |

**CapacityGrid** — immutable 2D matrix (teams × periods) with O(1) utilization queries, contention analysis, and feasible window search. V1 uses greedy first-fit; designed for future CP solver integration.

**ConstraintRegistry** — register/deregister evaluators at runtime. Custom constraints implement the `ConstraintEvaluator` interface.

### L4: Governance Engine (`engine/governance/`)

Deterministic decision layer that converts planning activity into auditable decisions.

| Method | Purpose |
|--------|---------|
| `requestTransition(itemId, targetState)` | L1→L2→L3 pipeline; approves or rejects with violations |
| `validatePortfolio()` | Global health check; returns score (0–100), violations, warnings |
| `autoSchedule(workItems)` | Greedy forward scheduling respecting dependencies + priority |
| `whatIf(changes)` | Baseline vs. projected comparison with delta analysis |

**Violation codes:**
- `CAPACITY_EXCEEDED` — demand exceeds supply for a skill in a period
- `DEPENDENCY_CYCLE` — adding a dependency would create a cycle
- `DEPENDENCY_NOT_SCHEDULED` — required dependency not in portfolio
- `INVALID_STATE_TRANSITION` — item not found
- `SKILL_POOL_DEFICIT` — skill pool has zero supply

**Warning codes:**
- `NEAR_CAPACITY` — >80% utilization
- `TIGHT_DEPENDENCY_CHAIN` — 3+ items chained (cascade risk)

**Audit trail:** Every decision is logged with action, request, projected scenario, constraints evaluated, result, violations, warnings, and duration in ms.

**Health score formula:** `100 - (critical×25) - (high×15) - (low×5) - (warnings×2) - (>95% utilization×10)`

## Solver Bridge

`solver-bridge.service.ts` is the adapter between the app's Prisma data model and the pure engine.

**How it works:**

1. `requiresCapacityCheck(targetStatus)` — returns `true` for RESOURCING and IN_EXECUTION
2. `checkTransitionCapacity(initiativeId, targetStatus)`:
   - Loads all `TokenDemand` rows for the initiative
   - Filters to scenarios with `planningMode = 'TOKEN'`
   - For each TOKEN scenario, loads supply + demand from DB
   - Builds a single-period `CapacityPlan` and `WorkItem[]`
   - Only counts initiatives already in RESOURCING/IN_EXECUTION as active demand
   - Runs `GovernanceEngine.requestTransition()`
   - Returns `CapacityCheckResult`

**Backward compatibility:** If the initiative has no token demand or all scenarios use LEGACY mode, returns `{ checked: false, approved: true }` — the transition proceeds exactly as it did on `main`.

## API Response Changes

### Success (200)

```json
{
  "id": "...",
  "title": "My Initiative",
  "status": "RESOURCING",
  "businessOwner": { ... },
  "_governance": {
    "approved": true,
    "capacityChecked": true,
    "decision": {
      "scenario": { "totalDemand": 80, "totalCapacity": 200, "utilization": 0.4 },
      "warnings": []
    }
  }
}
```

### Rejection (422)

```json
{
  "approved": false,
  "violations": [
    {
      "code": "CAPACITY_EXCEEDED",
      "severity": "critical",
      "message": "backend capacity exceeded in period 0: demand 140.0h vs capacity 100h (over by 40.0h)",
      "affectedItems": ["init-1", "init-2"],
      "detail": { "skill": "backend", "period": 0, "demand": 140, "capacity": 100, "overBy": 40 }
    }
  ],
  "suggestion": {
    "startPeriod": 2,
    "tradeoffs": ["Delay start from period 0 to period 2"]
  }
}
```

## Test Coverage

| Test file | Tests | What it covers |
|-----------|-------|---------------|
| `graph-engine.test.ts` | 864 lines | L1: lifecycle graph, transitions, guards, dependency resolver |
| `scenario-projector.test.ts` | 655 lines | L2: hour-based projection, auto-schedule, what-if |
| `token-scenario-projector.test.ts` | 694 lines | L2: token projection, status transitions |
| `capacity-grid.test.ts` | 454 lines | L3: capacity grid, allocation, contention |
| `constraint-validator.test.ts` | 259 lines | L3: constraint aggregation |
| `governance-integration.test.ts` | 587 lines | L4: full L1→L4 pipeline, 5-item portfolio |
| `solver-bridge.test.ts` | 14 tests | Bridge: DB→engine adapter, block/approve scenarios |

## Feature Flag

The capacity check only activates for scenarios with `planningMode = 'TOKEN'`. It does not require a separate feature flag — it piggybacks on the existing `token_planning_v1` flag that gates TOKEN mode.

## Future Work

- **Multi-period capacity model** — the bridge currently collapses token supply/demand into a single period; extending to per-quarter periods would enable temporal capacity planning
- **CP solver backend** — the CapacityGrid is designed for a future constraint programming solver to replace the greedy first-fit algorithm
- **Budget constraint** — L3 has a placeholder `BudgetConstraint` ready for cost validation
- **Approval integration** — wire governance decisions into the approval workflow for human-in-the-loop overrides
