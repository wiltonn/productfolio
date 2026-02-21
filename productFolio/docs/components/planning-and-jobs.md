# Planning Layer, Background Jobs & Plugins

## Table of Contents

- [Part 1: Planning Layer (Strangler Pattern)](#part-1-planning-layer-strangler-pattern)
  - [Architecture Overview](#architecture-overview)
  - [types.ts -- DTOs](#typests----dtos)
  - [planning-engine.ts -- Interface Contract](#planning-enginets----interface-contract)
  - [planning.service.ts -- Mode Dispatch](#planningservicets----mode-dispatch)
  - [legacy-time-model.ts -- LegacyTimeModel](#legacy-time-modelts----legacytimemodel)
  - [token-flow-model.ts -- TokenFlowModel](#token-flow-modelts----tokenflowmodel)
  - [derive-demand.ts -- Token Demand Derivation](#derive-demandts----token-demand-derivation)
- [Part 2: Background Jobs (BullMQ)](#part-2-background-jobs-bullmq)
  - [Queue Configuration (queue.ts)](#queue-configuration-queuets)
  - [Worker Setup (worker.ts)](#worker-setup-workerts)
  - [Job Scheduling (scheduler.ts)](#job-scheduling-schedulerts)
  - [Barrel Export (index.ts)](#barrel-export-indexts)
  - [Processors](#processors)
- [Part 3: Plugins](#part-3-plugins)
  - [Auth Plugin (auth.plugin.ts)](#auth-plugin-authplugints)
  - [Feature Flag Plugin (feature-flag.plugin.ts)](#feature-flag-plugin-feature-flagplugints)

---

## Part 1: Planning Layer (Strangler Pattern)

**Source**: `packages/backend/src/planning/`

### Architecture Overview

The planning layer implements the **Strangler Fig pattern** to migrate from time-based resource planning (LEGACY mode) to token-based capacity planning (TOKEN mode) without disrupting existing functionality. Each `Scenario` has a `planningMode` field (`LEGACY` or `TOKEN`) that determines which engine processes its requests.

```
                      +-----------------+
   Route handlers --> | PlanningService | --> getEngine(scenarioId)
                      +-----------------+
                              |
               +--------------+--------------+
               |                             |
    +------------------+          +-------------------+
    | LegacyTimeModel  |          |  TokenFlowModel   |
    +------------------+          +-------------------+
    | delegates to:    |          | queries Prisma:   |
    | allocationService|          | SkillPool,        |
    | scenarioCalcSvc  |          | TokenSupply,      |
    +------------------+          | TokenDemand       |
                                  +-------------------+
```

Existing `/capacity-demand` and `/calculator` endpoints are routed through `PlanningService`. When a scenario uses LEGACY mode, its output is identical to the pre-Strangler behavior. TOKEN mode adds the token ledger summary endpoint. The mode can be toggled per scenario via `PUT /api/scenarios/:id/planning-mode`.

### types.ts -- DTOs

**File**: `packages/backend/src/planning/types.ts`

Defines the data-transfer objects for the token ledger:

| Type | Fields | Purpose |
|------|--------|---------|
| `TokenLedgerPoolEntry` | `poolName`, `supplyTokens`, `demandP50`, `demandP90`, `delta` | Per-pool supply vs. demand snapshot. `delta = supplyTokens - demandP50`. |
| `BindingConstraint` | `poolName`, `deficit` | Pools where demand exceeds supply (`delta < 0`). `deficit = abs(delta)`. |
| `LedgerExplanation` | `skillPool`, `message` | Natural-language explanation per pool. |
| `TokenLedgerSummary` | `scenarioId`, `periodId`, `periodLabel`, `pools[]`, `bindingConstraints[]`, `explanations[]` | Complete ledger response for a scenario. |

### planning-engine.ts -- Interface Contract

**File**: `packages/backend/src/planning/planning-engine.ts`

Defines the `PlanningEngine` interface that both models implement:

```ts
interface PlanningEngine {
  getCapacityDemand(scenarioId: string): Promise<CapacityDemandResult[]>;
  getCalculator(scenarioId: string, options?: CalculatorOptions): Promise<CalculatorResult>;
  getTokenLedgerSummary(scenarioId: string): Promise<TokenLedgerSummary>;
}
```

- `getCapacityDemand` -- Returns per-skill capacity vs. demand breakdowns.
- `getCalculator` -- Returns the full scenario calculator result with optional breakdown.
- `getTokenLedgerSummary` -- Returns the token ledger (TOKEN mode only; LEGACY throws `WorkflowError`).

### planning.service.ts -- Mode Dispatch

**File**: `packages/backend/src/planning/planning.service.ts`

`PlanningService` is the single entry point. It holds both engine instances and delegates based on mode:

1. `getEngine(scenarioId)` -- Reads `scenario.planningMode` from the database. Returns `LegacyTimeModel` for `LEGACY`, `TokenFlowModel` for `TOKEN`. Throws `NotFoundError` if scenario does not exist.
2. `getCapacityDemand(scenarioId)` -- Delegates to the resolved engine.
3. `getCalculator(scenarioId, options?)` -- Delegates to the resolved engine.
4. `getTokenLedgerSummary(scenarioId)` -- Delegates to the resolved engine.

A singleton `planningService` instance is exported for use in route handlers.

### legacy-time-model.ts -- LegacyTimeModel

**File**: `packages/backend/src/planning/legacy-time-model.ts`

Implements `PlanningEngine` by delegating to pre-existing services:

| Method | Delegates to |
|--------|-------------|
| `getCapacityDemand` | `allocationService.calculateCapacityDemand(scenarioId)` |
| `getCalculator` | `scenarioCalculatorService.calculate(scenarioId, options)` |
| `getTokenLedgerSummary` | Throws `WorkflowError` -- token ledger is not available in legacy mode |

This ensures all pre-Strangler behavior is preserved with zero code duplication.

### token-flow-model.ts -- TokenFlowModel

**File**: `packages/backend/src/planning/token-flow-model.ts`

Implements `PlanningEngine` for TOKEN mode. `getCapacityDemand` and `getCalculator` are not yet implemented (throw `WorkflowError`). The primary method is `getTokenLedgerSummary`:

**Algorithm** (8 steps):

1. Load scenario with associated period from Prisma.
2. Validate `planningMode === 'TOKEN'`; throw `WorkflowError` otherwise.
3. Load all active `SkillPool` records. Return empty summary if none exist.
4. Aggregate `TokenSupply` rows per `skillPoolId` (sum of `tokens`).
5. Aggregate `TokenDemand` rows per `skillPoolId` -- P50 is a simple sum; P90 propagates `null` (if any entry is null, the pool P90 becomes null).
6. Build `TokenLedgerPoolEntry[]` with `delta = supply - demandP50`.
7. Build `BindingConstraint[]` from pools where `delta < 0`, sorted by deficit descending.
8. Generate `LedgerExplanation[]` with `buildPoolExplanation()` producing human-readable messages for each pool state (surplus, deficit, balanced, no supply, no demand).

### derive-demand.ts -- Token Demand Derivation

**File**: `packages/backend/src/planning/derive-demand.ts`

`deriveTokenDemand(scenarioId, initiativeId?)` converts hour-based scope item estimates into token demand entries, bridging LEGACY scoping data with the TOKEN planning model.

**Types**:
- `DerivedDemandEntry` -- `{ initiativeId, skillPoolId, skillPoolName, tokensP50, tokensP90 }`
- `DeriveTokenDemandResult` -- `{ derivedDemands[], warnings[] }`

**Algorithm** (6 steps):

1. Load and validate scenario (must be TOKEN mode).
2. Load scope items -- either for a single initiative or for all initiatives in the scenario's `priorityRankings`.
3. Load active skill pools keyed by lowercase name for case-insensitive matching.
4. Load calibrations (`TokenCalibration`) -- picks the most recent `effectiveDate <= now` per pool. Falls back to 1:1 token-to-hour ratio if no calibration exists (with warning).
5. Process each scope item's `skillDemand` JSON:
   - Match skill name to a pool (case-insensitive). Warn if no match.
   - `tokensP50 = hours * tokenPerHour`
   - `tokensP90 = hours * (estimateP90 / estimateP50) * tokenPerHour` (null if estimates are missing)
   - Aggregate by `initiativeId:skillPoolId` key.
6. Return `derivedDemands[]` and accumulated `warnings[]`.

---

## Part 2: Background Jobs (BullMQ)

**Source**: `packages/backend/src/jobs/`

All background jobs use BullMQ with a shared Redis connection. Queues are lazily initialized singletons. Workers run in a separate process (`npm run dev:worker`).

### Queue Configuration (queue.ts)

**File**: `packages/backend/src/jobs/queue.ts`

**Redis Connection**: Read from environment variables (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`) with localhost defaults.

**Queue names** (constant `QUEUE_NAMES`):

| Queue Name | Constant |
|-----------|----------|
| `scenario-recompute` | `QUEUE_NAMES.SCENARIO_RECOMPUTE` |
| `csv-import` | `QUEUE_NAMES.CSV_IMPORT` |
| `view-refresh` | `QUEUE_NAMES.VIEW_REFRESH` |
| `drift-check` | `QUEUE_NAMES.DRIFT_CHECK` |
| `jira-sync` | `QUEUE_NAMES.JIRA_SYNC` |
| `status-log-backfill` | `QUEUE_NAMES.STATUS_LOG_BACKFILL` |

**Queue default options**:

| Queue | Attempts | Backoff | Completed Retention | Failed Retention |
|-------|----------|---------|-------------------|-----------------|
| scenario-recompute | 3 | exponential, 1s | 24h / 1000 jobs | 7 days |
| csv-import | 1 | none | 24h / 100 jobs | 7 days |
| view-refresh | 3 | exponential, 2s | 12h / 500 jobs | 24h |
| drift-check | 3 | exponential, 2s | 12h / 500 jobs | 24h |
| jira-sync | 3 | exponential, 5s | 24h / 500 jobs | 7 days |
| status-log-backfill | 1 | none | 7 days | 7 days |

**Job data interfaces**: Each queue has a typed data interface (`ScenarioRecomputeJobData`, `CsvImportJobData`, `ViewRefreshJobData`, `DriftCheckJobData`, `JiraSyncJobData`, `StatusLogBackfillJobData`).

**Helper functions**: Each queue has an `enqueue*` helper that wraps `queue.add()` with appropriate deduplication:

| Helper | Dedup Strategy | Delay |
|--------|---------------|-------|
| `enqueueScenarioRecompute` | Job ID = `recompute-{scenarioId}` | 500ms debounce |
| `enqueueCsvImport` | No dedup (unique per import) | none |
| `enqueueViewRefresh` | Job ID = `refresh-{viewType}-{scenarioIds}` | 1000ms debounce |
| `enqueueDriftCheck` | Job ID = `drift-check-{scenarioId\|all}` | 2000ms debounce |
| `enqueueJiraSync` | Job ID = `jira-sync-{siteId\|all}` | 500ms debounce |
| `enqueueStatusLogBackfill` | Job ID = `status-log-backfill-once` | none |

`closeQueues()` gracefully closes all initialized queue connections.

### Worker Setup (worker.ts)

**File**: `packages/backend/src/jobs/worker.ts`

`startWorkers()` creates a `Worker` instance for each queue with configured concurrency and rate limits:

| Worker | Concurrency | Rate Limit |
|--------|-------------|------------|
| scenario-recompute | 5 | 10 jobs/sec |
| csv-import | 2 | 5 jobs/min |
| view-refresh | 3 | 10 jobs/10s |
| drift-check | 2 | 5 jobs/10s |
| jira-sync | 2 | 3 jobs/min |
| status-log-backfill | 1 | none |

Each worker registers `completed`, `failed`, and `error` event handlers for structured logging.

`stopWorkers()` gracefully closes all running workers. `getWorkerStatus()` returns a boolean health map for each worker.

### Job Scheduling (scheduler.ts)

**File**: `packages/backend/src/jobs/scheduler.ts`

`setupScheduledJobs()` configures recurring jobs using BullMQ's repeatable jobs:

| Job | Cron Pattern | Frequency |
|-----|-------------|-----------|
| View refresh | `*/15 * * * *` | Every 15 minutes |
| Drift check | `*/30 * * * *` | Every 30 minutes |
| Jira sync | `*/5 * * * *` | Every 5 minutes |

On startup, `runPeriodMaintenance()` ensures planning periods exist from `currentYear - 1` through `currentYear + 2` by calling `periodService.seedPeriods()`.

`removeScheduledJobs()` removes all repeatable jobs from all three queues (used for cleanup).

### Barrel Export (index.ts)

**File**: `packages/backend/src/jobs/index.ts`

Re-exports all public symbols from `queue.ts`, `worker.ts`, and `scheduler.ts`, plus all processor functions (for testing).

### Processors

#### scenario-recompute.processor.ts

**File**: `packages/backend/src/jobs/processors/scenario-recompute.processor.ts`

Recalculates demand/capacity metrics for a single scenario.

**Steps**:
1. Verify the scenario still exists (skip if deleted).
2. Invalidate the existing cache via `scenarioCalculatorService.invalidateCache()`.
3. Force a fresh calculation with `scenarioCalculatorService.calculate(scenarioId, { skipCache: true, includeBreakdown: true })`.
4. Report progress at 10%, 20%, 90%, 100%.

**Returns**: `{ success, calculatedAt, summary }` with total demand/capacity hours, overall gap, shortages, and overallocations.

**Trigger sources**: `allocation_change`, `priority_change`, `manual`, `scope_change`.

#### csv-import.processor.ts

**File**: `packages/backend/src/jobs/processors/csv-import.processor.ts`

Bulk-imports initiatives from pre-parsed CSV rows.

**Steps**:
1. Process rows in batches of 50.
2. For each batch:
   - Batch-validate referenced IDs (business owner, product owner, portfolio area, product leader) in parallel.
   - Validate each row against `CsvRowSchema`.
   - Verify all foreign key references exist.
   - Collect valid rows for `prisma.initiative.createMany()`.
3. If batch insert fails, fall back to individual `prisma.initiative.create()` calls.
4. Report progress per batch (percentage).

**Returns**: `{ success, failed, errors[], processedAt }`.

#### view-refresh.processor.ts

**File**: `packages/backend/src/jobs/processors/view-refresh.processor.ts`

Pre-computes materialized view summaries and stores them in Redis for fast dashboard queries.

**View types**: `demand_summary`, `capacity_summary`, `all`.

**Per-scenario views**:
- **Demand summary**: Aggregates scope item skill demands weighted by period distributions. Stores per-period totals, skill breakdowns, and initiative counts.
- **Capacity summary**: Aggregates allocations by period using `AllocationPeriod` junction, weighted by employee skill proficiency (`proficiency / 5`).

**Global views** (when no specific scenario IDs are specified):
- **Global demand**: Sums all scope item demands for initiatives in RESOURCING or IN_EXECUTION status.
- **Global capacity**: Sums all employee capacity using `hoursPerWeek * 13` (quarterly) weighted by skill proficiency.

Cache TTL: 3600 seconds (1 hour). Keys: `view:demand:{scenarioId}`, `view:capacity:{scenarioId}`, `view:demand:global`, `view:capacity:global`.

#### drift-check.processor.ts

**File**: `packages/backend/src/jobs/processors/drift-check.processor.ts`

Detects when actual plan state drifts from locked baselines.

**Logic**:
- If `scenarioId` is provided: Check a single scenario via `driftAlertService.checkDrift(scenarioId)`.
- Otherwise: Check all locked baselines via `driftAlertService.checkAllBaselines()`.

**Returns**: `{ alertsCreated, scenariosChecked }`.

**Trigger sources**: `scheduled`, `manual`, `capacity_change`, `demand_change`.

#### jira-sync.processor.ts

**File**: `packages/backend/src/jobs/processors/jira-sync.processor.ts`

Synchronizes initiative data from Jira.

**Logic**:
1. If `fullResync` is requested, reset all `IntegrationSyncCursor` entries (optionally filtered by `siteId`).
2. If both `connectionId` and `siteId` are provided: Targeted sync -- iterate over selected projects in that site, calling `syncSiteProject()` per project.
3. Otherwise: Full sync via `syncAll(triggeredBy)`.

**Returns**: `{ synced, errors[] }`.

**Trigger sources**: `scheduled`, `manual`.

#### status-log-backfill.processor.ts

**File**: `packages/backend/src/jobs/processors/status-log-backfill.processor.ts`

One-time migration job that backfills `InitiativeStatusLog` from `AuditEvent` records, providing historical data for Mode B (empirical) forecasting.

**Steps**:
1. Count `AuditEvent` records where `entityType = 'Initiative'` and `action = 'status_transition'`.
2. Load existing `InitiativeStatusLog` entries to build a dedup set (`initiativeId:transitionedAt`).
3. Process events in batches (default 500) using cursor-based pagination:
   - Extract `fromStatus` and `toStatus` from the event payload.
   - Skip if missing data or already exists.
   - Batch insert via `createMany({ skipDuplicates: true })`.
   - Fall back to individual inserts if batch fails.
4. Report progress as percentage.

**Returns**: `{ processed, inserted, skipped, errors[], processedAt }`.

---

## Part 3: Plugins

**Source**: `packages/backend/src/plugins/`

### Auth Plugin (auth.plugin.ts)

**File**: `packages/backend/src/plugins/auth.plugin.ts`

Registered as a Fastify plugin (`fastify-plugin`). Requires `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` environment variables.

**JWT Verification**: Uses `jose` library's `createRemoteJWKSet` to fetch Auth0's JWKS from `https://{AUTH0_DOMAIN}/.well-known/jwks.json`. Tokens are verified with RS256 against the issuer and audience.

**Decorators provided**:

| Decorator | Signature | Purpose |
|-----------|-----------|---------|
| `authenticate` | `(request, reply) => Promise<void>` | Extracts Bearer token, verifies JWT, provisions local user via `findOrProvisionUser()`, populates `request.user` with `JwtPayload`. |
| `authorize` | `(roles: UserRole[]) => preHandler` | Role-based access control (legacy). Checks `request.user.role` against allowed roles. |
| `requirePermission` | `(permission: string) => preHandler` | Checks a single permission string against `request.user.permissions`. |
| `requireAnyPermission` | `(permissions: string[]) => preHandler` | Checks that at least one of the given permissions exists. |
| `requireSeat` | `(seatType: SeatType) => preHandler` | Entitlement check. Blocks access if user's seat type does not match. Records a RevOps telemetry event on blocked attempts for expansion signal tracking. |

**JwtPayload shape**:
```ts
{
  sub: string;        // local user id
  auth0Sub: string;   // Auth0 subject (e.g. auth0|abc123)
  email: string;
  role: UserRole;
  permissions: string[];
  seatType: SeatType;
}
```

**Permission resolution**: JWT claim permissions (`https://productfolio.local/permissions`) are merged with role-derived permissions from `permissionsForRole(role)`. This ensures local role changes take effect without updating Auth0.

**Role resolution**: If the Auth0 RBAC roles claim (`https://productfolio.local/roles`) is present, it overrides the local user role.

**Side effect**: After authentication, a fire-and-forget call to `auth0ManagementService.assignRoleToUser()` syncs the effective role back to Auth0 (non-blocking, errors swallowed).

### Feature Flag Plugin (feature-flag.plugin.ts)

**File**: `packages/backend/src/plugins/feature-flag.plugin.ts`

Registered as a Fastify plugin (`fastify-plugin`).

**Decorator provided**:

| Decorator | Signature | Purpose |
|-----------|-----------|---------|
| `requireFeature` | `(flagKey: string) => preHandler` | Route guard that checks if a feature flag is enabled via `isEnabled(flagKey)`. Throws `NotFoundError('Resource')` when disabled, making gated routes appear as if they do not exist. |

**Usage in routes**:
```ts
fastify.get('/some-endpoint', {
  preHandler: [fastify.authenticate, fastify.requireFeature('my_flag')],
}, handler);
```

**Active flags**: `token_planning_v1`, `flow_forecast_v1`, `forecast_mode_b`, `org_capacity_view`, `job_profiles`, `matrix_org_v1`, `triple_constraint_rollups_v1`.
