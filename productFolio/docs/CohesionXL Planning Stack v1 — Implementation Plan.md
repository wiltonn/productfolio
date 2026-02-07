# CohesionXL Planning Stack v1 — Implementation Plan

## Context

ProductFolio has a mature scenario-based planning system (Initiative → ScopeItem → Allocation → capacity/demand gap analysis). This plan adds three thin layers that **attach to existing entities via FKs and computed views**, without duplicating core domain concepts:

1. **Org Structure** — formalize OrgNode + OrgMembership (code exists, missing from schema.prisma) and add org-scoped capacity/demand views
2. **Job Profiles / Cost Bands** — reporting/budget lens on existing Employee data
3. **Flow Forecasting v1** — Monte Carlo simulation using existing scope estimates (Mode A) and empirical cycle times (Mode B)

All new functionality is gated behind feature flags (new lightweight DB-backed system).

---

## Key Discovery: OrgNode/OrgMembership Already Implemented

The org-tree routes, services, schemas, and frontend admin page already exist and work at runtime (deployed via `db:push`), but `OrgNode`, `OrgMembership`, and related enums are **not in `schema.prisma`**. Step 1 formalizes them via migration.

---

## Team Structure (5 Agents)

| Role | Name | Scope |
|------|------|-------|
| Architect | `architect` | Schema changes, migration strategy, integration map |
| Backend | `backend-dev` | Services, routes, Zod schemas, Fastify plugins |
| Forecasting | `forecaster` | Monte Carlo engine, Mode A/B, data quality |
| Frontend | `frontend-dev` | React pages, hooks, router, conditional nav |
| QA/Release | `qa-release` | Tests, rollout plan, definition-of-done |

All agents submit plans before coding (plan-approval mode).

---

## Prisma Schema Changes (Additive Only)

### Migration 1: Formalize existing OrgNode/OrgMembership/AuditEvent

Add to `packages/backend/prisma/schema.prisma` the models that already exist in the runtime DB but are missing from the schema file:

- `OrgNodeType` enum (ROOT, DIVISION, DEPARTMENT, TEAM, VIRTUAL)
- `OrgNode` model (id, name, code, type, parentId, path, depth, managerId, sortOrder, isActive, metadata)
- `OrgMembership` model (id, employeeId, orgNodeId, effectiveStart, effectiveEnd)
- `AuditEvent` model (id, actorId, entityType, entityId, action, payload)
- Add reverse relations to `Employee` model: `orgMemberships`, `managedOrgNodes`
- Add reverse relation to `User` model: `auditEvents`

Use `prisma migrate diff --from-schema-datamodel --to-url` to generate a migration that recognizes the existing tables.

### Migration 2: Feature flags

```prisma
model FeatureFlag {
  id          String   @id @default(uuid()) @db.Uuid
  key         String   @unique
  enabled     Boolean  @default(false)
  description String?  @db.Text
  metadata    Json?    @db.JsonB
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@map("feature_flags")
}
```

Seed 4 flags (all disabled): `org_capacity_view`, `job_profiles`, `flow_forecast_v1`, `forecast_mode_b`

### Migration 3: Job profiles + cost bands

```prisma
model JobProfile {
  id          String  @id @default(uuid()) @db.Uuid
  name        String  @unique
  level       String?
  band        String?
  description String? @db.Text
  isActive    Boolean @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  skills      JobProfileSkill[]
  costBand    CostBand?
  employees   Employee[]
  @@map("job_profiles")
}

model JobProfileSkill {
  id                  String @id @default(uuid()) @db.Uuid
  jobProfileId        String @db.Uuid
  skillName           String
  expectedProficiency Int    @default(3)  // 1-5
  createdAt           DateTime @default(now())
  jobProfile          JobProfile @relation(fields: [jobProfileId], references: [id], onDelete: Cascade)
  @@unique([jobProfileId, skillName])
  @@map("job_profile_skills")
}

model CostBand {
  id            String  @id @default(uuid()) @db.Uuid
  jobProfileId  String  @unique @db.Uuid
  annualCostMin Float?
  annualCostMax Float?
  hourlyRate    Float?
  currency      String  @default("USD") @db.VarChar(3)
  effectiveDate DateTime @default(now())
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  jobProfile    JobProfile @relation(fields: [jobProfileId], references: [id], onDelete: Cascade)
  @@map("cost_bands")
}
```

