# Backend Services Documentation

This document provides a comprehensive reference for all backend services in the ProductFolio application. Services are organized by domain and follow a consistent pattern: class-based or functional exports with singleton instances.

**Location**: `packages/backend/src/services/`

**Total Services**: 41

---

## Table of Contents

### 1. Core Domain Services
1. [Initiatives](#1-initiatives)
2. [Scenarios](#2-scenarios)
3. [Scoping](#3-scoping)
4. [Resources (Employees)](#4-resources-employees)

### 2. Planning & Capacity Services
5. [Allocation](#5-allocation)
6. [Capacity](#6-capacity)
7. [Scenario Calculator](#7-scenario-calculator)
8. [Skill Pool](#8-skill-pool)
9. [Token Supply](#9-token-supply)
10. [Token Demand](#10-token-demand)

### 3. Organization Services
11. [Org Tree](#11-org-tree)
12. [Org Membership](#12-org-membership)
13. [Employee Org Links (Matrix)](#13-employee-org-links-matrix)
14. [Org Node Helpers](#14-org-node-helpers)

### 4. Auth & Access Services
15. [Auth](#15-auth)
16. [Auth0 Management](#16-auth0-management)
17. [Authority](#17-authority)
18. [Entitlement](#18-entitlement)

### 5. Forecasting Services
19. [Forecast](#19-forecast)
20. [Initiative Status Log](#20-initiative-status-log)

### 6. Administration Services
21. [Feature Flags](#21-feature-flags)
22. [Job Profiles](#22-job-profiles)
23. [Portfolio Areas](#23-portfolio-areas)
24. [Budget Report](#24-budget-report)
25. [Rollups (Triple Constraint)](#25-rollups-triple-constraint)

### 7. Integration Services
26. [Jira API](#26-jira-api)
27. [Jira Auth](#27-jira-auth)
28. [Jira Sync](#28-jira-sync)

### 8. Workflow Services
29. [Approval Policy](#29-approval-policy)
30. [Approval Workflow](#30-approval-workflow)
31. [Approval Enforcement](#31-approval-enforcement)
32. [Audit](#32-audit)

### 9. Other Services
33. [Baseline](#33-baseline)
34. [Delta Engine](#34-delta-engine)
35. [Drift Alert](#35-drift-alert)
36. [Freeze Policy](#36-freeze-policy)
37. [Period](#37-period)
38. [Ramp](#38-ramp)
39. [Intake](#39-intake)
40. [Intake Planning](#40-intake-planning)
41. [Intake Request](#41-intake-request)

---

## 1. Core Domain Services

### 1. Initiatives

**File**: `initiatives.service.ts`

**Purpose**: Manages initiative lifecycle, CRUD operations, status transitions, bulk operations, and CSV import/export.

**Key Functions**:
- `list(filters, pagination)` - List initiatives with filtering (status, owner, portfolio, search) and pagination
- `getById(id)` - Fetch single initiative with all related data (owners, scope items, approvals)
- `create(data)` - Create new initiative with owner validation
- `update(id, data)` - Update initiative with ownership/portfolio validation
- `deleteInitiative(id)` - Delete initiative (cascade handled by Prisma)
- `transitionStatus(id, newStatus, actorId)` - Transition initiative status with approval enforcement and workflow validation
- `bulkUpdate(data)` - Update multiple initiatives at once
- `bulkDelete(data)` - Delete multiple initiatives at once
- `importFromCsv(csvData)` - Import initiatives from CSV with validation
- `exportToCsv(filters)` - Export initiatives to CSV format

**Dependencies**:
- Prisma client
- Error classes (NotFoundError, ValidationError, WorkflowError)
- Schemas (CreateInitiativeInput, UpdateInitiativeInput, InitiativeFiltersInput)
- initiative-status-log.service.ts (for logging transitions)
- approval-enforcement.service.ts (for approval checks)

**Key Features**:
- Status workflow validation (PROPOSED → SCOPING → RESOURCING → IN_EXECUTION → COMPLETE)
- Approval enforcement integration
- OrgNode validation (must be active portfolio area)
- Status log integration for cycle-time analytics
- Bulk operations with error tracking
- CSV import/export with field escaping

**Export**: Functional module

---

### 2. Scenarios

**File**: `scenarios.service.ts`

**Purpose**: Manages planning scenarios, status workflow, cloning, revision creation, and priority rankings.

**Class**: `ScenariosService`

**Key Methods**:
- `list(pagination, periodIds?, orgNodeId?)` - List scenarios with period filtering
- `getById(id)` - Fetch scenario with metadata and allocation count
- `create(data)` - Create new scenario (validates period type is QUARTER)
- `update(id, data)` - Update scenario with workflow guards (blocks changes when LOCKED/APPROVED)
- `delete(id)` - Delete scenario (blocks deletion of LOCKED scenarios)
- `transitionStatus(id, newStatus, userRole, actorId?)` - Status transition with approval enforcement
- `setPrimary(scenarioId)` - Mark scenario as primary for its period
- `cloneScenario(sourceId, data)` - Clone scenario to a different quarter with date offset
- `updatePriorities(id, data)` - Update initiative priority rankings
- `createRevision(baselineScenarioId, data, userRole)` - Create revision from locked baseline
- `markReconciled(scenarioId)` - Mark revision as reconciled

**Dependencies**:
- scenario-calculator.service.ts (cache invalidation)
- allocation.service.ts (computing allocation periods)
- baseline.service.ts (snapshot capture)
- freeze-policy.service.ts (revision validation)
- approval-enforcement.service.ts
- BullMQ jobs (enqueueScenarioRecompute, enqueueViewRefresh)

**Key Features**:
- Status transitions: DRAFT → REVIEW → APPROVED → LOCKED
- Auto-set as primary when LOCKED (if no other primary exists)
- Freeze policy validation for revisions
- Background job enqueueing on priority/allocation changes
- Planning mode support (LEGACY/TOKEN)
- Scenario cloning with allocation date offset and type filtering
- Revision creation from locked baselines

**Export**: `scenariosService` singleton

---

### 3. Scoping

**File**: `scoping.service.ts`

**Purpose**: Manages initiative scope items, approval workflow, and demand estimation.

**Class**: `ScopingService`

**Key Methods**:
- `listByInitiative(initiativeId, pagination)` - List scope items with pagination
- `getById(id)` - Fetch single scope item
- `create(initiativeId, data)` - Create scope item with period distributions
- `update(id, data)` - Update scope item (replaces period distributions)
- `delete(id)` - Delete scope item
- `submitForApproval(initiativeId, notes?)` - Advance initiative from PROPOSED to SCOPING
- `approve(initiativeId, approverId, notes?)` - Approve scope and advance to RESOURCING (creates Approval record)
- `reject(initiativeId, notes?)` - Reject and return to PROPOSED
- `getApprovalHistory(initiativeId)` - Fetch approval version history

**Dependencies**:
- Prisma client
- Error classes
- Schemas (CreateScopeItemInput, UpdateScopeItemInput)
- BullMQ jobs (enqueueDriftCheck for demand changes)

**Key Features**:
- Scope item period distributions (0-1 weights per period)
- P50/P90 lognormal estimates
- Skill demand JSON (e.g., `{frontend: 2, backend: 3}`)
- Version-tracked approval workflow
- Drift alert triggers on demand changes

**Export**: `scopingService` singleton

---

### 4. Resources (Employees)

**File**: `resources.service.ts`

**Purpose**: Manages employees, skills, and domain expertise. Functional module (not a class).

**Key Functions**:

**Employees**:
- `listEmployees(filters, pagination)` - List employees with manager/skill/domain counts
- `getEmployeeById(id)` - Fetch employee with manager, direct reports, skills, domains
- `createEmployee(data)` - Create employee with manager validation
- `updateEmployee(id, data)` - Update employee (prevents circular manager references)
- `deleteEmployee(id)` - Delete employee

**Skills**:
- `getEmployeeSkills(employeeId)` - List skills for an employee
- `addSkill(employeeId, data)` - Add skill with proficiency (1-5)
- `updateSkill(employeeId, skillId, data)` - Update skill proficiency
- `removeSkill(employeeId, skillId)` - Remove skill

**Domains**:
- `getEmployeeDomains(employeeId)` - List domains for an employee
- `addDomain(employeeId, data)` - Add domain with proficiency (1-5)
- `updateDomain(employeeId, domainId, data)` - Update domain proficiency
- `removeDomain(employeeId, domainId)` - Remove domain

**Dependencies**:
- Prisma client
- Error classes (NotFoundError, ValidationError, ConflictError)
- Schemas (CreateEmployeeInput, UpdateEmployeeInput, CreateSkillInput, etc.)

**Key Features**:
- Manager hierarchy (managerId FK)
- Unique constraint on employee_id + skill_name
- Unique constraint on employee_id + domain_name
- Employment type (FULL_TIME, PART_TIME, CONTRACTOR)
- Active date ranges (activeStart, activeEnd)

**Export**: Functional module

---

## 2. Planning & Capacity Services

### 5. Allocation

**File**: `allocation.service.ts`

**Purpose**: Manages resource allocations within scenarios, including auto-allocation and capacity-demand analysis.

**Class**: `AllocationService`

**Key Methods**:
- `listByScenario(scenarioId)` - List allocations for a scenario
- `listByInitiative(scenarioId, initiativeId)` - List allocations for a specific initiative
- `listByEmployee(employeeId)` - List all allocations for an employee
- `listByInitiativeAcrossScenarios(initiativeId, periodId?)` - List allocations across scenarios
- `listInitiativeAllocationHours(initiativeIds, currentQ, nextQ)` - Batch fetch hours per initiative
- `listInitiativeAllocationHoursByType(initiativeIds, currentQ, nextQ)` - Fetch actual vs proposed hours
- `listAllocationSummaries(employeeIds, currentQ, nextQ)` - Batch fetch summaries for employees
- `create(scenarioId, data)` - Create allocation with approval enforcement
- `update(id, data)` - Update allocation with validation
- `delete(id)` - Delete allocation
- `calculateCapacityDemand(scenarioId)` - Calculate skill-based capacity vs demand
- `compareScenarios(scenarioIds)` - Compare multiple scenarios
- `autoAllocate(scenarioId, options)` - Preview optimal allocations based on priority
- `applyAutoAllocate(scenarioId, proposedAllocations)` - Apply auto-allocations in transaction
- `computeAllocationPeriods(allocationId, startDate, endDate)` - Map allocation to period overlaps

**Dependencies**:
- Prisma client
- scenario-calculator.service.ts (cache invalidation)
- period.service.ts (date-to-period mapping)
- ramp.service.ts (ramp modifiers)
- approval-enforcement.service.ts
- BullMQ jobs

**Key Features**:
- Workflow guards: blocks edits on LOCKED scenarios and IN_EXECUTION/COMPLETE initiatives
- Quarter date range validation
- AllocationPeriod junction table for period overlap tracking
- Ramp modifier computation
- Auto-allocation algorithm: priority-based skill matching with capacity constraints
- Spillover model for demand carryover across periods
- Batch operations for performance

**Export**: `allocationService` singleton

---

### 6. Capacity

**File**: `capacity.service.ts`

**Purpose**: Manages employee capacity calendars and PTO tracking. Functional module.

**Key Functions**:
- `getCapacityCalendar(employeeId)` - Fetch capacity entries by period
- `updateCapacity(employeeId, entries)` - Upsert capacity entries (triggers drift check)
- `calculateAvailability(employeeId, startDate, endDate)` - Calculate availability per week period
- `batchGetPtoHours(employeeIds, currentQ, nextQ)` - Batch fetch PTO hours for quarters

**Key Types**:
- `AvailabilityPeriod` - Per-period breakdown of base/allocated/pto/available hours

**Dependencies**:
- Prisma client
- period.service.ts
- BullMQ jobs (enqueueDriftCheck)

**Key Features**:
- Period-based capacity tracking (usually WEEK type)
- PTO adjustments per period
- Drift alerts on capacity changes
- Batch operations for performance

**Export**: Functional module

---

### 7. Scenario Calculator

**File**: `scenario-calculator.service.ts`

**Purpose**: Computes capacity-demand analysis, gap analysis, and issue identification for scenarios.

**Class**: `ScenarioCalculatorService`

**Key Methods**:
- `calculate(scenarioId, options)` - Main entry point, returns full CalculatorResult
- `invalidateCache(scenarioId)` - Clear Redis cache for scenario

**Private Methods**:
- `calculateDemand()` - Aggregate demand by skill/period from scope items
- `calculateCapacity()` - Aggregate capacity by skill/period from allocations
- `calculateGapAnalysis()` - Compute gap between capacity and demand
- `identifyIssues()` - Find shortages, overallocations, skill mismatches
- `identifyShortages()` - Skill shortage detection with severity levels
- `identifyOverallocations()` - Employee >100% allocation detection
- `identifySkillMismatches()` - Allocations without required skills
- `calculateSummary()` - Overall statistics

**Dependencies**:
- Prisma client
- Redis (caching layer with 15-min TTL)
- org-tree.service.ts (for org node filtering)

**Key Features**:
- Redis caching with cache hit tracking
- Scenario assumptions support (proficiency weights, buffers, contractors, ramp)
- Breakdowns by initiative or employee (optional)
- AllocationPeriod-based hour calculations
- OrgNode filtering for subtree capacity
- Severity classification: low/medium/high/critical
- Ramp cost computation (hours lost to ramp-up)

**Export**: `scenarioCalculatorService` singleton

---

### 8. Skill Pool

**File**: `skill-pool.service.ts`

**Purpose**: Manages skill pools for token-based planning (Strangler Pattern).

**Class**: `SkillPoolService`

**Key Methods**:
- `list()` - List all skill pools
- `getById(id)` - Fetch single skill pool
- `create(data)` - Create skill pool with unique name validation
- `update(id, data)` - Update skill pool
- `delete(id)` - Delete skill pool (checks for references)

**Dependencies**:
- Prisma client
- Error classes

**Key Features**:
- Token flow planning (alternative to time-based)
- Feature flag gated: `token_planning_v1`
- Name uniqueness enforced

**Export**: `skillPoolService` singleton

---

### 9. Token Supply

**File**: `token-supply.service.ts`

**Purpose**: Manages token supply entries for skill pools in scenarios.

**Class**: `TokenSupplyService`

**Key Methods**:
- `listByScenario(scenarioId)` - List supply entries for scenario
- `upsertSupply(scenarioId, data)` - Batch upsert supply entries
- `deleteEntry(id)` - Delete single supply entry

**Dependencies**:
- Prisma client

**Key Features**:
- Scenario-specific token supply per skill pool per period
- Batch upsert for efficiency
- Token flow model integration

**Export**: `tokenSupplyService` singleton

---

### 10. Token Demand

**File**: `token-demand.service.ts`

**Purpose**: Manages token demand entries for initiatives and scenarios.

**Class**: `TokenDemandService`

**Key Methods**:
- `listByScenario(scenarioId)` - List demand entries for scenario
- `upsertDemand(scenarioId, data)` - Batch upsert demand entries
- `deleteEntry(id)` - Delete single demand entry
- `deriveDemandFromScope(scenarioId, initiativeIds?)` - Auto-derive demand from scope item hours

**Dependencies**:
- Prisma client
- Schemas

**Key Features**:
- Per-initiative, per-skill-pool demand tracking
- Auto-derivation from scope items using TokenCalibration rates
- P50/P90 token estimates

**Export**: `tokenDemandService` singleton

---

## 3. Organization Services

### 11. Org Tree

**File**: `org-tree.service.ts`

**Purpose**: Manages hierarchical organizational structure with path-based traversal.

**Key Functions**:
- `createNode(input, actorId?)` - Create org node (ROOT, BU, TEAM, PRODUCT_AREA, etc.)
- `updateNode(id, input, actorId?)` - Update node (blocks changes to active nodes with children)
- `deleteNode(id, actorId?)` - Soft-delete node (sets isActive=false)
- `getById(id)` - Fetch node with manager and children
- `getTree(rootId?)` - Build full tree structure
- `listNodes(filters)` - List nodes with filtering
- `moveNode(nodeId, newParentId, actorId?)` - Move node to new parent (updates paths)
- `getAncestors(nodeId)` - Get all ancestor nodes
- `getDescendants(nodeId)` - Get all descendant nodes
- `getEmployeesInSubtree(nodeId)` - Get all employee IDs in subtree (via OrgMembership)

**Key Types**:
- `OrgTreeNode` - Full node with children (recursive)
- `OrgNodeType` - ROOT, BU, DIVISION, TEAM, PRODUCT_AREA, CAPABILITY_CENTER, PRACTICE, DELIVERY_UNIT

**Dependencies**:
- Prisma client
- audit.service.ts (for logging)
- org-node.helpers.ts (parsePathToIds)

**Key Features**:
- Path-based hierarchy (e.g., `/root-id/parent-id/node-id/`)
- Depth tracking
- Manager assignment per node
- Portfolio area flag
- Sort order for sibling ordering
- Active/inactive lifecycle
- Metadata JSON field

**Export**: Functional module

---

### 12. Org Membership

**File**: `org-membership.service.ts`

**Purpose**: Manages employee memberships in org nodes (legacy, pre-matrix model).

**Key Functions**:
- `createMembership(data, actorId?)` - Add employee to org node with role
- `updateMembership(id, data, actorId?)` - Update membership
- `deleteMembership(id, actorId?)` - Remove membership
- `listByOrgNode(orgNodeId)` - List members of a node
- `listByEmployee(employeeId)` - List memberships for an employee
- `getActiveMembership(employeeId, effectiveDate?)` - Get active membership at a date

**Dependencies**:
- Prisma client
- audit.service.ts

**Key Features**:
- Role assignment (MEMBER, LEAD, MANAGER)
- Effective date ranges
- Audit trail

**Export**: Functional module

---

### 13. Employee Org Links (Matrix)

**File**: `employee-org-link.service.ts`

**Purpose**: Manages matrix org relationships (5 relationship types).

**Class**: `EmployeeOrgLinkService`

**Key Methods**:
- `list(filters)` - List links with filtering
- `getById(id)` - Fetch single link
- `create(data)` - Create link with PRIMARY_REPORTING validation
- `update(id, data)` - Update link
- `delete(id)` - Delete link
- `reassignPrimaryReporting(employeeId, newOrgNodeId, startDate, notes?, actorId?)` - Reassign primary reporting
- `migrateFromMemberships(dryRun?)` - Migrate from OrgMembership to EmployeeOrgUnitLink

**Key Types**:
- `EmployeeOrgRelationshipType` - PRIMARY_REPORTING, FUNCTIONAL_ALIGNMENT, CAPABILITY_POOL, DELIVERY_ASSIGNMENT, TEMPORARY_ROTATION

**Dependencies**:
- Prisma client
- audit.service.ts

**Key Features**:
- Max 1 active PRIMARY_REPORTING per employee (enforced by partial unique index)
- Allocation percentage tracking (default 100% for DELIVERY_ASSIGNMENT/TEMPORARY_ROTATION)
- Capacity consumption rules (PRIMARY/FUNCTIONAL/CAPABILITY never consume)
- Date range validation
- Feature flag gated: `matrix_org_v1`

**Export**: `employeeOrgLinkService` singleton

---

### 14. Org Node Helpers

**File**: `org-node.helpers.ts`

**Purpose**: Utility functions for org node operations.

**Key Functions**:
- `parsePathToIds(path)` - Parse path string to array of node IDs

**Export**: Functional module

---

## 4. Auth & Access Services

### 15. Auth

**File**: `auth.service.ts`

**Purpose**: Auth0 integration and user provisioning.

**Key Functions**:
- `findOrProvisionUser(auth0Sub, email?, name?, accessToken?)` - Find or create user from Auth0 identity
- `getUserById(id)` - Fetch user by ID
- `updateUser(id, data)` - Update user profile
- `getUserPermissions(userId)` - Get permissions for user role

**Private Functions**:
- `fetchAuth0UserInfo(auth0Sub, accessToken)` - Fetch email/name from Auth0 /userinfo endpoint (cached 5 min)
- `toUserResponse(user)` - Transform DB user to response DTO

**Dependencies**:
- Prisma client
- lib/permissions.ts (role-based permissions)

**Key Features**:
- Auto-provisioning: matches by auth0Sub → email → creates new VIEWER
- In-memory userinfo cache (5 min TTL)
- lastLoginAt tracking
- Role-derived permissions

**Export**: Functional module

---

### 16. Auth0 Management

**File**: `auth0-management.service.ts`

**Purpose**: Auth0 Management API integration for admin user management.

**Key Functions**:
- `listAuth0Users()` - List all Auth0 users
- `createAuth0User(email, password)` - Create Auth0 user
- `updateAuth0User(auth0Id, data)` - Update Auth0 user
- `deleteAuth0User(auth0Id)` - Delete Auth0 user

**Dependencies**:
- Auth0 Management API SDK

**Key Features**:
- Machine-to-machine authentication
- User CRUD operations via Management API
- Connection management

**Export**: Functional module

---

### 17. Authority

**File**: `authority.service.ts`

**Purpose**: Authorization checks and role-based access control.

**Key Functions**:
- `hasPermission(userId, permission)` - Check if user has permission
- `canAccessInitiative(userId, initiativeId)` - Check initiative access
- `canAccessScenario(userId, scenarioId)` - Check scenario access
- `canAccessOrgNode(userId, orgNodeId)` - Check org node access

**Dependencies**:
- Prisma client
- lib/permissions.ts

**Key Features**:
- Role-based permissions (ADMIN, PRODUCT_OWNER, BUSINESS_OWNER, VIEWER)
- Entity-level access checks
- Ownership-based access

**Export**: Functional module

---

### 18. Entitlement

**File**: `entitlement.service.ts`

**Purpose**: Entitlement and license management.

**Key Functions**:
- `checkEntitlement(feature)` - Check if feature is entitled
- `getUsageLimits()` - Get current usage limits
- `trackUsage(metric, value)` - Track usage metrics

**Dependencies**:
- Prisma client

**Key Features**:
- Feature entitlements
- Usage tracking and limits
- License validation

**Export**: Functional module

---

## 5. Forecasting Services

### 19. Forecast

**File**: `forecast.service.ts`

**Purpose**: Monte Carlo forecast engine with two modes: scope-based (Mode A) and empirical (Mode B).

**Key Functions**:

**Pure Engine Functions**:
- `boxMullerNormal()` - Generate standard normal sample
- `lognormalSample(p50, p90)` - Draw from lognormal distribution
- `createLognormalSampler(p50, p90)` - Create reusable sampler
- `runSimulation(n, sampleFn)` - Run N iterations and collect sorted results
- `computePercentiles(results, levels)` - Compute percentiles with linear interpolation

**Mode A: Scope-Based Forecast**:
- `runScopeBasedForecast(options)` - Full Mode A forecast with capacity spillover model
- `loadScopeData(initiativeIds)` - Load scope items from DB
- `buildPeriodCapacity(capacityData, periods)` - Extract per-period capacity
- `sampleInitiativeEffort(initiatives)` - Sample effort per iteration
- `walkPeriodsForInitiative(demand, capacity)` - Walk periods with spillover tracking

**Mode B: Empirical Forecast**:
- `runEmpiricalForecast(options)` - Full Mode B forecast with bootstrap sampling
- `computeHistoricalCycleTimes()` - Extract cycle times from StatusLog (RESOURCING→COMPLETE)
- `getInProgressInitiatives(ids)` - Get initiatives with elapsed days
- `sampleFromCycleTimes(cycleTimes)` - Bootstrap sample from historical data

**Data Quality**:
- `assessDataQuality(options)` - Assess data quality for forecasting (score 0-100)

**Key Types**:
- `SimulationResult` - Sorted values array + count
- `PercentileResult` - Level + value
- `ScopeBasedForecastResult` - Mode A output with completion CDF per initiative
- `EmpiricalForecastResult` - Mode B output with percentiles per initiative
- `DataQualityResult` - Score + confidence + issues

**Dependencies**:
- Prisma client
- scenario-calculator.service.ts (for capacity data)
- initiative-status-log.service.ts (for cycle times)

**Key Features**:
- **Mode A**: Lognormal sampling, skill-based capacity matching, spillover demand model
- **Mode B**: Bootstrap sampling from historical cycle times, low-confidence warnings (<10 data points)
- Data quality assessment: estimate coverage (40 pts) + distributions (30 pts) + history (30 pts)
- ForecastRun persistence with input snapshot and warnings
- Performance: Mode A ~13ms, Mode B ~1ms (N=1000)
- Feature flag gated: `flow_forecast_v1`, `forecast_mode_b`

**Constants**: `LOW_CONFIDENCE_THRESHOLD = 10`

**Export**: Functional module

---

### 20. Initiative Status Log

**File**: `initiative-status-log.service.ts`

**Purpose**: Logs initiative status transitions for analytics and Mode B forecasting.

**Key Functions**:
- `logTransition(initiativeId, fromStatus, toStatus, actorId?)` - Log status transition
- `getHistory(initiativeId)` - Get transition history
- `getCycleTimes(fromStatus, toStatus)` - Get cycle time distribution

**Dependencies**:
- Prisma client

**Key Features**:
- Timestamp tracking per transition
- Actor tracking
- Cycle time analytics (used by forecast.service.ts Mode B)

**Export**: Functional module

---

## 6. Administration Services

### 21. Feature Flags

**File**: `feature-flag.service.ts`

**Purpose**: Feature flag management with Redis caching.

**Key Functions**:
- `isEnabled(key)` - Check if flag is enabled (hot path, uses Redis cache)
- `getFlag(key)` - Get single flag (direct DB)
- `listFlags()` - List all flags
- `setFlag(key, data)` - Update flag and invalidate cache

**Dependencies**:
- Prisma client
- Redis (60-sec TTL)

**Key Features**:
- Redis caching for fast reads
- Cache invalidation on updates
- Returns `false` for unknown keys (disabled by default)
- Admin-only CRUD

**Constants**: `FF_PREFIX = 'ff:'`, `FF_TTL = 60`

**Export**: Functional module

---

### 22. Job Profiles

**File**: `job-profile.service.ts`

**Purpose**: Manages job profiles with skills and cost bands.

**Class**: `JobProfileService`

**Key Methods**:
- `list()` - List all job profiles with skills and cost bands
- `getById(id)` - Fetch single profile with skills and cost bands
- `create(data)` - Create profile with skills and cost band
- `update(id, data)` - Update profile (replaces skills)
- `delete(id)` - Delete profile (checks for employee references)

**Dependencies**:
- Prisma client

**Key Features**:
- Skill associations (1-to-many)
- Cost band association (1-to-1)
- Employee assignment tracking
- Feature flag gated: `job_profiles`

**Export**: `jobProfileService` singleton

---

### 23. Portfolio Areas

**File**: `portfolio-areas.service.ts`

**Purpose**: Manages portfolio areas for initiative grouping.

**Key Functions**:
- `list()` - List all portfolio areas
- `getById(id)` - Fetch single area
- `create(data)` - Create portfolio area
- `update(id, data)` - Update area
- `delete(id)` - Delete area (checks for initiative references)

**Dependencies**:
- Prisma client

**Key Features**:
- Simple name + description structure
- Initiative grouping

**Export**: Functional module

---

### 24. Budget Report

**File**: `budget-report.service.ts`

**Purpose**: Generates budget reports by aggregating costs from allocations.

**Key Functions**:
- `generateReport(scenarioId, options?)` - Generate budget report
- `generateComparison(scenarioIds)` - Compare budgets across scenarios

**Dependencies**:
- Prisma client
- job-profile.service.ts (for cost bands)

**Key Features**:
- Hours × hourlyRate cost calculation
- Grouping by initiative, portfolio area, or org node
- Scenario comparison
- Feature flag gated: `budget_reports`

**Export**: Functional module

---

### 25. Rollups (Triple Constraint)

**File**: `rollup.service.ts`

**Purpose**: Triple constraint rollups (scope, timeline, budget) across three lenses.

**Key Functions**:
- `getRollupByPortfolioArea(scenarioId)` - Rollup by portfolio area
- `getRollupByOrgNode(scenarioId, orgNodeId?)` - Rollup by org node (with temporal overlap split)
- `getRollupByBusinessOwner(scenarioId)` - Rollup by business owner

**Private Helpers**:
- `computeOverlapRatio()` - Temporal overlap between membership and period ranges
- `loadScenarioData()` - Load scenario with allocations and token demand
- `computeScopeForInitiative()` - Aggregate token demand by skill pool

**Dependencies**:
- Prisma client
- feature-flag.service.ts
- employee-org-link.service.ts (for matrix org awareness)

**Key Features**:
- **Scope dimension**: TokenDemand aggregation by skill pool (null for LEGACY mode)
- **Timeline dimension**: Earliest/latest dates across initiatives
- **Budget dimension**: Hours × hourlyRate from job profiles, with cost coverage tracking
- **OrgNode lens**: Matrix org aware (uses OrgMembership OR EmployeeOrgUnitLink)
- Temporal overlap split via `computeOverlapRatio()`
- Feature flag gated: `triple_constraint_rollups_v1`

**Export**: Functional module

---

## 7. Integration Services

### 26. Jira API

**File**: `jira-api.service.ts`

**Purpose**: Jira REST API client for fetching issues and projects.

**Key Functions**:
- `getIssue(issueKey)` - Fetch single Jira issue
- `searchIssues(jql)` - Search issues with JQL
- `getProject(projectKey)` - Fetch Jira project
- `createIssue(data)` - Create Jira issue

**Dependencies**:
- Jira REST API client

**Key Features**:
- OAuth 2.0 authentication
- Issue CRUD operations
- JQL search support

**Export**: Functional module

---

### 27. Jira Auth

**File**: `jira-auth.service.ts`

**Purpose**: Jira OAuth 2.0 authentication flow.

**Key Functions**:
- `getAuthUrl()` - Get OAuth authorization URL
- `exchangeCodeForToken(code)` - Exchange auth code for access token
- `refreshToken(refreshToken)` - Refresh access token
- `revokeToken(token)` - Revoke access token

**Dependencies**:
- OAuth 2.0 client library

**Key Features**:
- PKCE flow support
- Token refresh
- Token storage

**Export**: Functional module

---

### 28. Jira Sync

**File**: `jira-sync.service.ts`

**Purpose**: Synchronizes Jira issues with initiatives.

**Key Functions**:
- `syncIssue(issueKey)` - Sync single Jira issue to initiative
- `syncProject(projectKey)` - Sync all issues from a Jira project
- `scheduleSync()` - Schedule recurring sync job

**Dependencies**:
- jira-api.service.ts
- initiatives.service.ts
- BullMQ jobs

**Key Features**:
- Initiative origin: JIRA_IMPORT
- Mapping: Jira fields → initiative fields
- Background sync job
- Conflict resolution

**Export**: Functional module

---

## 8. Workflow Services

### 29. Approval Policy

**File**: `approval-policy.service.ts`

**Purpose**: Manages approval policies with rule-based approver resolution.

**Key Functions**:
- `createPolicy(input, actorId?)` - Create policy with rule validation
- `updatePolicy(id, input, actorId?)` - Update policy
- `deletePolicy(id, actorId?)` - Delete policy
- `listByOrgNode(orgNodeId, scope?)` - List policies for org node
- `getChain(orgNodeId, scope)` - Build approval chain (level 1 → N)
- `resolveApprovers(orgNodeId, scope, level)` - Resolve approvers for a level

**Private Helpers**:
- `validateRuleConfig()` - Validate rule-specific configuration
- `resolveForRule()` - Resolve approvers for specific rule type

**Key Types**:
- `ApprovalScope` - INITIATIVE, SCENARIO, RESOURCE_ALLOCATION, SCOPE_CHANGES
- `ApprovalRuleType` - NODE_MANAGER, SPECIFIC_USERS, ORG_NODE_ROLE, DYNAMIC_ROLE, QUORUM
- `CrossBuStrategy` - COMMON_ANCESTOR, ALL_BRANCHES, ORIGINATING_NODE
- `PolicyEnforcement` - BLOCKING, ADVISORY

**Dependencies**:
- Prisma client
- audit.service.ts
- org-membership.service.ts

**Key Features**:
- Multi-level approval chains
- Rule-based approver resolution
- Cross-BU strategies
- Quorum support
- Advisory vs blocking enforcement

**Export**: Functional module

---

### 30. Approval Workflow

**File**: `approval-workflow.service.ts`

**Purpose**: Manages approval requests, decisions, and delegation.

**Key Functions**:
- `createRequest(data, actorId?)` - Create approval request
- `getRequest(id)` - Fetch request with decisions
- `listRequests(filters)` - List requests with filtering
- `approve(requestId, approverId, notes?, actorId?)` - Approve request
- `reject(requestId, approverId, notes?, actorId?)` - Reject request
- `delegate(requestId, fromApproverId, toApproverId, notes?, actorId?)` - Delegate approval
- `cancel(requestId, actorId?)` - Cancel request

**Dependencies**:
- Prisma client
- audit.service.ts

**Key Features**:
- Request status: PENDING, APPROVED, REJECTED, CANCELLED
- Decision tracking per approver
- Delegation chain
- Audit trail

**Export**: Functional module

---

### 31. Approval Enforcement

**File**: `approval-enforcement.service.ts`

**Purpose**: Enforces approval policies on workflow transitions.

**Class**: `ApprovalEnforcementService`

**Key Methods**:
- `checkApproval(params)` - Check if approval is required, create pending request if needed

**Key Types**:
- `CheckApprovalParams` - scope, subjectType, subjectId, actorId
- `CheckApprovalResult` - allowed, reason?, pendingRequestId?

**Dependencies**:
- approval-policy.service.ts
- approval-workflow.service.ts

**Key Features**:
- Pre-transition approval checks
- Auto-creates approval requests when policies require it
- Returns `{ allowed: false, pendingRequestId }` when approval needed
- Used by initiatives.service, scenarios.service, allocation.service

**Export**: `approvalEnforcementService` singleton

---

### 32. Audit

**File**: `audit.service.ts`

**Purpose**: Audit event logging for compliance and tracking.

**Key Functions**:
- `logAuditEvent(data)` - Log audit event
- `getAuditLog(filters)` - Query audit log

**Key Types**:
- `AuditAction` - CREATE, UPDATE, DELETE, APPROVE, REJECT, ASSIGN, MOVE, etc.
- `AuditEvent` - actorId, entityType, entityId, action, payload, timestamp

**Dependencies**:
- Prisma client

**Key Features**:
- Actor tracking
- Entity type + ID tracking
- JSON payload for details
- Timestamp tracking

**Export**: Functional module

---

## 9. Other Services

### 33. Baseline

**File**: `baseline.service.ts`

**Purpose**: Captures baseline snapshots when scenarios are locked.

**Key Functions**:
- `captureSnapshot(scenarioId)` - Capture baseline snapshot
- `getSnapshots(scenarioId)` - List snapshots for scenario
- `compareToBaseline(scenarioId, snapshotId)` - Compare current state to baseline

**Dependencies**:
- Prisma client
- scenarios.service.ts

**Key Features**:
- JSON snapshot of allocations + priorities
- Timestamp tracking
- Diff computation

**Export**: Functional module

---

### 34. Delta Engine

**File**: `delta-engine.service.ts`

**Purpose**: Computes deltas between scenario states.

**Key Functions**:
- `computeDelta(fromScenarioId, toScenarioId)` - Compute delta
- `applyDelta(scenarioId, delta)` - Apply delta to scenario

**Dependencies**:
- scenarios.service.ts
- allocation.service.ts

**Key Features**:
- Allocation diff (added, removed, changed)
- Priority diff
- Metadata diff

**Export**: Functional module

---

### 35. Drift Alert

**File**: `drift-alert.service.ts`

**Purpose**: Detects drift between planned and actual resource allocation.

**Key Functions**:
- `checkDrift()` - Check for drift across all scenarios
- `getDriftAlerts()` - Get active drift alerts
- `acknowledgeDrift(alertId)` - Acknowledge drift alert

**Dependencies**:
- scenarios.service.ts
- allocation.service.ts
- BullMQ jobs

**Key Features**:
- Threshold-based alerts (e.g., >10% variance)
- Alert status: ACTIVE, ACKNOWLEDGED, RESOLVED
- Background drift checking

**Export**: Functional module

---

### 36. Freeze Policy

**File**: `freeze-policy.service.ts`

**Purpose**: Enforces freeze policies on scenarios and periods.

**Key Functions**:
- `validateRevisionAllowed(periodId, reason)` - Check if revision is allowed during freeze
- `listPolicies()` - List freeze policies
- `createPolicy(data)` - Create freeze policy
- `updatePolicy(id, data)` - Update policy
- `deletePolicy(id)` - Delete policy

**Dependencies**:
- Prisma client

**Key Features**:
- Period-based freezes
- Revision reason enforcement
- Grace period support

**Export**: Functional module

---

### 37. Period

**File**: `period.service.ts`

**Purpose**: Manages time periods (weeks, months, quarters, years).

**Key Functions**:
- `listPeriods(type?, startDate?, endDate?)` - List periods
- `getPeriodById(id)` - Fetch single period
- `createPeriod(data)` - Create period
- `updatePeriod(id, data)` - Update period
- `deletePeriod(id)` - Delete period
- `findPeriodsInRange(startDate, endDate, type)` - Find periods overlapping a date range
- `mapDateRangeToPeriods(startDate, endDate, type)` - Map date range to periods with overlap ratios

**Key Types**:
- `PeriodType` - WEEK, MONTH, QUARTER, YEAR
- `PeriodOverlap` - periodId, overlapRatio (0-1)

**Dependencies**:
- Prisma client

**Key Features**:
- Hierarchical period structure
- Overlap ratio computation for date ranges
- Used by allocation.service.ts for AllocationPeriod computation

**Export**: Functional module

---

### 38. Ramp

**File**: `ramp.service.ts`

**Purpose**: Computes ramp-up modifiers for new allocations.

**Key Functions**:
- `computeRampModifiers(allocationId, assumptions)` - Compute ramp modifiers per period
- `getRampProfile(type)` - Get ramp profile definition

**Key Types**:
- `RampProfile` - LINEAR, S_CURVE, STEP, CUSTOM
- Modifier is a multiplier (0.0 - 1.0) applied to capacity

**Dependencies**:
- Prisma client
- allocation.service.ts (updates AllocationPeriod.rampModifier)

**Key Features**:
- Profile-based ramp curves
- Period-specific modifiers
- Scenario assumptions integration
- Feature flag gated via scenario assumptions: `rampEnabled`

**Export**: Functional module

---

### 39. Intake

**File**: `intake.service.ts`

**Purpose**: Manages intake forms and submission workflow.

**Key Functions**:
- `listIntakes(filters)` - List intake forms
- `getIntakeById(id)` - Fetch single intake
- `createIntake(data)` - Create intake form
- `updateIntake(id, data)` - Update form
- `deleteIntake(id)` - Delete form
- `submit(id, responses)` - Submit intake responses

**Dependencies**:
- Prisma client

**Key Features**:
- Form definition with JSON schema
- Response validation
- Status workflow

**Export**: Functional module

---

### 40. Intake Planning

**File**: `intake-planning.service.ts`

**Purpose**: Plans intake capacity and prioritizes intake requests.

**Key Functions**:
- `planIntake(periodId)` - Plan intake for period
- `prioritizeRequests(requests)` - Prioritize intake requests

**Dependencies**:
- intake.service.ts
- intake-request.service.ts

**Key Features**:
- Capacity-based planning
- Prioritization algorithm
- Request scoring

**Export**: Functional module

---

### 41. Intake Request

**File**: `intake-request.service.ts`

**Purpose**: Manages intake requests (submitted intake forms).

**Key Functions**:
- `listRequests(filters)` - List requests
- `getRequestById(id)` - Fetch single request
- `updateRequest(id, data)` - Update request
- `convertToInitiative(id)` - Convert request to initiative

**Dependencies**:
- Prisma client
- initiatives.service.ts

**Key Features**:
- Request status: SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, CONVERTED
- Scoring and prioritization
- Initiative conversion

**Export**: Functional module

---

## Common Patterns Across Services

### Error Handling
All services use custom error classes from `lib/errors.ts`:
- `NotFoundError(entityType, id)` - 404 errors
- `ValidationError(message)` - 400 errors
- `WorkflowError(message, currentStatus?, targetStatus?)` - 422 errors
- `ConflictError(message)` - 409 errors
- `ForbiddenError(message)` - 403 errors

### Prisma Integration
- All services use the shared Prisma client from `lib/prisma.js`
- Transactions via `prisma.$transaction()`
- Include/select patterns for loading related data
- Cascade deletes handled by Prisma schema

### Caching (Redis)
Services with caching:
- `scenario-calculator.service.ts` - Calculation results (15 min TTL)
- `feature-flag.service.ts` - Flag values (60 sec TTL)
- `auth.service.ts` - Auth0 userinfo (5 min in-memory)

### Background Jobs (BullMQ)
Services that enqueue jobs:
- `scenarios.service.ts` - Scenario recompute, view refresh
- `allocation.service.ts` - Scenario recompute, view refresh
- `capacity.service.ts` - Drift check
- `scoping.service.ts` - Drift check
- `jira-sync.service.ts` - Recurring sync

Job queues:
- `scenario-recompute` - Recalculate demand/capacity
- `csv-import` - Async initiative imports
- `view-refresh` - Refresh materialized views

### Audit Logging
Services that log audit events:
- `org-tree.service.ts` - Node CRUD operations
- `org-membership.service.ts` - Membership changes
- `approval-policy.service.ts` - Policy CRUD
- `approval-workflow.service.ts` - Request/decision tracking

### Feature Flags
Services gated by feature flags:
- `skill-pool.service.ts`, `token-supply.service.ts`, `token-demand.service.ts` - `token_planning_v1`
- `forecast.service.ts` - `flow_forecast_v1`, `forecast_mode_b`
- `job-profile.service.ts` - `job_profiles`
- `budget-report.service.ts` - `budget_reports`
- `rollup.service.ts` - `triple_constraint_rollups_v1`
- `employee-org-link.service.ts` - `matrix_org_v1`

### Validation Patterns
- Schema validation via Zod (in `schemas/` directory)
- Business rule validation in service layer
- Reference validation (FK existence checks)
- Workflow state validation (status transitions)
- Date range validation
- Uniqueness validation

---

## Service Dependencies Graph

**High-level dependency flow**:

```
Routes
  → Services (business logic)
    → Prisma (data access)
    → Redis (caching)
    → BullMQ (background jobs)
    → External APIs (Auth0, Jira)
```

**Key service dependencies**:

- `scenarios.service` depends on: calculator, allocation, baseline, freeze-policy, approval-enforcement
- `allocation.service` depends on: calculator, period, ramp, approval-enforcement
- `forecast.service` depends on: calculator, initiative-status-log
- `approval-enforcement.service` depends on: approval-policy, approval-workflow
- `rollup.service` depends on: feature-flag, employee-org-link
- `org-tree.service` depends on: audit, org-node.helpers

---

## Performance Considerations

**Hot paths** (optimized for speed):
- `feature-flag.service.ts` `isEnabled()` - Redis cache first, DB fallback
- `scenario-calculator.service.ts` `calculate()` - Redis cache with 15-min TTL
- `auth.service.ts` `fetchAuth0UserInfo()` - In-memory cache 5 min

**Batch operations** (optimized for N+1 queries):
- `allocation.service.ts` `listInitiativeAllocationHours()` - Batch fetch allocation hours
- `allocation.service.ts` `listAllocationSummaries()` - Batch fetch employee summaries
- `capacity.service.ts` `batchGetPtoHours()` - Batch fetch PTO hours

**Background jobs** (async processing):
- Scenario recompute - Triggered on priority/allocation changes
- CSV import - Async for large imports (>100 rows)
- View refresh - Scheduled every 15 min or on-demand
- Drift check - Triggered on capacity/demand changes
- Jira sync - Recurring sync job

---

## Migration Notes

**Strangler Pattern** (dual-mode support):
- `scenarios.service.ts` supports `planningMode: LEGACY | TOKEN`
- Token flow services co-exist with time-based services
- Calculator service mode-aware (uses TokenDemand or ScopeItem demand)

**Matrix Org Migration**:
- `org-membership.service.ts` (legacy) coexists with `employee-org-link.service.ts` (matrix)
- `employee-org-link.service.ts` has `migrateFromMemberships()` utility
- Rollup service is matrix-aware (checks both models)

---

## Configuration

**Environment Variables**:
- `AUTH0_DOMAIN` - Auth0 tenant domain
- `AUTH0_AUDIENCE` - Auth0 API audience
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` - Redis config
- `NODE_ENV` - Environment (development, production)

**Constants**:
- Most services define constants at the top (cache keys, TTLs, thresholds)
- Example: `forecast.service.ts` - `LOW_CONFIDENCE_THRESHOLD = 10`

---

## Testing Conventions

All services have corresponding test files in `packages/backend/src/tests/`:
- `initiatives.test.ts`
- `scenarios.test.ts`
- `allocation.test.ts`
- `forecast.test.ts`
- etc.

Test patterns:
- Vitest for test runner
- `vi.mock()` for Prisma client mocking
- `buildTestApp()` for integration tests
- `testUuid()` for generating valid test UUIDs (hex-safe only: 0-9, a-f)
- Pure function tests need no mocks (e.g., forecast engine math functions)

---

## Next Steps

For detailed API documentation, see:
- **Route documentation**: `docs/components/backend-routes.md`
- **Schema documentation**: `packages/backend/src/schemas/` (Zod schemas with JSDoc comments)
- **Type definitions**: `packages/backend/src/types/` (TypeScript interfaces)

For architecture documentation, see:
- **Planning layer**: `packages/backend/src/planning/`
- **Job queues**: `docs/components/planning-and-jobs.md`
- **Database schema**: `packages/backend/prisma/schema.prisma`

---

**Document Version**: 2.0
**Last Updated**: 2026-02-08
**Total Services Documented**: 41
