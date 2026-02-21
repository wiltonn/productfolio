# Backend Routes & Schemas

Comprehensive API documentation for all ProductFolio backend endpoints. All routes are defined in `packages/backend/src/routes/` with Zod validation schemas in `packages/backend/src/schemas/`.

**Base URL**: `http://localhost:3000`

**Common patterns**:
- Pagination: `?page=1&limit=20` returns `{ data, page, limit, total, totalPages }`
- Authentication: All `/api/*` routes require a Bearer token (Auth0 JWT) unless noted
- Authorization: `requireSeat('decision')` enforces licensed seat; `requirePermission('...')` enforces RBAC
- Feature flags: `requireFeature('flag_key')` returns 404 when flag is disabled
- Errors: `NotFoundError`, `ValidationError`, `ConflictError`, `WorkflowError` from `lib/errors.ts`

---

## Table of Contents

1. [Core API](#1-core-api)
   - [Initiatives](#initiatives)
   - [Scenarios](#scenarios)
   - [Scoping](#scoping)
   - [Resources (Employees)](#resources-employees)
   - [Portfolio Areas](#portfolio-areas)
2. [Planning API](#2-planning-api)
   - [Planning Mode & Token CRUD](#planning-mode--token-crud)
   - [Skill Pools](#skill-pools)
3. [Organization API](#3-organization-api)
   - [Org Tree](#org-tree)
   - [Org Memberships](#org-memberships)
   - [Org Capacity](#org-capacity)
   - [Employee Org Links (Matrix)](#employee-org-links-matrix)
4. [Auth API](#4-auth-api)
   - [Auth](#auth)
   - [Auth0 Admin](#auth0-admin)
   - [Users](#users)
5. [Forecasting API](#5-forecasting-api)
6. [Rollups API](#6-rollups-api)
7. [Approval API](#7-approval-api)
   - [Approval Policies](#approval-policies)
   - [Approval Requests](#approval-requests)
   - [Delegations](#delegations)
   - [Audit Log](#audit-log)
   - [Authorities](#authorities)
   - [Entitlements](#entitlements)
8. [Admin API](#8-admin-api)
   - [Feature Flags](#feature-flags)
   - [Job Profiles](#job-profiles)
   - [Pricing](#pricing)
9. [Integration API](#9-integration-api)
10. [Jobs API](#10-jobs-api)
11. [Other](#11-other)
    - [Drift Alerts](#drift-alerts)
    - [Freeze Policies](#freeze-policies)
    - [Periods](#periods)
    - [Intake](#intake)
    - [Intake Requests](#intake-requests)

---

## 1. Core API

### Initiatives

**Route file**: `routes/initiatives.ts`
**Schema file**: `schemas/initiatives.schema.ts`
**Auth**: All routes require authentication. Mutations require `decision` seat.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/initiatives` | Auth | List initiatives with filters and pagination |
| GET | `/api/initiatives/allocation-hours` | Auth | Batch fetch allocated hours per initiative for current/next quarters |
| GET | `/api/initiatives/allocation-hours-by-type` | Auth | Batch fetch actual vs proposed allocation hours by type |
| GET | `/api/initiatives/export` | Auth | Export initiatives to CSV (returns `text/csv`) |
| GET | `/api/initiatives/:id` | Auth | Get a single initiative by ID |
| GET | `/api/initiatives/:id/allocations` | Auth | List allocations for an initiative across all scenarios |
| GET | `/api/initiatives/:id/status-history` | Auth | Get full status transition history |
| POST | `/api/initiatives` | Decision seat | Create a new initiative |
| PUT | `/api/initiatives/:id` | Decision seat | Update an initiative |
| DELETE | `/api/initiatives/:id` | Decision seat | Delete an initiative |
| POST | `/api/initiatives/:id/status` | Decision seat | Transition initiative status |
| PATCH | `/api/initiatives/bulk` | Decision seat | Bulk update initiatives (customFields) |
| POST | `/api/initiatives/bulk-delete` | Decision seat | Bulk delete initiatives |
| DELETE | `/api/initiatives/bulk` | Decision seat | Bulk delete initiatives (alternative) |
| POST | `/api/initiatives/import` | Decision seat | Import initiatives from CSV (async for >100 rows) |

**List Filters** (`InitiativeFiltersSchema`):

| Param | Type | Description |
|-------|------|-------------|
| `status` | `InitiativeStatus` enum | PROPOSED, SCOPING, RESOURCING, IN_EXECUTION, ON_HOLD, COMPLETE, CANCELLED |
| `origin` | `InitiativeOrigin` enum | Filter by initiative origin |
| `businessOwnerId` | UUID | Filter by business owner |
| `productOwnerId` | UUID | Filter by product owner |
| `portfolioAreaId` | UUID | Filter by portfolio area |
| `orgNodeId` | UUID | Filter by org node |
| `targetQuarter` | string | e.g. "2026-Q1" |
| `deliveryHealth` | `DeliveryHealth` enum | Filter by delivery health |
| `search` | string (max 255) | Full-text search |
| `page` | int (default 1) | Page number |
| `limit` | int (default 20, max 100) | Items per page |

**Create Initiative** (`CreateInitiativeSchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string (1-255) | Yes | Initiative title |
| `description` | string (max 4000) | No | Description |
| `businessOwnerId` | UUID | Yes | Business owner reference |
| `productOwnerId` | UUID | Yes | Product owner reference |
| `portfolioAreaId` | UUID | No | Portfolio area reference |
| `productLeaderId` | UUID | No | Product leader reference |
| `status` | InitiativeStatus | No | Default: PROPOSED |
| `targetQuarter` | string (YYYY-QN) | No | Target quarter |
| `deliveryHealth` | DeliveryHealth | No | Delivery health indicator |
| `customFields` | JSON object | No | Flexible custom fields |
| `domainComplexity` | DomainComplexity | No | Default: MEDIUM |
| `orgNodeId` | UUID | No | Associated org node |

**Status Transitions**: PROPOSED -> SCOPING -> RESOURCING -> IN_EXECUTION -> COMPLETE. Any status can go to ON_HOLD or CANCELLED. ON_HOLD can return to any active state.

**Allocation Hours Query** (`InitiativeAllocationHoursQuerySchema`):

| Param | Type | Required |
|-------|------|----------|
| `initiativeIds` | string (comma-separated UUIDs) | Yes |
| `currentQuarterStart` | date | Yes |
| `currentQuarterEnd` | date | Yes |
| `nextQuarterStart` | date | Yes |
| `nextQuarterEnd` | date | Yes |

---

### Scenarios

**Route file**: `routes/scenarios.ts`
**Schema file**: `schemas/scenarios.schema.ts`, `schemas/baseline.schema.ts`, `schemas/calculator.schema.ts`
**Auth**: All routes require authentication. Mutations require `scenario:write` permission + `decision` seat.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/scenarios` | Auth | List scenarios (filterable by periodIds, orgNodeId) |
| GET | `/api/scenarios/compare` | Auth | Compare multiple scenarios |
| GET | `/api/scenarios/:id` | Auth | Get single scenario |
| POST | `/api/scenarios` | scenario:write + decision | Create scenario |
| PUT | `/api/scenarios/:id` | scenario:write + decision | Update scenario |
| DELETE | `/api/scenarios/:id` | scenario:write + decision | Delete scenario |
| PUT | `/api/scenarios/:id/status` | scenario:write + decision | Transition status (DRAFT/REVIEW/APPROVED/LOCKED) |
| PUT | `/api/scenarios/:id/primary` | scenario:write + decision | Set as primary for its quarter |
| POST | `/api/scenarios/:id/clone` | scenario:write + decision | Clone scenario to target quarter |
| PUT | `/api/scenarios/:id/priorities` | scenario:write + decision | Update priority rankings |
| GET | `/api/scenarios/:id/allocations` | Auth | List allocations for scenario |
| GET | `/api/scenarios/:id/initiatives/:initiativeId/allocations` | Auth | List allocations for initiative within scenario |
| POST | `/api/scenarios/:id/allocations` | scenario:write + decision | Create allocation |
| PUT | `/api/allocations/:id` | scenario:write + decision | Update allocation |
| DELETE | `/api/allocations/:id` | scenario:write + decision | Delete allocation |
| GET | `/api/scenarios/:id/capacity-demand` | Auth | Calculate capacity vs demand (via PlanningService) |
| GET | `/api/scenarios/:id/calculator` | Auth | Calculate demand vs capacity with caching |
| POST | `/api/scenarios/:id/calculator/invalidate` | scenario:write + decision | Invalidate calculator cache |
| POST | `/api/scenarios/:id/recompute-ramp` | scenario:write + decision | Recompute ramp modifiers for all allocations |
| POST | `/api/scenarios/:id/auto-allocate` | scenario:write + decision | Preview auto-allocations (no side effects) |
| POST | `/api/scenarios/:id/auto-allocate/apply` | scenario:write + decision | Apply auto-allocations |
| GET | `/api/scenarios/:id/snapshot` | Auth | Get baseline snapshot |
| GET | `/api/scenarios/:id/delta` | Auth | Baseline vs live delta |
| GET | `/api/scenarios/:id/revision-delta` | Auth | Revision vs baseline delta |
| POST | `/api/scenarios/:id/revision` | scenario:write + decision | Create revision from locked baseline |
| PUT | `/api/scenarios/:id/reconcile` | scenario:write + decision | Mark revision as reconciled |

**Create Scenario** (`createScenarioSchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string (1-255) | Yes | Scenario name |
| `periodId` | UUID | Yes | Associated period |
| `orgNodeId` | UUID | No | Scoped to org node |
| `assumptions` | JSON object | No | Planning assumptions |
| `priorityRankings` | array of `{ initiativeId, rank }` | No | Priority rankings |
| `scenarioType` | BASELINE / REVISION / WHAT_IF | No | Default: WHAT_IF |

**Create Allocation** (`createAllocationSchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `employeeId` | UUID | Yes | Employee reference |
| `initiativeId` | UUID | No | Initiative reference (null for run/support) |
| `allocationType` | PROJECT / RUN / SUPPORT | No | Default: PROJECT |
| `startDate` | date | Yes | Allocation start |
| `endDate` | date | Yes | Allocation end (must be >= startDate) |
| `percentage` | number (0-100) | No | Default: 100 |

**Clone Scenario** (`cloneScenarioSchema`):

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `name` | string (1-255) | Yes | -- |
| `targetPeriodId` | UUID | Yes | -- |
| `includeProjectAllocations` | boolean | No | false |
| `includeRunSupportAllocations` | boolean | No | true |
| `includePriorityRankings` | boolean | No | true |

**Create Revision** (`createRevisionSchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | CRITICAL / COMPLIANCE / PRODUCTION_OUTAGE / EXEC_DIRECTIVE | Yes | Reason for revision |
| `name` | string (1-255) | No | Revision name |
| `changeLog` | string (max 2000) | No | Change description |

---

### Scoping

**Route file**: `routes/scoping.ts`
**Schema file**: `schemas/scoping.schema.ts`
**Auth**: All routes require authentication. Mutations require `decision` seat.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/initiatives/:initiativeId/scope-items` | Auth | List scope items for an initiative (paginated) |
| GET | `/api/scope-items/:id` | Auth | Get a single scope item |
| POST | `/api/initiatives/:initiativeId/scope-items` | Decision seat | Create a scope item |
| PUT | `/api/scope-items/:id` | Decision seat | Update a scope item |
| DELETE | `/api/scope-items/:id` | Decision seat | Delete a scope item |
| POST | `/api/initiatives/:id/submit-approval` | Decision seat | Submit initiative for approval |
| POST | `/api/initiatives/:id/approve` | Decision seat | Approve an initiative |
| POST | `/api/initiatives/:id/reject` | Decision seat | Reject an initiative |
| GET | `/api/initiatives/:id/approval-history` | Auth | Get approval history |

**Create Scope Item** (`CreateScopeItemSchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string (min 1) | Yes | Scope item name |
| `description` | string | No | Description |
| `skillDemand` | `Record<string, number>` | No | e.g. `{ frontend: 2, backend: 3 }` |
| `estimateP50` | number (positive) | No | P50 estimate in hours |
| `estimateP90` | number (positive) | No | P90 estimate in hours |
| `periodDistributions` | array of `{ periodId: UUID, distribution: 0-1 }` | No | Work distribution across periods |

**Approve With Approver** (`ApproveWithApproverSchema`):

| Field | Type | Required |
|-------|------|----------|
| `approverId` | UUID | Yes |
| `notes` | string | No |

---

### Resources (Employees)

**Route file**: `routes/resources.ts`
**Schema file**: `schemas/resources.schema.ts`, `schemas/ramp.schema.ts`
**Auth**: All routes require authentication. Mutations require `decision` seat.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/employees` | Auth | List employees with filters and pagination |
| GET | `/api/employees/allocation-summaries` | Auth | Batch allocation summaries per employee |
| GET | `/api/employees/pto-hours` | Auth | Batch PTO hours per employee per quarter |
| GET | `/api/employees/:id` | Auth | Get single employee |
| POST | `/api/employees` | Decision seat | Create employee |
| PUT | `/api/employees/:id` | Decision seat | Update employee |
| DELETE | `/api/employees/:id` | Decision seat | Delete employee |
| GET | `/api/employees/:id/allocations` | Auth | Get allocations across scenarios |
| GET | `/api/employees/:id/skills` | Auth | Get employee skills |
| POST | `/api/employees/:id/skills` | Decision seat | Add skill |
| PUT | `/api/employees/:id/skills/:skillId` | Decision seat | Update skill proficiency |
| DELETE | `/api/employees/:id/skills/:skillId` | Decision seat | Remove skill |
| GET | `/api/employees/:id/domains` | Auth | Get employee domains |
| POST | `/api/employees/:id/domains` | Decision seat | Add domain |
| PUT | `/api/employees/:id/domains/:domainId` | Decision seat | Update domain proficiency |
| DELETE | `/api/employees/:id/domains/:domainId` | Decision seat | Remove domain |
| GET | `/api/employees/:id/capacity` | Auth | Get capacity calendar |
| PUT | `/api/employees/:id/capacity` | Decision seat | Update capacity entries |
| GET | `/api/employees/:id/availability` | Auth | Calculate availability for date range |
| GET | `/api/employees/:id/domain-familiarity` | Auth | List familiarity records for employee |
| PUT | `/api/employees/:id/domain-familiarity/:initiativeId` | Decision seat | Upsert domain familiarity |
| GET | `/api/initiatives/:id/domain-familiarity` | Auth | List employee familiarities for initiative |
| PUT | `/api/employees/:id/job-profile` | Decision seat + `job_profiles` flag | Assign or remove job profile |

**Create Employee** (`CreateEmployeeSchema`):

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `name` | string (1-255) | Yes | -- |
| `role` | string (1-255) | Yes | -- |
| `managerId` | UUID | No | null |
| `employmentType` | FULL_TIME / PART_TIME / CONTRACTOR / INTERN | No | FULL_TIME |
| `hoursPerWeek` | number (positive) | No | 40 |
| `activeStart` | date | No | -- |
| `activeEnd` | date | No | null |

**Employee Filters** (`EmployeeFiltersSchema`):

| Param | Type | Description |
|-------|------|-------------|
| `role` | string | Filter by role |
| `employmentType` | enum | FULL_TIME / PART_TIME / CONTRACTOR / INTERN |
| `managerId` | UUID | Filter by manager |
| `search` | string | Name search |
| `page` | int (default 1) | Page number |
| `limit` | int (default 20, max 100) | Items per page |

**Update Capacity** (`UpdateCapacitySchema`): Array of `{ periodId: UUID, hoursAvailable: number }`.

**Upsert Familiarity** (`upsertFamiliaritySchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `familiarityLevel` | number (0-1) | Yes | Familiarity score |
| `source` | MANUAL / ALLOCATION_HISTORY / IMPORT | No | Default: MANUAL |

---

### Portfolio Areas

**Route file**: `routes/portfolio-areas.ts`
**Schema file**: `schemas/portfolio-areas.schema.ts`
**Auth**: All routes require authentication.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/portfolio-areas` | Auth | List portfolio areas (paginated, searchable) |
| GET | `/api/portfolio-areas/:id` | Auth | Get single portfolio area |
| POST | `/api/portfolio-areas` | Auth | Create portfolio area |
| PUT | `/api/portfolio-areas/:id` | Auth | Update portfolio area |
| DELETE | `/api/portfolio-areas/:id` | Auth | Delete portfolio area (fails if referenced) |

**Create/Update** (`CreatePortfolioAreaSchema`):

| Field | Type | Required |
|-------|------|----------|
| `name` | string (1-255) | Yes |

**Filters** (`PortfolioAreaFiltersSchema`):

| Param | Type | Default |
|-------|------|---------|
| `search` | string (max 255) | -- |
| `page` | int | 1 |
| `limit` | int (max 100) | 50 |

---

## 2. Planning API

### Planning Mode & Token CRUD

**Route file**: `routes/planning.ts`
**Schema files**: `schemas/planning.schema.ts`, `schemas/token-supply.schema.ts`, `schemas/token-demand.schema.ts`
**Auth**: All routes require authentication. Token endpoints gated by `token_planning_v1` feature flag.
**Mutations require**: `planning:write` permission + `decision` seat.

| Method | Path | Auth | Flag | Description |
|--------|------|------|------|-------------|
| PUT | `/api/scenarios/:id/planning-mode` | planning:write + decision | -- | Toggle planning mode (LEGACY/TOKEN) |
| GET | `/api/scenarios/:id/token-supply` | Auth | `token_planning_v1` | List token supplies for scenario |
| PUT | `/api/scenarios/:id/token-supply` | planning:write + decision | `token_planning_v1` | Upsert token supply |
| DELETE | `/api/scenarios/:id/token-supply/:skillPoolId` | planning:write + decision | `token_planning_v1` | Remove token supply |
| GET | `/api/scenarios/:id/token-demand` | Auth | `token_planning_v1` | List token demands for scenario |
| PUT | `/api/scenarios/:id/token-demand` | planning:write + decision | `token_planning_v1` | Upsert single token demand |
| POST | `/api/scenarios/:id/token-demand/bulk` | planning:write + decision | `token_planning_v1` | Bulk upsert token demands (max 500) |
| DELETE | `/api/scenarios/:id/token-demand/:demandId` | planning:write + decision | `token_planning_v1` | Remove token demand |
| GET | `/api/scenarios/:id/token-ledger` | Auth | `token_planning_v1` | Get aggregated supply vs demand ledger (TOKEN mode only) |

**Update Planning Mode** (`updatePlanningModeSchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | LEGACY / TOKEN | Yes | PlanningMode enum |

**Upsert Token Supply** (`upsertTokenSupplySchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `skillPoolId` | UUID | Yes | Skill pool reference |
| `tokens` | number (>= 0) | Yes | Token amount |
| `notes` | string (max 1000) | No | Notes |

**Upsert Token Demand** (`upsertTokenDemandSchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `initiativeId` | UUID | Yes | Initiative reference |
| `skillPoolId` | UUID | Yes | Skill pool reference |
| `tokensP50` | number (>= 0) | Yes | P50 token estimate |
| `tokensP90` | number (>= 0) | No | P90 token estimate |
| `notes` | string (max 1000) | No | Notes |

---

### Skill Pools

**Route file**: `routes/skill-pools.ts`
**Schema file**: `schemas/skill-pool.schema.ts`
**Auth**: All routes require authentication + `token_planning_v1` feature flag. Mutations require `job-profile:write` permission + `decision` seat.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/skill-pools` | Auth + flag | List skill pools |
| GET | `/api/skill-pools/:id` | Auth + flag | Get single skill pool |
| POST | `/api/skill-pools` | job-profile:write + decision | Create skill pool |
| PUT | `/api/skill-pools/:id` | job-profile:write + decision | Update skill pool |
| DELETE | `/api/skill-pools/:id` | job-profile:write + decision | Soft delete skill pool |

**Create Skill Pool** (`createSkillPoolSchema`):

| Field | Type | Required |
|-------|------|----------|
| `name` | string (1-100) | Yes |
| `description` | string (max 1000) | No |

**Update Skill Pool** (`updateSkillPoolSchema`):

| Field | Type | Required |
|-------|------|----------|
| `name` | string (1-100) | No |
| `description` | string (max 1000) | No |
| `isActive` | boolean | No |

**List Filters** (`skillPoolFiltersSchema`):

| Param | Type | Description |
|-------|------|-------------|
| `includeInactive` | "true"/"false" | Include inactive pools |

---

## 3. Organization API

### Org Tree

**Route file**: `routes/org-tree.ts`
**Schema file**: `schemas/org-tree.schema.ts`
**Auth**: All routes require authentication. Mutations require `org:write` permission + `decision` seat.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/org/portfolio-areas` | Auth | List org nodes flagged as portfolio areas |
| GET | `/api/org/tree` | Auth | Get full org tree (nested) |
| GET | `/api/org/nodes` | Auth | List nodes (flat, with filters) |
| GET | `/api/org/nodes/:id` | Auth | Get single node |
| POST | `/api/org/nodes` | org:write + decision | Create node |
| PUT | `/api/org/nodes/:id` | org:write + decision | Update node |
| POST | `/api/org/nodes/:id/move` | org:write + decision | Move node to new parent |
| DELETE | `/api/org/nodes/:id` | org:write + decision | Soft-delete node |
| GET | `/api/org/nodes/:id/ancestors` | Auth | Get ancestry chain |
| GET | `/api/org/nodes/:id/descendants` | Auth | Get subtree |
| GET | `/api/org/coverage` | org:write | Coverage report |

**Create Node** (`CreateNodeSchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string (1-255) | Yes | Node name |
| `code` | string (1-50) | Yes | Short code |
| `type` | OrgNodeType enum | Yes | ROOT, DIVISION, DEPARTMENT, TEAM, VIRTUAL, PRODUCT, PLATFORM, FUNCTIONAL, CHAPTER |
| `parentId` | UUID | No | Parent node |
| `managerId` | UUID | No | Manager user |
| `sortOrder` | int (>= 0) | No | Default: 0 |
| `isPortfolioArea` | boolean | No | Default: false |
| `metadata` | JSON object | No | Flexible metadata |

**Node List Filters** (`NodeListFiltersSchema`):

| Param | Type | Description |
|-------|------|-------------|
| `parentId` | UUID | Filter by parent |
| `type` | OrgNodeType | Filter by type |
| `isActive` | boolean | Active status |
| `isPortfolioArea` | boolean | Portfolio area flag |
| `search` | string | Name search |

---

### Org Memberships

**Route file**: `routes/org-memberships.ts`
**Schema file**: `schemas/org-tree.schema.ts` (shared)
**Auth**: All routes require authentication. Mutations require `org:write` + `decision` seat.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/org/memberships` | Auth | List memberships with filters |
| POST | `/api/org/memberships` | org:write + decision | Assign employee to node |
| POST | `/api/org/memberships/bulk` | org:write + decision | Bulk assign employees |
| DELETE | `/api/org/memberships/:id` | org:write + decision | End membership |
| GET | `/api/org/memberships/employee/:id` | Auth | Employee membership history |

**Assign Membership** (`AssignMembershipSchema`):

| Field | Type | Required |
|-------|------|----------|
| `employeeId` | UUID | Yes |
| `orgNodeId` | UUID | Yes |
| `effectiveStart` | date | No |

**Bulk Assign** (`BulkAssignSchema`):

| Field | Type | Required |
|-------|------|----------|
| `employeeIds` | UUID[] (min 1) | Yes |
| `orgNodeId` | UUID | Yes |
| `effectiveStart` | date | No |

**Membership Filters** (`MembershipListFiltersSchema`):

| Param | Type | Default |
|-------|------|---------|
| `orgNodeId` | UUID | -- |
| `employeeId` | UUID | -- |
| `activeOnly` | boolean | true |
| `page` | int | 1 |
| `limit` | int (max 100) | 50 |

---

### Org Capacity

**Route file**: `routes/org-capacity.ts`
**Auth**: All routes require authentication + `org_capacity_view` feature flag check (manual).

| Method | Path | Auth | Flag | Description |
|--------|------|------|------|-------------|
| GET | `/api/org/nodes/:id/employees` | Auth | `org_capacity_view` | Get employees in subtree with skills, job profiles, allocations |
| GET | `/api/org/nodes/:id/capacity` | Auth | `org_capacity_view` | Get org-scoped capacity/demand for a scenario |

**Capacity Query Params**:

| Param | Type | Required |
|-------|------|----------|
| `scenarioId` | UUID | Yes |

---

### Employee Org Links (Matrix)

**Route file**: `routes/employee-org-links.ts`
**Schema file**: `schemas/employee-org-link.schema.ts`
**Auth**: All routes require authentication + `matrix_org_v1` feature flag. Mutations require `org:write` permission.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/org/links` | Auth + flag | List links with filters |
| GET | `/api/org/links/employee/:employeeId` | Auth + flag | Get active links for employee |
| GET | `/api/org/links/employee/:employeeId/home` | Auth + flag | Get PRIMARY_REPORTING link |
| GET | `/api/org/links/employee/:employeeId/history` | Auth + flag | Get full link history |
| GET | `/api/org/links/employee/:employeeId/capacity` | Auth + flag | Get capacity-consuming links |
| GET | `/api/org/nodes/:orgNodeId/links` | Auth + flag | Get node members (optionally by type) |
| POST | `/api/org/links` | org:write + flag | Create link |
| PATCH | `/api/org/links/:linkId` | org:write + flag | Update link |
| DELETE | `/api/org/links/:linkId` | org:write + flag | End link (soft delete) |
| POST | `/api/org/links/reassign-primary` | org:write + flag | Reassign PRIMARY_REPORTING |
| POST | `/api/org/links/migrate-from-memberships` | org:write + flag | Migrate from OrgMemberships |

**Create Link** (`CreateEmployeeOrgLinkSchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `employeeId` | UUID | Yes | Employee reference |
| `orgNodeId` | UUID | Yes | Org node reference |
| `relationshipType` | enum | Yes | PRIMARY_REPORTING, DELIVERY_ASSIGNMENT, FUNCTIONAL_ALIGNMENT, CAPABILITY_POOL, TEMPORARY_ROTATION |
| `allocationPct` | number (0-100) | Conditional | Required for capacity-consuming types |
| `consumeCapacity` | boolean | No | Override default capacity behavior |
| `startDate` | date | No | Link start date |
| `endDate` | date | No | Link end date |

**Link Filters** (`LinkListFiltersSchema`):

| Param | Type | Default |
|-------|------|---------|
| `employeeId` | UUID | -- |
| `orgNodeId` | UUID | -- |
| `relationshipType` | enum | -- |
| `activeOnly` | boolean | true |
| `consumeCapacityOnly` | boolean | -- |
| `page` | int | 1 |
| `limit` | int (max 200) | 50 |

---

## 4. Auth API

### Auth

**Route file**: `routes/auth.ts`
**Auth**: Requires Bearer token.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/auth/me` | Auth | Get current user with permissions, seat type, tier |

Returns `{ user: { id, email, name, role, permissions, seatType, licensed, tier } }`.

---

### Auth0 Admin

**Route file**: `routes/auth0-admin.ts`
**Auth**: All routes require authentication + ADMIN role.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/admin/auth0/sync-roles` | ADMIN | Sync local roles to Auth0 |
| POST | `/api/admin/auth0/sync-user/:userId` | ADMIN | Sync single user's role to Auth0 |
| POST | `/api/admin/auth0/sync-all-users` | ADMIN | Bulk sync all active users |

---

### Users

**Route file**: `routes/users.ts`
**Schema file**: `schemas/user.schema.ts`
**Auth**: All routes require authentication. Detail/mutations require `authority:admin` + `decision` seat.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users` | Auth | List users (paginated, searchable, role filter) |
| GET | `/api/users/:id` | authority:admin | Get single user detail |
| POST | `/api/users` | authority:admin + decision | Create user |
| PUT | `/api/users/:id` | authority:admin + decision | Update user (name/role/isActive) |
| DELETE | `/api/users/:id` | authority:admin + decision | Soft-delete user (sets isActive=false) |

**Self-protection**: Cannot change own role or deactivate own account.

**Create User** (`CreateUserSchema`):

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `email` | email | Yes | -- |
| `name` | string (min 1) | Yes | -- |
| `role` | UserRole enum | No | VIEWER |

**User List Filters** (`UserListQuerySchema`):

| Param | Type | Default |
|-------|------|---------|
| `role` | UserRole | -- |
| `search` | string | -- |
| `includeInactive` | boolean | false (admin only) |
| `page` | int | 1 |
| `limit` | int (max 100) | 50 |

---

## 5. Forecasting API

**Route file**: `routes/forecast.ts`
**Schema file**: `schemas/forecast.schema.ts`
**Auth**: All routes require authentication + `flow_forecast_v1` feature flag. Mode B also requires `forecast_mode_b`. Forecast runs require `decision` seat.

| Method | Path | Auth | Flag(s) | Description |
|--------|------|------|---------|-------------|
| POST | `/api/forecast/scope-based` | Decision seat | `flow_forecast_v1` | Run Mode A (scope-based) Monte Carlo forecast |
| POST | `/api/forecast/empirical` | Decision seat | `flow_forecast_v1` + `forecast_mode_b` | Run Mode B (empirical) forecast |
| GET | `/api/forecast/runs` | Auth | `flow_forecast_v1` | List past forecast runs (paginated) |
| GET | `/api/forecast/runs/:id` | Auth | `flow_forecast_v1` | Get single forecast run |
| GET | `/api/forecast/data-quality` | Auth | `flow_forecast_v1` | Assess data quality for forecasting |

**Scope-Based Forecast** (`ScopeBasedForecastSchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scenarioId` | UUID | Yes | Scenario to forecast |
| `initiativeIds` | UUID[] (min 1) | Yes | Initiatives to include |
| `simulationCount` | int (100-10000) | No | MC simulation count |
| `confidenceLevels` | number[] (1-99) | No | Percentiles to compute |
| `orgNodeId` | UUID | No | Scope to org node |

**Empirical Forecast** (`EmpiricalForecastSchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `initiativeIds` | UUID[] (min 1) | Yes | Initiatives to forecast |
| `simulationCount` | int (100-10000) | No | MC simulation count |
| `confidenceLevels` | number[] (1-99) | No | Percentiles to compute |

**Data Quality Query** (`DataQualityQuerySchema`):

| Param | Type | Required |
|-------|------|----------|
| `scenarioId` | UUID | No |
| `initiativeIds` | string (comma-separated) | No |

**Forecast Runs Query** (`ForecastRunsQuerySchema`):

| Param | Type | Default |
|-------|------|---------|
| `page` | int | 1 |
| `limit` | int (max 100) | 20 |
| `scenarioId` | UUID | -- |
| `mode` | SCOPE_BASED / EMPIRICAL | -- |

---

## 6. Rollups API

**Route file**: `routes/rollups.ts`
**Schema file**: `schemas/rollup.schema.ts`
**Auth**: All routes require authentication + `triple_constraint_rollups_v1` feature flag.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/scenarios/:id/rollups/portfolio-areas` | Auth + flag | Rollup by portfolio area |
| GET | `/api/scenarios/:id/rollups/org-nodes` | Auth + flag | Rollup by org node |
| GET | `/api/scenarios/:id/rollups/business-owners` | Auth + flag | Rollup by business owner |

**Params**: `:id` is a scenario UUID.

Returns triple constraint rollups with time, scope, and budget dimensions.

---

## 7. Approval API

### Approval Policies

**Route file**: `routes/approvals.ts`
**Schema file**: `schemas/approval.schema.ts`
**Auth**: All routes require authentication. Policy mutations require `approval:write` + `decision` seat.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/org/nodes/:id/policies` | Auth | List policies for an org node |
| POST | `/api/org/nodes/:id/policies` | approval:write + decision | Create policy |
| PUT | `/api/approval-policies/:id` | approval:write + decision | Update policy |
| DELETE | `/api/approval-policies/:id` | approval:write + decision | Deactivate policy |
| POST | `/api/approval-policies/preview` | Decision seat | Preview approval chain |

**Create Policy** (`CreatePolicySchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scope` | RESOURCE_ALLOCATION / INITIATIVE / SCENARIO | Yes | Policy scope |
| `level` | int (>= 1) | Yes | Approval level |
| `ruleType` | enum | Yes | NODE_MANAGER, SPECIFIC_PERSON, ROLE_BASED, ANCESTOR_MANAGER, COMMITTEE, FALLBACK_ADMIN |
| `ruleConfig` | JSON object | No | Rule-specific configuration |
| `crossBuStrategy` | COMMON_ANCESTOR / ALL_BRANCHES | No | Cross-BU approval strategy |
| `enforcement` | BLOCKING / ADVISORY | No | Enforcement mode |

### Approval Requests

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/approval-requests` | Auth | List approval requests |
| GET | `/api/approval-requests/inbox` | Auth | Approver's pending queue |
| GET | `/api/approval-requests/my` | Auth | Requester's own requests |
| GET | `/api/approval-requests/:id` | Auth | Get single request |
| POST | `/api/approval-requests` | Decision seat | Create approval request |
| POST | `/api/approval-requests/:id/decide` | Decision seat | Submit decision (APPROVED/REJECTED) |
| POST | `/api/approval-requests/:id/cancel` | Decision seat | Cancel request |

**Create Request** (`CreateRequestSchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scope` | RESOURCE_ALLOCATION / INITIATIVE / SCENARIO | Yes | Request scope |
| `subjectType` | allocation / initiative / scenario | Yes | Subject type |
| `subjectId` | UUID | Yes | Subject reference |
| `snapshotContext` | JSON object | No | Context snapshot |
| `expiresAt` | date | No | Expiration date |

**Decision** (`DecisionSchema`):

| Field | Type | Required |
|-------|------|----------|
| `decision` | APPROVED / REJECTED | Yes |
| `comments` | string (max 2000) | No |

### Delegations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/delegations` | Auth | List active delegations for current user |
| POST | `/api/delegations` | Decision seat | Create delegation |
| DELETE | `/api/delegations/:id` | Decision seat | Revoke delegation |

**Create Delegation** (`CreateDelegationSchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `delegatorId` | UUID | Yes | Person delegating |
| `delegateId` | UUID | Yes | Person receiving delegation |
| `scope` | enum | No | Limit to specific scope |
| `orgNodeId` | UUID | No | Limit to specific org node |
| `effectiveStart` | date | Yes | Delegation start |
| `effectiveEnd` | date | Yes | Delegation end |
| `reason` | string (max 1000) | No | Reason for delegation |

Non-admins can only create delegations for themselves.

### Audit Log

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/audit` | approval:write | Query audit events (paginated) |

**Audit Query** (`AuditQuerySchema`):

| Param | Type | Default |
|-------|------|---------|
| `entityType` | string | -- |
| `entityId` | UUID | -- |
| `actorId` | UUID | -- |
| `action` | string | -- |
| `startDate` | date | -- |
| `endDate` | date | -- |
| `page` | int | 1 |
| `limit` | int (max 100) | 50 |

---

### Authorities

**Route file**: `routes/authorities.ts`
**Schema file**: `schemas/authority.schema.ts`
**Auth**: All routes require authentication. Admin routes require `authority:admin`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/authorities` | Auth | List all authorities |
| GET | `/api/authorities/role-mapping` | Auth | Get role-to-permissions mapping |
| GET | `/api/authorities/drift` | authority:admin | Compare registry vs code (drift detection) |
| GET | `/api/authorities/user/:userId/effective` | authority:admin | Get effective permissions for a user |
| PUT | `/api/authorities/:code` | authority:admin + decision | Update authority description/deprecated |
| GET | `/api/authorities/audit-log` | authority:admin | Paginated authority audit log |

**Update Authority** (`UpdateAuthoritySchema`):

| Field | Type | Required |
|-------|------|----------|
| `description` | string (min 1) | No |
| `deprecated` | boolean | No |

---

### Entitlements

**Route file**: `routes/entitlements.ts`
**Schema file**: `schemas/entitlement.schema.ts`
**Auth**: All routes require authentication + `authority:admin`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/entitlements` | authority:admin | Licensed + observer user lists |
| GET | `/api/admin/entitlements/summary` | authority:admin | Counts + tier + seat limit |
| PUT | `/api/admin/entitlements/config` | authority:admin + decision | Update tier/seat limit |
| GET | `/api/admin/entitlements/export` | authority:admin | CSV export of licensed users |
| GET | `/api/admin/revops` | authority:admin | Usage summary + expansion signals |
| GET | `/api/admin/revops/events` | authority:admin | Paginated event log |

**Update Tenant Config** (`updateTenantConfigSchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tier` | starter / growth / enterprise | No | Subscription tier |
| `seatLimit` | int (>= 1) | No | Maximum licensed seats |

**RevOps Events Query** (`entitlementEventQuerySchema`):

| Param | Type | Default |
|-------|------|---------|
| `page` | int | 1 |
| `limit` | int (max 100) | 20 |
| `eventName` | string | -- |
| `userId` | UUID | -- |

---

## 8. Admin API

### Feature Flags

**Route file**: `routes/feature-flags.ts`
**Schema file**: `schemas/feature-flags.schema.ts`
**Auth**: All routes require authentication. Updates require `feature-flag:admin` + `decision` seat.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/feature-flags` | Auth | List all feature flags |
| GET | `/api/feature-flags/:key` | Auth | Get single flag by key |
| PUT | `/api/feature-flags/:key` | feature-flag:admin + decision | Update flag |

**Update Feature Flag** (`UpdateFeatureFlagSchema`):

| Field | Type | Required |
|-------|------|----------|
| `enabled` | boolean | No |
| `description` | string (max 1000) | No |
| `metadata` | JSON object | No |

**Known flags**: `token_planning_v1`, `flow_forecast_v1`, `forecast_mode_b`, `org_capacity_view`, `job_profiles`, `matrix_org_v1`, `triple_constraint_rollups_v1`

---

### Job Profiles

**Route file**: `routes/job-profiles.ts`
**Schema file**: `schemas/job-profiles.schema.ts`
**Auth**: All routes gated by `job_profiles` feature flag + authentication. Mutations require `job-profile:write` + `decision` seat.

| Method | Path | Auth | Flag | Description |
|--------|------|------|------|-------------|
| GET | `/api/job-profiles` | Auth | `job_profiles` | List job profiles (paginated) |
| GET | `/api/job-profiles/:id` | Auth | `job_profiles` | Get profile with skills and cost band |
| POST | `/api/job-profiles` | job-profile:write + decision | `job_profiles` | Create job profile |
| PUT | `/api/job-profiles/:id` | job-profile:write + decision | `job_profiles` | Update job profile |
| DELETE | `/api/job-profiles/:id` | job-profile:write + decision | `job_profiles` | Soft delete job profile |
| GET | `/api/budget/scenario/:id` | Auth | `job_profiles` | Budget report: CostBand x allocation hours |

**Create Job Profile** (`CreateJobProfileSchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string (1-255) | Yes | Profile name |
| `level` | string (max 100) | No | Level (e.g. Senior) |
| `band` | string (max 100) | No | Band (e.g. IC3) |
| `description` | string (max 5000) | No | Description |
| `isActive` | boolean | No | Default: true |
| `skills` | array | No | `[{ skillName, expectedProficiency: 1-5 }]` |
| `costBand` | object | No | `{ annualCostMin, annualCostMax, hourlyRate, currency, effectiveDate }` |

**Job Profile Filters** (`JobProfileFiltersSchema`):

| Param | Type | Default |
|-------|------|---------|
| `search` | string (max 255) | -- |
| `isActive` | "true"/"false" | -- |
| `page` | int | 1 |
| `limit` | int (max 100) | 20 |

---

### Pricing

**Route file**: `routes/pricing.ts`
**Auth**: No authentication required (public route).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/public/pricing` | None | Get pricing content |

---

## 9. Integration API

**Route file**: `routes/jira-integration.ts`
**Schema file**: `schemas/jira-integration.schema.ts`
**Auth**: Most routes require authentication + `jira:admin` permission. OAuth callback is unauthenticated.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/integrations/jira/health` | jira:admin | Jira integration health status |
| GET | `/api/integrations/jira/connect` | jira:admin | Get Atlassian authorization URL |
| GET | `/api/integrations/jira/callback` | **None** | OAuth callback (exchanges code for tokens) |
| GET | `/api/integrations/jira/connections` | jira:admin | List all Jira connections |
| DELETE | `/api/integrations/jira/connections/:connectionId` | jira:admin + decision | Delete a connection |
| GET | `/api/integrations/jira/connections/:connectionId/sites` | jira:admin | List sites for a connection |
| PUT | `/api/integrations/jira/connections/:connectionId/sites` | jira:admin + decision | Select sites for a connection |
| GET | `/api/integrations/jira/sites/:siteId/projects` | jira:admin | List projects for a site |
| PUT | `/api/integrations/jira/sites/:siteId/projects` | jira:admin + decision | Select projects for a site |
| POST | `/api/integrations/jira/sync` | jira:admin + decision | Trigger manual sync (BullMQ job) |
| GET | `/api/integrations/jira/sync/status` | jira:admin | Get sync status |
| GET | `/api/integrations/jira/sync/runs` | jira:admin | Get paginated sync run history |

**Select Sites** (`selectSitesSchema`):

| Field | Type | Required |
|-------|------|----------|
| `siteIds` | UUID[] (min 1) | Yes |

**Select Projects** (`selectProjectsSchema`):

| Field | Type | Required |
|-------|------|----------|
| `projects` | array of `{ projectId, projectKey, projectName }` (min 1) | Yes |

**Trigger Sync** (`triggerSyncSchema`):

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `connectionId` | UUID | No | -- |
| `siteId` | UUID | No | -- |
| `fullResync` | boolean | No | false |

**Sync Runs Query** (`syncRunsQuerySchema`):

| Param | Type | Default |
|-------|------|---------|
| `page` | int | 1 |
| `limit` | int (max 100) | 20 |
| `siteId` | UUID | -- |
| `status` | RUNNING / COMPLETED / FAILED / PARTIAL | -- |

---

## 10. Jobs API

**Route file**: `routes/jobs.ts`
**Auth**: No explicit authentication (routes are registered without auth hooks).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/jobs/status` | -- | Get overall job queue counts |
| GET | `/api/jobs/:queueName/:jobId` | -- | Get status of a specific job |
| GET | `/api/jobs/:queueName/recent` | -- | Get recent jobs by status |
| DELETE | `/api/jobs/:queueName/:jobId` | -- | Remove a job from queue |
| POST | `/api/jobs/backfill-status-logs` | -- | Trigger status log backfill job |

**Queue names**: `scenario-recompute`, `csv-import`, `view-refresh`, `status-log-backfill`

**Recent Jobs Query**:

| Param | Type | Default |
|-------|------|---------|
| `status` | completed / failed / active / waiting / delayed | completed |
| `limit` | int | 10 |

**Backfill Body**:

| Field | Type | Required |
|-------|------|----------|
| `batchSize` | number | No |

---

## 11. Other

### Drift Alerts

**Route file**: `routes/drift.ts`
**Schema file**: `schemas/baseline.schema.ts`
**Auth**: All routes require authentication. Mutations require `drift:write` + `decision` seat.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/drift/alerts` | Auth | List drift alerts (filterable by scenarioId, periodId, status) |
| PUT | `/api/drift/alerts/acknowledge` | drift:write + decision | Acknowledge alerts |
| PUT | `/api/drift/alerts/resolve` | drift:write + decision | Resolve alerts |
| POST | `/api/drift/check` | drift:write + decision | Manual drift check (single scenario or all) |
| GET | `/api/drift/thresholds` | Auth | Get drift thresholds |
| PUT | `/api/drift/thresholds` | drift:write + decision | Update drift thresholds |

**Drift Thresholds** (`driftThresholdSchema`):

| Field | Type | Default |
|-------|------|---------|
| `capacityThresholdPct` | number (0-100) | 5 |
| `demandThresholdPct` | number (0-100) | 10 |

**Acknowledge/Resolve Alerts**: `{ alertIds: UUID[] }` (min 1)

**Drift Check**: `{ scenarioId?: UUID }` -- if omitted, enqueues check for all baselines.

---

### Freeze Policies

**Route file**: `routes/freeze-policy.ts`
**Schema file**: `schemas/baseline.schema.ts`
**Auth**: All routes require authentication. Mutations require `drift:write` + `decision` seat.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/freeze-policies/:periodId` | Auth | Get freeze policy for a period |
| PUT | `/api/freeze-policies/:periodId` | drift:write + decision | Create or update freeze policy |
| DELETE | `/api/freeze-policies/:periodId` | drift:write + decision | Remove freeze policy |
| GET | `/api/freeze-policies/:periodId/status` | Auth | Get freeze status (isFrozen boolean) |

**Update Freeze Policy** (`updateFreezePolicySchema`):

| Field | Type | Required |
|-------|------|----------|
| `changeFreezeDate` | date | Yes |

---

### Periods

**Route file**: `routes/periods.ts`
**Schema file**: `schemas/periods.schema.ts`
**Auth**: All routes require authentication.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/periods/adjacent-quarters` | Auth | Get last, current, next quarter |
| GET | `/api/periods` | Auth | List periods with filters |
| GET | `/api/periods/:id` | Auth | Get period with parent/children |
| GET | `/api/periods/:id/children` | Auth | Get child periods |
| GET | `/api/periods/label/:label` | Auth | Get period by label |
| POST | `/api/periods/seed` | Auth | Seed periods for year range |

**Period Filters** (`periodFiltersSchema`):

| Param | Type | Default |
|-------|------|---------|
| `type` | WEEK / MONTH / QUARTER | -- |
| `year` | int (2000-2100) | -- |
| `startDate` | date | -- |
| `endDate` | date | -- |
| `page` | int | 1 |
| `limit` | int (max 200) | 50 |

**Seed Periods** (`seedPeriodsSchema`):

| Field | Type | Required |
|-------|------|----------|
| `startYear` | int (2000-2100) | Yes |
| `endYear` | int (2000-2100) | Yes |

---

### Intake

**Route file**: `routes/intake.ts`
**Schema file**: `schemas/intake.schema.ts`
**Auth**: All routes require authentication.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/intake` | Auth | List intake items (from Jira sync) |
| GET | `/api/intake/stats` | Auth | Get intake dashboard statistics |
| GET | `/api/intake/:id` | Auth | Get single intake item |

**Intake List Filters** (`intakeListSchema`):

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int (max 100) | 20 | Items per page |
| `search` | string | -- | Text search |
| `statusCategory` | string | -- | Jira status category |
| `priorityName` | string | -- | Jira priority name |
| `siteId` | UUID | -- | Jira site filter |
| `projectKey` | string | -- | Jira project key |
| `linked` | "true"/"false" | -- | Linked to initiative |
| `itemStatus` | ACTIVE / ARCHIVED / DELETED | ACTIVE | Item status |
| `sortBy` | jiraUpdatedAt / jiraCreatedAt / summary / priorityName | jiraUpdatedAt | Sort field |
| `sortOrder` | asc / desc | desc | Sort direction |

---

### Intake Requests

**Route file**: `routes/intake-requests.ts`
**Schema file**: `schemas/intake-request.schema.ts`
**Auth**: All routes require authentication. Mutations require `decision` seat.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/intake-requests` | Auth | List intake requests with filters |
| GET | `/api/intake-requests/stats` | Auth | Get intake request statistics |
| GET | `/api/intake-requests/pipeline` | Auth | Pipeline statistics (period-aware) |
| GET | `/api/intake-requests/:id` | Auth | Get single intake request |
| POST | `/api/intake-requests` | Decision seat | Create intake request |
| PUT | `/api/intake-requests/:id` | Decision seat | Update intake request |
| DELETE | `/api/intake-requests/:id` | Decision seat | Delete intake request (DRAFT/CLOSED only) |
| POST | `/api/intake-requests/:id/status` | Decision seat | Transition status |
| POST | `/api/intake-requests/:id/convert` | Decision seat | Convert approved request to initiative |

**Status Flow**: DRAFT -> TRIAGE -> ASSESSED -> APPROVED -> CONVERTED -> CLOSED. CLOSED can return to DRAFT.

**Create Intake Request** (`CreateIntakeRequestSchema`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string (1-500) | Yes | Request title |
| `description` | string (max 10000) | No | Description |
| `requestedById` | UUID | No | Requester |
| `sponsorId` | UUID | No | Sponsor |
| `portfolioAreaId` | UUID | No | Portfolio area |
| `targetQuarter` | string (YYYY-QN) | No | Target quarter |
| `valueScore` | int (1-10) | No | Value score |
| `effortEstimate` | XS / S / M / L / XL | No | T-shirt sizing |
| `urgency` | LOW / MEDIUM / HIGH / CRITICAL | No | Urgency level |
| `customerName` | string (max 255) | No | Customer name |
| `tags` | string[] | No | Tags |
| `strategicThemes` | string[] | No | Strategic themes |
| `sourceType` | JIRA | No | Source type |
| `intakeItemId` | UUID | No | Link to intake item |
| `orgNodeId` | UUID | No | Org node |
| `decisionNotes` | string (max 10000) | No | Decision notes |

**Status Transition** (`IntakeRequestStatusTransitionSchema`):

| Field | Type | Required |
|-------|------|----------|
| `newStatus` | IntakeRequestStatus enum | Yes |
| `closedReason` | REJECTED / DEFERRED / DUPLICATE / OUT_OF_SCOPE | No |
| `decisionNotes` | string (max 10000) | No |

**Convert to Initiative** (`ConvertToInitiativeSchema`):

| Field | Type | Required |
|-------|------|----------|
| `title` | string (1-255) | No |
| `description` | string (max 4000) | No |
| `businessOwnerId` | UUID | Yes |
| `productOwnerId` | UUID | Yes |
| `portfolioAreaId` | UUID | No |
| `productLeaderId` | UUID | No |
| `targetQuarter` | string (YYYY-QN) | No |

**Intake Request Filters** (`IntakeRequestFiltersSchema`):

| Param | Type | Default |
|-------|------|---------|
| `status` | IntakeRequestStatus | -- |
| `portfolioAreaId` | UUID | -- |
| `orgNodeId` | UUID | -- |
| `targetQuarter` | string | -- |
| `requestedById` | UUID | -- |
| `sponsorId` | UUID | -- |
| `sourceType` | JIRA | -- |
| `search` | string (max 255) | -- |
| `page` | int | 1 |
| `limit` | int (max 100) | 20 |

---

## Appendix: Health Check

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Server health + worker status |