Add nullable FK to Employee: `jobProfileId String? @db.Uuid` + relation to JobProfile.

### Migration 4: Forecasting models

```prisma
enum ForecastMode {
  SCOPE_BASED
  EMPIRICAL
}

model ForecastRun {
  id               String       @id @default(uuid()) @db.Uuid
  mode             ForecastMode
  scenarioId       String?      @db.Uuid
  orgNodeId        String?      @db.Uuid
  initiativeIds    Json         @db.JsonB
  simulationCount  Int          @default(1000)
  confidenceLevels Json         @db.JsonB  // e.g. [50, 75, 85, 95]
  inputSnapshot    Json         @db.JsonB
  results          Json         @db.JsonB
  warnings         Json?        @db.JsonB
  dataQuality      Json?        @db.JsonB  // { score: 0-100, issues: string[] }
  computedAt       DateTime     @default(now())
  durationMs       Int?
  createdAt        DateTime     @default(now())
  @@index([scenarioId])
  @@index([mode])
  @@map("forecast_runs")
}

model InitiativeStatusLog {
  id             String           @id @default(uuid()) @db.Uuid
  initiativeId   String           @db.Uuid
  fromStatus     InitiativeStatus
  toStatus       InitiativeStatus
  transitionedAt DateTime         @default(now())
  actorId        String?          @db.Uuid
  initiative     Initiative @relation(fields: [initiativeId], references: [id], onDelete: Cascade)
  @@index([initiativeId])
  @@index([toStatus])
  @@map("initiative_status_logs")
}
```

Add reverse relation to Initiative: `statusLogs InitiativeStatusLog[]`

---

## Feature Flag System

**DB-backed with Redis cache** (follows existing `lib/redis.ts` patterns).

### Files
- `packages/backend/src/services/feature-flag.service.ts` — `isEnabled(key)`, `getFlag(key)`, `listFlags()`, `setFlag(key, enabled)`
- `packages/backend/src/plugins/feature-flag.plugin.ts` — Fastify decorator `requireFeature(flagKey)` that returns 404 when disabled
- `packages/backend/src/routes/feature-flags.ts` — Admin CRUD endpoints
- `packages/backend/src/schemas/feature-flags.schema.ts` — Zod schemas
- `packages/frontend/src/hooks/useFeatureFlags.ts` — `useFeatureFlag(key)` hook via React Query

### Cache strategy
- Redis key: `ff:{key}`, TTL: 60s
- `setFlag()` invalidates cache immediately
- `isEnabled()` checks Redis → DB fallback → warm cache

---

## New Backend Services & Routes

### Org Capacity (guarded by `org_capacity_view`)

**Extend existing services** (no new service file needed):
- `org-tree.service.ts`: Add `getEmployeesInSubtree(nodeId)` — combines `getDescendants()` with OrgMembership lookup
- `scenario-calculator.service.ts`: Add optional `orgNodeId` param to `calculate()` and `CalculatorOptions` type — filters allocations to employees in that org subtree

**New endpoints** added to existing `routes/org-tree.ts`:
- `GET /api/org/nodes/:id/capacity?scenarioId=X` — Org-scoped capacity/demand summary
- `GET /api/org/nodes/:id/employees` — Employees in subtree with allocation status

### Job Profiles (guarded by `job_profiles`)

**New files**:
- `packages/backend/src/services/job-profile.service.ts` — CRUD for JobProfile, JobProfileSkill, CostBand
- `packages/backend/src/routes/job-profiles.ts` — REST endpoints
- `packages/backend/src/schemas/job-profiles.schema.ts` — Zod validation

**Endpoints**:
- `GET/POST /api/job-profiles` — List/create
- `GET/PUT/DELETE /api/job-profiles/:id` — Read/update/delete (with skills + cost band)
- `PUT /api/employees/:id/job-profile` — Assign profile to employee (extends `routes/resources.ts`)
- `GET /api/budget/scenario/:id` — Budget report aggregating CostBand × allocation hours

### Initiative Status Log

**New file**: `packages/backend/src/services/initiative-status-log.service.ts`

**Integration**: Hook into `initiatives.service.ts` status transitions to log to InitiativeStatusLog after each successful transition.

**Endpoint**: `GET /api/initiatives/:id/status-history` — added to existing `routes/initiatives.ts`

**Backfill script**: One-time BullMQ job to reconstruct InitiativeStatusLog from existing AuditEvent records.

### Flow Forecasting (guarded by `flow_forecast_v1`)

**New files**:
- `packages/backend/src/services/forecast.service.ts` — Monte Carlo engine + Mode A/B implementations
- `packages/backend/src/routes/forecast.ts` — Forecast endpoints
- `packages/backend/src/schemas/forecast.schema.ts` — Zod schemas

**Forecast Service design**:

**Core Monte Carlo engine** (pure functions, no DB):
- `lognormalSample(p50, p90)` — sample from lognormal given two percentile estimates
- `runSimulation(N, sampleFn)` — run N iterations, collect results
- `computePercentiles(results, levels)` — compute P50/P75/P85/P95

**Mode A — Scope-Based** (`runScopeBasedForecast()`):
1. For each initiative's ScopeItems: sample total effort from lognormal(estimateP50, estimateP90)
2. Distribute across periods using ScopeItemPeriodDistribution weights
3. Get per-period capacity from scenario calculator (filtered by org if provided)
4. Run N=1000 simulations: each samples scope independently, walks periods to compute when demand is fulfilled
5. Output: per-initiative completion probability at each period boundary (CDF)

**Mode B — Empirical** (`runEmpiricalForecast()`):
1. Query InitiativeStatusLog for completed initiatives → compute cycle time distribution (RESOURCING→COMPLETE elapsed days)
2. If < 10 data points → return explicit low-confidence warning
3. For in-progress initiatives: compute elapsed time, sample remaining from cycle time distribution
4. Run N=1000 simulations → per-initiative forecasted completion at P50/P75/P85/P95

**Data quality assessment** (`assessDataQuality()`):
- Checks: estimateP50/P90 coverage, period distribution completeness, historical completion count
- Returns: `{ score: 0-100, issues: string[] }`

**Endpoints** (all guarded by `flow_forecast_v1`; Mode B additionally requires `forecast_mode_b`):
- `POST /api/forecast/scope-based` — Run Mode A
- `POST /api/forecast/empirical` — Run Mode B
- `GET /api/forecast/runs` — List past runs (paginated)
- `GET /api/forecast/runs/:id` — Get specific run
- `GET /api/forecast/data-quality?scenarioId=X` — Data quality assessment

---

## Frontend Changes

### New Hooks
- `packages/frontend/src/hooks/useFeatureFlags.ts` — `useFeatureFlag(key)` via `GET /api/feature-flags`
- `packages/frontend/src/hooks/useJobProfiles.ts` — CRUD hooks
- `packages/frontend/src/hooks/useOrgCapacity.ts` — Org capacity data
- `packages/frontend/src/hooks/useForecast.ts` — Forecast run/results

### New Pages (lazy-loaded, feature-flag guarded)

**`packages/frontend/src/pages/FeatureFlagsAdmin.tsx`** — route: `/admin/feature-flags`
- Simple toggle table for flags (ADMIN only)
- Pattern follows existing `PortfolioAreas.tsx`

**`packages/frontend/src/pages/OrgCapacity.tsx`** — route: `/org-capacity`
- Left panel: Org tree selector (reuse existing `OrgTreeAdmin.tsx` tree component)
- Right panel: Capacity/demand heatmap (skills × periods) for selected org node
- Scenario selector dropdown
- Gap analysis summary
- Guarded by `org_capacity_view` flag

**`packages/frontend/src/pages/JobProfilesAdmin.tsx`** — route: `/admin/job-profiles`
- Table with CRUD, expandable skill rows, cost band editing
- Assign-to-employee modal
- Guarded by `job_profiles` flag

**`packages/frontend/src/pages/FlowForecast.tsx`** — route: `/forecast`
- Tab-based Mode A (Scope-Based) / Mode B (Empirical) selector
- Simulation controls (count, confidence levels)
- Results: probability distribution table, data quality panel with warnings
- Past runs history
- Guarded by `flow_forecast_v1` flag

### Router & Nav Updates
- `packages/frontend/src/router.tsx` — Add 4 new lazy-loaded routes following existing `ErrorBoundary > LazyPage` pattern
- `packages/frontend/src/components/Layout.tsx` — Conditionally show nav items based on feature flags

---

## Task List (25 Tasks with Dependencies)

### Phase 1: Foundation (Architect)

| # | Task | Files | Blocks |
|---|------|-------|--------|
| 1 | Formalize OrgNode/OrgMembership/AuditEvent in schema.prisma + migration | `prisma/schema.prisma` | 2,3,4,9 |
| 2 | Add FeatureFlag model + migration + seed | `prisma/schema.prisma` | 6 |
| 3 | Add JobProfile/JobProfileSkill/CostBand + Employee.jobProfileId | `prisma/schema.prisma` | 7 |
| 4 | Add ForecastRun + InitiativeStatusLog + ForecastMode enum | `prisma/schema.prisma` | 11,13 |
| 5 | Validate all migrations + run prisma generate + integration map | `prisma/schema.prisma` | All backend tasks |

### Phase 2: Backend Core (Backend Dev)

| # | Task | Files | Blocks |
|---|------|-------|--------|
| 6 | Feature flag service + plugin + admin route | `services/feature-flag.service.ts`, `plugins/feature-flag.plugin.ts`, `routes/feature-flags.ts`, `schemas/feature-flags.schema.ts`, `index.ts` | 7,8,9,10,17,18 |
| 7 | Job profile service + routes | `services/job-profile.service.ts`, `routes/job-profiles.ts`, `schemas/job-profiles.schema.ts`, `index.ts` | 8,10,20 |
| 8 | Employee job-profile assignment endpoint | `routes/resources.ts` (extend existing) | 10 |
| 9 | Org capacity: extend org-tree.service + scenario-calculator with orgNodeId filter | `services/org-tree.service.ts`, `services/scenario-calculator.service.ts`, `types/index.ts`, `routes/org-tree.ts` | 21 |
| 10 | Budget report service | `services/budget-report.service.ts`, `routes/job-profiles.ts` (extend) | — |
| 11 | Initiative status log service + hook into initiatives.service transitions | `services/initiative-status-log.service.ts`, `services/initiatives.service.ts`, `routes/initiatives.ts` | 12,15 |
| 12 | Backfill InitiativeStatusLog from AuditEvent (BullMQ job) | `jobs/processors/status-log-backfill.processor.ts` | 15 |

### Phase 3: Forecasting (Forecaster)

| # | Task | Files | Blocks |
|---|------|-------|--------|
| 13 | Monte Carlo engine core (pure functions + unit tests) | `services/forecast.service.ts` (engine portion), `tests/forecast-engine.test.ts` | 14,15 |
| 14 | Mode A: Scope-based forecast implementation | `services/forecast.service.ts` | 16,17 |
| 15 | Mode B: Empirical forecast implementation | `services/forecast.service.ts` | 16,17 |
| 16 | Data quality assessment | `services/forecast.service.ts` | 17 |
| 17 | Forecast routes + Zod schemas | `routes/forecast.ts`, `schemas/forecast.schema.ts`, `index.ts` | 22 |

### Phase 4: Frontend (Frontend Dev)

| # | Task | Files | Blocks |
|---|------|-------|--------|
| 18 | Feature flags hook + conditional nav in Layout | `hooks/useFeatureFlags.ts`, `components/Layout.tsx` | 19,20,21,22 |
| 19 | Feature Flags Admin page | `pages/FeatureFlagsAdmin.tsx`, `router.tsx` | — |
| 20 | Job Profiles Admin page | `pages/JobProfilesAdmin.tsx`, `hooks/useJobProfiles.ts`, `router.tsx` | — |
| 21 | Org Capacity page | `pages/OrgCapacity.tsx`, `hooks/useOrgCapacity.ts`, `router.tsx` | — |
| 22 | Flow Forecast page | `pages/FlowForecast.tsx`, `hooks/useForecast.ts`, `router.tsx` | — |

### Phase 5: QA & Release (QA/Release)

| # | Task | Files | Blocks |
|---|------|-------|--------|
| 23 | Backend tests: feature flags, job profiles, org capacity | `tests/feature-flags.test.ts`, `tests/job-profiles.test.ts`, `tests/org-capacity.test.ts` | 24 |
| 24 | Integration test: forecast pipeline (Mode A + B end-to-end) | `tests/forecast.test.ts` | 25 |
| 25 | Rollout plan + flag activation sequence + perf benchmarks | Docs only | — |

### Dependency Graph

```
Tasks 1-4 (schema) → Task 5 (validate)
                  ↓
Task 2 → Task 6 (FF service) → Tasks 7,9,17,18
Task 3 → Task 7 (job profiles) → Tasks 8,10,20
Task 4 → Task 11 (status log) → Task 12 (backfill) → Task 15
Task 4 → Task 13 (MC core) → Tasks 14,15 → Task 16 → Task 17 → Task 22
Task 6 → Task 18 (FE flags) → Tasks 19,20,21,22
Task 9 → Task 21 (FE org capacity)
Tasks 7,8,9,10,11,14,15,17 → Task 23 (tests) → Task 24 → Task 25
```

---

## File Ownership Boundaries (Merge Conflict Prevention)

| File | Exclusive Owner | Notes |
|------|----------------|-------|
| `prisma/schema.prisma` | Architect | All schema changes serialized through Tasks 1-5 |
| `services/scenario-calculator.service.ts` | Backend | Only adds optional `orgNodeId` param |
| `services/initiatives.service.ts` | Backend | Only adds status log call after transitions |
| `services/org-tree.service.ts` | Backend | Adds `getEmployeesInSubtree()` |
| `services/forecast.service.ts` | Forecaster | New file, no conflicts |
| `routes/forecast.ts` | Forecaster | New file, no conflicts |
| `index.ts` (server) | Backend | Adds route registrations (coordinate timing) |
| `types/index.ts` | Backend | Adds new type interfaces |
| `router.tsx` | Frontend | Adds 4 routes (one coordinated commit) |
| `components/Layout.tsx` | Frontend | Adds conditional nav items |

---

## Rollout Strategy

Feature flag activation sequence (each independently toggleable):

1. **`org_capacity_view`** — Lowest risk, extends existing calculator with a filter
2. **`job_profiles`** — Independent reporting lens, no impact on core allocation
3. **`flow_forecast_v1`** — Mode A scope-based forecast
4. **`forecast_mode_b`** — Mode B empirical (requires historical data from InitiativeStatusLog)

---

## Verification

1. **Schema**: `npx prisma validate && npx prisma generate` passes
2. **Migrations**: `npx prisma migrate dev` applies cleanly on fresh + existing DB
3. **Unit tests**: `npm run test` passes with new test files for all services
4. **Feature flags**: Toggle each flag off → verify 404 on guarded endpoints; toggle on → verify functionality
5. **Forecast accuracy**: Mode A with known inputs produces expected percentile ranges; Mode B with seeded historical data produces reasonable cycle time estimates
6. **Performance**: Forecast endpoint with N=1000 simulations completes in < 5 seconds
7. **No regression**: All existing tests pass unchanged
