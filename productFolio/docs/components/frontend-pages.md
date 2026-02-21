# Frontend Pages

Reference documentation for all page components in `packages/frontend/src/pages/`.

---

## Table of Contents

- [Router Configuration](#router-configuration)
- [Layout Component](#layout-component)
- [Portfolio Management](#portfolio-management)
  - [InitiativesList](#initiativeslist)
  - [InitiativeDetail](#initiativedetail)
  - [ScenariosList](#scenarioslist)
  - [ScenarioPlanner](#scenarioplanner)
  - [ScenarioRollups](#scenariorollups)
  - [PortfolioAreas](#portfolioareas)
- [Resource Planning](#resource-planning)
  - [Capacity](#capacity)
  - [EmployeeOrgRelationships](#employeeorgrelationships)
- [Token Planning](#token-planning)
  - [TokenLedger](#tokenledger)
- [Forecasting](#forecasting)
  - [FlowForecast](#flowforecast)
  - [DeliveryForecast](#deliveryforecast)
- [Organization](#organization)
  - [OrgTreeAdmin](#orgtreeadmin)
  - [OrgCapacity](#orgcapacity)
- [Intake](#intake)
  - [IntakeList](#intakelist)
  - [IntakeRequestList](#intakerequestlist)
  - [IntakeRequestDetail](#intakerequestdetail)
- [Reports](#reports)
  - [Reports](#reports-page)
- [Administration](#administration)
  - [FeatureFlagsAdmin](#featureflagsadmin)
  - [JobProfilesAdmin](#jobprofilesadmin)
  - [Approvals](#approvals)
  - [AuthoritiesAdmin](#authoritiesadmin)
  - [UsersAdmin](#usersadmin)
  - [RevOpsAdmin](#revopsadmin)
- [Integration](#integration)
  - [JiraSettings](#jirasettings)
- [Auth](#auth)
  - [Unauthorized](#unauthorized)

---

## Router Configuration

**File**: `packages/frontend/src/router.tsx`

All page components are lazy-loaded with `React.lazy()` and wrapped in `ErrorBoundary` + `Suspense` (via `LazyPage`, `LazyDetailPage`, or `LazyPlannerPage` wrappers).

### Suspense Wrappers

| Wrapper | Skeleton | Used By |
|---------|----------|---------|
| `LazyPage` | `PageLoadingSkeleton` | Most list/admin pages |
| `LazyDetailPage` | `DetailPageSkeleton` | Detail pages (InitiativeDetail, IntakeRequestDetail) |
| `LazyPlannerPage` | `PlannerPageSkeleton` | ScenarioPlanner |

### Route Map

| Path | Component | Wrapper |
|------|-----------|---------|
| `/` | Redirects to `/initiatives` | — |
| `/initiatives` | `InitiativesList` | `LazyPage` |
| `/initiatives/:id` | `InitiativeDetail` | `LazyDetailPage` |
| `/capacity` | `Capacity` | `LazyPage` |
| `/org-capacity` | `OrgCapacity` | `LazyPage` |
| `/scenarios` | `ScenariosList` | `LazyPage` |
| `/scenarios/:id` | `ScenarioPlanner` | `LazyPlannerPage` |
| `/scenarios/:id/token-ledger` | `TokenLedger` | `LazyPage` |
| `/scenarios/:id/rollups` | `ScenarioRollups` | `LazyPage` |
| `/reports` | `Reports` | `LazyPage` |
| `/delivery` | `DeliveryForecast` | `LazyPage` |
| `/forecast` | `FlowForecast` | `LazyPage` |
| `/admin/org-tree` | `OrgTreeAdmin` | `LazyPage` |
| `/approvals` | `Approvals` | `LazyPage` |
| `/intake` | `IntakeList` | `LazyPage` |
| `/intake-requests` | `IntakeRequestList` | `LazyPage` |
| `/intake-requests/:id` | `IntakeRequestDetail` | `LazyDetailPage` |
| `/admin/feature-flags` | `FeatureFlagsAdmin` | `LazyPage` |
| `/admin/job-profiles` | `JobProfilesAdmin` | `LazyPage` |
| `/admin/authorities` | `AuthoritiesAdmin` | `LazyPage` |
| `/admin/jira-settings` | `JiraSettings` | `LazyPage` |
| `/admin/revops` | `RevOpsAdmin` | `LazyPage` |
| `/admin/users` | `UsersAdmin` | `LazyPage` |
| `/unauthorized` | `Unauthorized` | (outside protected layout) |
| `/login` | `LoginPage` | (outside protected layout) |

### Lazy Import Pattern

```tsx
const Foo = lazy(() => import('./pages/Foo').then((m) => ({ default: m.Foo })));

// In route children:
{
  path: 'foo',
  element: (
    <ErrorBoundary>
      <LazyPage><Foo /></LazyPage>
    </ErrorBoundary>
  ),
}
```

---

## Layout Component

**File**: `packages/frontend/src/components/Layout.tsx`

The `Layout` component provides the application shell: collapsible sidebar navigation, top breadcrumb bar, and main content area.

### Sidebar Navigation

The sidebar is built from a `coreNavigation` array with dynamic insertions based on feature flags and permissions.

**Core navigation items** (always visible):

| Label | Path | Icon |
|-------|------|------|
| Intake | `/intake` | `InboxIcon` |
| Initiatives | `/initiatives` | `RocketLaunchIcon` |
| Employees | `/capacity` | `UsersIcon` |
| Scenarios | `/scenarios` | `BeakerIcon` |
| Reports | `/reports` | `ChartBarIcon` |
| Delivery | `/delivery` | `TruckIcon` |
| Approvals | `/approvals` | `ShieldCheckIcon` |
| Org Structure | `/admin/org-tree` | `BuildingOffice2Icon` |
| Jira Settings | `/admin/jira-settings` | `Cog6ToothIcon` |

**Conditional navigation items** (inserted dynamically):

| Label | Path | Condition | Inserted After |
|-------|------|-----------|---------------|
| Org Capacity | `/org-capacity` | `org_capacity_view` flag | Employees |
| Flow Forecast | `/forecast` | `flow_forecast_v1` flag | Delivery |
| Job Profiles | `/admin/job-profiles` | `job_profiles` flag | Before Jira Settings |
| Feature Flags | `/admin/feature-flags` | `feature-flag:admin` permission | Before Jira Settings |
| Authorities | `/admin/authorities` | `authority:admin` permission | Before Jira Settings |
| Users | `/admin/users` | `authority:admin` permission | Before Jira Settings |
| RevOps | `/admin/revops` | `authority:admin` permission | Before Jira Settings |

### Breadcrumb Mapping

Path segments are mapped to display labels in the breadcrumb bar:

| Segment | Label |
|---------|-------|
| `initiatives` | Initiatives |
| `capacity` | Employees |
| `scenarios` | Scenarios |
| `reports` | Reports |
| `delivery` | Delivery |
| `forecast` | Flow Forecast |
| `org-capacity` | Org Capacity |
| `approvals` | Approvals |
| `intake` | Intake |
| `intake-requests` | Intake Requests |
| `admin` | Admin |
| `org-tree` | Org Structure |
| `feature-flags` | Feature Flags |
| `job-profiles` | Job Profiles |
| `jira-settings` | Jira Settings |
| `authorities` | Authorities |
| `users` | Users |
| `revops` | RevOps |
| `token-ledger` | Token Ledger |
| `rollups` | Rollups |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+I` | Navigate to Initiatives |
| `Alt+C` | Navigate to Employees |
| `Alt+S` | Navigate to Scenarios |
| `Alt+R` | Navigate to Reports |
| `Alt+D` | Navigate to Delivery |
| `Alt+B` | Toggle sidebar collapsed/expanded |

---

## Portfolio Management

### InitiativesList

**File**: `packages/frontend/src/pages/InitiativesList.tsx`
**Route**: `/initiatives`
**Purpose**: Primary initiative list view with filtering, grouping, and bulk operations.

**Layout**:
- Header with title, subtitle ("Manage and track all portfolio initiatives"), and "New Initiative" button
- Stats cards row: Total, Active (IN_EXECUTION), Proposed, Complete
- Filter bar: search input, status multi-select, quarter select, origin select, org node select
- Grouped table: initiatives grouped by portfolio area (or org node), with expand/collapse
- Each row shows: name, status badge, quarter, owner, allocated hours, portfolio area, origin
- Bulk action bar for multi-select operations (status change, delete)
- CSV export button

**Hooks**:
- `useInitiatives` — fetch initiative list with filters
- `useInitiativeAllocationHoursByType` — allocation hours breakdown
- `useBulkUpdateStatus` — bulk status transitions
- `useBulkDeleteInitiatives` — bulk delete
- `useExportInitiatives` — CSV export
- `useOrgTree` — org node filter options

**API Endpoints**:
- `GET /api/initiatives` (with query params for filters)
- `PATCH /api/initiatives/bulk-status`
- `DELETE /api/initiatives/bulk`
- `GET /api/initiatives/export`
- `GET /api/org/tree`

---

### InitiativeDetail

**File**: `packages/frontend/src/pages/InitiativeDetail.tsx`
**Route**: `/initiatives/:id`
**Purpose**: Detailed view of a single initiative with tabbed sections for all related data.

**Layout**:
- Header with editable title (inline edit), status badge, status transition dropdown with confirmation modal
- 5 tabs:
  - **Overview**: description, metadata fields (quarter, owner, portfolio area, origin, T-shirt size, business value), editable via modal
  - **Scope**: scope items table with skill demands, P50/P90 estimates, period distributions; add/edit slide-over
  - **Assignments**: employee allocations table with date ranges and percentages
  - **Approvals**: approval requests list, chain visualization, submit/cancel actions
  - **Activity**: audit log / status history timeline

**Hooks**:
- `useInitiative` — single initiative by ID
- `useUpdateInitiative` — update initiative fields
- `useUpdateInitiativeStatus` — status transitions with confirmation
- `useInitiativeAllocationsAll` — all allocations for this initiative
- `useQuarterPeriods` — quarter period definitions

**API Endpoints**:
- `GET /api/initiatives/:id`
- `PATCH /api/initiatives/:id`
- `PATCH /api/initiatives/:id/status`
- `GET /api/initiatives/:id/allocations`
- `GET /api/initiatives/:id/status-history`

---

### ScenariosList

**File**: `packages/frontend/src/pages/ScenariosList.tsx`
**Route**: `/scenarios`
**Purpose**: Scenario management with quarter-grouped cards and comparison tools.

**Layout**:
- Header with title and "New Scenario" button
- Scenarios grouped by quarter (previous, current, next) in card layout
- Each card shows: name, status, initiative count, primary badge, actions (clone, set primary, open)
- Create/Clone modal with name, quarter, and optional source scenario fields
- Comparison table for side-by-side scenario analysis

**Hooks**:
- `useScenarios` — fetch all scenarios
- `useCreateScenario` — create new scenario
- `useCloneScenario` — clone existing scenario
- `useSetPrimary` — mark scenario as primary for its quarter
- `useAdjacentQuarters` — compute prev/current/next quarters
- `useQuarterPeriods` — quarter period definitions
- `useOrgTree` — org node data for comparison

**API Endpoints**:
- `GET /api/scenarios`
- `POST /api/scenarios`
- `POST /api/scenarios/:id/clone`
- `PATCH /api/scenarios/:id/primary`
- `GET /api/org/tree`

---

### ScenarioPlanner

**File**: `packages/frontend/src/pages/ScenarioPlanner.tsx`
**Route**: `/scenarios/:id`
**Purpose**: The main planning workspace for a scenario — drag-and-drop priority ranking, allocations, capacity-demand analysis, and auto-allocation.

**Layout**:
- Header with scenario name, status, planning mode toggle (LEGACY/TOKEN), action buttons (set primary, transition status, rollups link)
- Left panel: initiative priority list with DnD Kit drag handles for reordering
- Right panel: allocation details for selected initiative, employee assignment table
- Bottom panel: capacity-demand analysis charts/table
- Auto-allocate preview and apply modal
- Token ledger link (when in TOKEN mode)
- Rollups link (when `triple_constraint_rollups_v1` enabled)

**Hooks**:
- `useScenario` — single scenario
- `useScenarioAllocations` — all allocations in scenario
- `useScenarioAnalysis` — capacity-demand analysis
- `useUpdatePriorities` — save priority rankings
- `useCreateAllocation`, `useUpdateAllocation`, `useDeleteAllocation` — allocation CRUD
- `useInitiativeAllocations` — allocations for selected initiative
- `useAutoAllocatePreview`, `useAutoAllocateApply` — auto-allocation
- `useTransitionScenarioStatus` — status workflow
- `useScenarioPermissions` — permission checks
- `useSetPrimary` — mark as primary
- `useUpdateScenario` — edit scenario fields
- `useInitiatives` — initiative list for assignment
- `useEmployees` — employee list for allocation
- `usePlanningModeToggle` — switch LEGACY/TOKEN mode
- `useFeatureFlag('token_planning_v1')` — token planning availability
- `useFeatureFlag('triple_constraint_rollups_v1')` — rollups link visibility

**API Endpoints**:
- `GET /api/scenarios/:id`
- `GET /api/scenarios/:id/allocations`
- `GET /api/scenarios/:id/capacity-demand`
- `PUT /api/scenarios/:id/priorities`
- `POST /api/scenarios/:id/allocations`
- `PATCH /api/scenarios/:id/allocations/:allocId`
- `DELETE /api/scenarios/:id/allocations/:allocId`
- `POST /api/scenarios/:id/auto-allocate/preview`
- `POST /api/scenarios/:id/auto-allocate/apply`
- `PATCH /api/scenarios/:id/status`
- `PUT /api/scenarios/:id/planning-mode`

**Feature Flags**: `token_planning_v1` (mode toggle), `triple_constraint_rollups_v1` (rollups link)

---

### ScenarioRollups

**File**: `packages/frontend/src/pages/ScenarioRollups.tsx`
**Route**: `/scenarios/:id/rollups`
**Feature Flag**: `triple_constraint_rollups_v1`
**Purpose**: Triple constraint rollup views aggregated across three lenses — portfolio areas, org nodes, and business owners.

**Layout**:
- Header with scenario name and back link
- 3 tabs:
  - **Portfolio Areas**: table with rows per area showing initiative count, total hours, estimated cost, token columns (TOKEN mode only), timeline
  - **Org Nodes**: same columns aggregated by org node, with temporal overlap splitting
  - **Business Owners**: same columns aggregated by business owner
- Expandable rows to see individual initiatives within each group
- Cost coverage indicator when job profiles lack cost band data

**Hooks**:
- `useScenario` — scenario metadata
- `usePortfolioAreaRollup` — portfolio area aggregation
- `useOrgNodeRollup` — org node aggregation
- `useBusinessOwnerRollup` — business owner aggregation
- `useFeatureFlag('triple_constraint_rollups_v1')` — gate access

**API Endpoints**:
- `GET /api/scenarios/:id`
- `GET /api/scenarios/:id/rollups/portfolio-area`
- `GET /api/scenarios/:id/rollups/org-node`
- `GET /api/scenarios/:id/rollups/business-owner`

---

### PortfolioAreas

**File**: `packages/frontend/src/pages/PortfolioAreas.tsx`
**Route**: Not in router (likely legacy or accessed as embedded component)
**Purpose**: CRUD management for portfolio area definitions.

**Layout**:
- Table listing portfolio areas with name, description, initiative count
- Create/Edit modal with name and description fields
- Delete confirmation

**Hooks**:
- `usePortfolioAreas` — list portfolio areas
- `useCreatePortfolioArea` — create
- `useUpdatePortfolioArea` — update
- `useDeletePortfolioArea` — delete

**API Endpoints**:
- `GET /api/portfolio-areas`
- `POST /api/portfolio-areas`
- `PATCH /api/portfolio-areas/:id`
- `DELETE /api/portfolio-areas/:id`

---

## Resource Planning

### Capacity

**File**: `packages/frontend/src/pages/Capacity.tsx`
**Route**: `/capacity`
**Purpose**: Employee management with skills, capacity settings, allocation summaries, and org relationships.

**Layout**:
- Header with title ("Employees"), subtitle, and "Add Employee" button
- Filter bar: search input, org unit select, skills multi-select
- Employee table: name, role, skills (tags), domain, allocation summary, actions
- Right sidebar (on row select):
  - **Effective Capacity Preview**: quarterly breakdown of available hours (total - KTLO - meetings - PTO)
  - **Capacity Settings**: KTLO percentage, meeting hours/week editors
  - **Holiday Calendar**: PTO entries with add/remove
- Employee slide-over (on row click) with 3 tabs:
  - **Details**: editable employee profile fields
  - **Assignments**: current allocations across scenarios
  - **Org Relationships**: matrix org link management (if `matrix_org_v1` enabled)

**Hooks**:
- `useEmployees` — employee list with filters
- `useCreateEmployee` — create employee
- `useUpdateEmployee` — update employee fields
- `useEmployeeAllocations` — allocations for selected employee
- `useEmployeeAllocationSummaries` — allocation summary data
- `useEmployeePtoHours` — PTO calendar
- `useQuarterPeriods` — quarter definitions
- `useOrgTree` — org unit filter options
- `useMemberships` — org memberships
- `useFeatureFlag('matrix_org_v1')` — org relationships tab visibility

**API Endpoints**:
- `GET /api/employees`
- `POST /api/employees`
- `PATCH /api/employees/:id`
- `GET /api/employees/:id/allocations`
- `GET /api/employees/:id/allocation-summaries`
- `GET /api/employees/:id/pto`
- `GET /api/org/tree`
- `GET /api/org/memberships`

**Feature Flags**: `matrix_org_v1` (org relationships tab in slide-over)

---

### EmployeeOrgRelationships

**File**: `packages/frontend/src/pages/EmployeeOrgRelationships.tsx`
**Route**: Embedded in `Capacity` page slide-over (not a standalone route)
**Feature Flag**: `matrix_org_v1`
**Purpose**: Matrix org relationship management for a selected employee — manage multiple org unit links with different relationship types.

**Layout**:
- Current primary reporting line display
- Relationship table: org unit, type badge, allocation %, start/end dates, actions
- Relationship types: `PRIMARY_REPORTING`, `DELIVERY_ASSIGNMENT`, `FUNCTIONAL_ALIGNMENT`, `CAPABILITY_POOL`, `TEMPORARY_ROTATION`
- Add relationship form: org unit selector, type dropdown, allocation %, date range
- Reassign primary reporting action with confirmation

**Hooks**:
- `useActiveEmployeeLinks` — active org links for employee
- `useEmployeeHomeOrg` — primary reporting org
- `useEmployeeCapacityLinks` — capacity-consuming links
- `useCreateEmployeeOrgLink` — create new link
- `useUpdateEmployeeOrgLink` — update link
- `useEndEmployeeOrgLink` — soft-delete (set end date)
- `useReassignPrimaryReporting` — change primary reporting line
- `useOrgTree` — org unit selector options

**API Endpoints**:
- `GET /api/org/links/employee/:employeeId`
- `GET /api/org/links/employee/:employeeId/home`
- `GET /api/org/links/employee/:employeeId/capacity`
- `POST /api/org/links`
- `PATCH /api/org/links/:id`
- `POST /api/org/links/:id/end`
- `POST /api/org/links/reassign-primary`
- `GET /api/org/tree`

---

## Token Planning

### TokenLedger

**File**: `packages/frontend/src/pages/TokenLedger.tsx`
**Route**: `/scenarios/:id/token-ledger`
**Feature Flag**: `token_planning_v1`
**Purpose**: Token-based supply/demand delta table with binding constraint visualization for TOKEN mode scenarios.

**Layout**:
- Header with scenario name and back link to planner
- Summary cards: total supply, total demand, net delta, binding constraints count
- Delta table: rows per skill pool showing supply tokens, demand tokens, delta, utilization %
  - Color-coded: green (surplus), red (deficit), yellow (near-binding)
- Binding constraints section: list of skill pools where demand >= supply
- "Derive Demand" button to auto-populate token demand from scope item estimates

**Hooks**:
- `useScenario` — scenario metadata
- `useTokenLedger` — ledger summary (supply, demand, deltas, constraints)
- `useDeriveTokenDemand` — trigger demand derivation from scope items
- `useFeatureFlag('token_planning_v1')` — gate access

**API Endpoints**:
- `GET /api/scenarios/:id`
- `GET /api/scenarios/:id/token-ledger`
- `POST /api/scenarios/:id/derive-token-demand`

---

## Forecasting

### FlowForecast

**File**: `packages/frontend/src/pages/FlowForecast.tsx`
**Route**: `/forecast`
**Feature Flag**: `flow_forecast_v1` (page access), `forecast_mode_b` (Mode B tab)
**Purpose**: Monte Carlo simulation for initiative delivery forecasting with two modes.

**Layout**:
- Header with title and data quality indicator
- 2 tabs:
  - **Scope-Based (Mode A)**: Monte Carlo simulation using P50/P90 estimates and period capacity
    - Controls: scenario selector, initiative multi-select, simulation count (100-10000), percentile levels
    - Results: percentile table (P10, P25, P50, P75, P90), duration distribution chart, per-initiative breakdown
  - **Empirical (Mode B)**: Bootstrap from historical cycle times (requires `forecast_mode_b` flag)
    - Controls: org node selector, initiative multi-select, simulation count
    - Results: same percentile table and chart format, low-confidence warnings
- Past runs table with pagination, expandable to see full results
- Data quality assessment panel: score (0-100), confidence level, breakdown (estimates, distributions, history)

**Hooks**:
- `useFeatureFlag('flow_forecast_v1')` — page access gate
- `useFeatureFlag('forecast_mode_b')` — Mode B tab visibility
- `useScenarios` — scenario selector options
- `useInitiatives` — initiative selector options
- `useRunScopeBasedForecast` — trigger Mode A simulation
- `useRunEmpiricalForecast` — trigger Mode B simulation
- `useDataQuality` — data quality assessment
- `useForecastRuns` — past forecast runs with pagination

**API Endpoints**:
- `POST /api/forecast/scope-based`
- `POST /api/forecast/empirical`
- `GET /api/forecast/data-quality`
- `GET /api/forecast/runs`
- `GET /api/forecast/runs/:id`

---

### DeliveryForecast

**File**: `packages/frontend/src/pages/DeliveryForecast.tsx`
**Route**: `/delivery`
**Purpose**: Initiative delivery health overview by quarter with progress tracking.

**Layout**:
- Header with title ("Delivery Forecast")
- Quarter selector tabs
- Initiative table: name, status badge, progress bar, delivery health badge (ON_TRACK, AT_RISK, BEHIND, BLOCKED)
- Summary stats: on track count, at risk count, behind count

**Hooks**:
- `useInitiatives` — initiative list with delivery health data

**API Endpoints**:
- `GET /api/initiatives` (with delivery health fields)

---

## Organization

### OrgTreeAdmin

**File**: `packages/frontend/src/pages/OrgTreeAdmin.tsx`
**Route**: `/admin/org-tree`
**Purpose**: Organization structure management with tree visualization, node details, and approval policy configuration.

**Layout**:
- Split panel (1/3 + 2/3):
  - **Left panel**: interactive org tree with expand/collapse, add child node button, search
  - **Right panel** (on node select):
    - Node details: name, type (DIVISION, DEPARTMENT, TEAM, SQUAD, CHAPTER, TRIBE, GUILD, PRACTICE), manager
    - Members list with add/remove
    - Approval policies section: list of policies with add/delete, policy configuration
- Coverage stats cards: nodes with managers, nodes with policies, member coverage %

**Hooks**:
- `useOrgTree` — full tree data
- `useOrgNode` — single node details
- `useCoverageReport` — coverage statistics
- `useCreateNode` — create child node
- `useDeleteNode` — delete node
- `useMemberships` — node members
- `useNodePolicies` — approval policies for node
- `useCreatePolicy` — add policy
- `useDeletePolicy` — remove policy

**API Endpoints**:
- `GET /api/org/tree`
- `GET /api/org/nodes/:id`
- `POST /api/org/nodes`
- `DELETE /api/org/nodes/:id`
- `GET /api/org/nodes/:id/memberships`
- `GET /api/org/nodes/:id/approval-policies`
- `POST /api/org/approval-policies`
- `DELETE /api/org/approval-policies/:id`
- `GET /api/org/coverage-report`

---

### OrgCapacity

**File**: `packages/frontend/src/pages/OrgCapacity.tsx`
**Route**: `/org-capacity`
**Feature Flag**: `org_capacity_view`
**Purpose**: Org-level capacity and demand gap analysis with heatmap visualization.

**Layout**:
- Org tree selector (left sidebar or dropdown)
- Scenario selector
- Gap heatmap table: rows per skill, columns per period, cells colored by shortage/overallocation
- Summary cards: total capacity, total demand, net gap, overallocated count

**Hooks**:
- `useOrgTree` — org tree for selector
- `useScenarios` — scenario selector
- `useFeatureFlag('org_capacity_view')` — gate access
- `useOrgCapacity` — capacity/demand gap data

**API Endpoints**:
- `GET /api/org/tree`
- `GET /api/scenarios`
- `GET /api/org/capacity` (with orgNodeId and scenarioId params)

---

## Intake

### IntakeList

**File**: `packages/frontend/src/pages/IntakeList.tsx`
**Route**: `/intake`
**Purpose**: Jira-sourced intake items list for triage and intake request creation.

**Layout**:
- Header with title and stats summary
- Filter bar: search, status filter, priority filter, linked/unlinked filter
- Sortable table: key, summary, status, priority, assignee, linked initiative, actions
- Create intake request modal (from selected Jira item)

**Hooks**:
- `useIntakeItems` — intake items with filters
- `useIntakeStats` — summary statistics

**API Endpoints**:
- `GET /api/intake/items`
- `GET /api/intake/stats`

---

### IntakeRequestList

**File**: `packages/frontend/src/pages/IntakeRequestList.tsx`
**Route**: `/intake-requests`
**Purpose**: Intake pipeline management with status workflow tracking.

**Layout**:
- Header with title and pipeline stats
- Status filter tabs or badges: DRAFT, TRIAGE, ASSESSED, APPROVED, CONVERTED, CLOSED
- Request table: title, requester, urgency (color-coded), status badge, created date, actions
- Pipeline stats summary cards

**Hooks**:
- `useIntakeRequests` — intake request list
- `useIntakeRequestStats` — request statistics
- `usePipelineStats` — pipeline stage counts

**API Endpoints**:
- `GET /api/intake/requests`
- `GET /api/intake/requests/stats`
- `GET /api/intake/pipeline-stats`

---

### IntakeRequestDetail

**File**: `packages/frontend/src/pages/IntakeRequestDetail.tsx`
**Route**: `/intake-requests/:id`
**Purpose**: Detailed view of a single intake request with status transitions and conversion to initiative.

**Layout**:
- Header with title, status badge, and status transition buttons
- Detail fields: requester, urgency, description, linked Jira items, notes
- Notes section with inline editing
- Status transition confirmation modal
- "Convert to Initiative" modal with field mapping

**Hooks**:
- `useIntakeRequest` — single intake request
- `useTransitionIntakeRequestStatus` — status transitions
- `useUpdateIntakeRequest` — edit request fields/notes
- `useDeleteIntakeRequest` — delete request

**API Endpoints**:
- `GET /api/intake/requests/:id`
- `PATCH /api/intake/requests/:id/status`
- `PATCH /api/intake/requests/:id`
- `DELETE /api/intake/requests/:id`
- `POST /api/intake/requests/:id/convert`

---

## Reports

### Reports (Page)

**File**: `packages/frontend/src/pages/Reports.tsx`
**Route**: `/reports`
**Purpose**: Dashboard with portfolio analytics, skill gap analysis, and scenario comparison.

**Layout**:
- Stats cards with sparkline charts: total initiatives, active count, completion rate, resource utilization
- Skill gaps heatmap: skills vs demand/supply analysis
- Overallocated people table: employees allocated > 100%
- Scenario comparison section with scenario selector

**Hooks**:
- None (currently uses mock data)
- Uses `Select` UI component for scenario filtering

**API Endpoints**:
- None (mock data)

**Note**: This page currently displays mock/placeholder data and is not connected to live API endpoints.

---

## Administration

### FeatureFlagsAdmin

**File**: `packages/frontend/src/pages/FeatureFlagsAdmin.tsx`
**Route**: `/admin/feature-flags`
**Permission**: `feature-flag:admin`
**Purpose**: Admin page for managing feature flag states.

**Layout**:
- Header with title
- Table: flag key, description, enabled toggle switch, last modified date
- Toggle switches for instant enable/disable

**Hooks**:
- `useFeatureFlags` — list all flags
- `useUpdateFeatureFlag` — toggle flag state

**API Endpoints**:
- `GET /api/feature-flags`
- `PATCH /api/feature-flags/:id`

---

### JobProfilesAdmin

**File**: `packages/frontend/src/pages/JobProfilesAdmin.tsx`
**Route**: `/admin/job-profiles`
**Feature Flag**: `job_profiles`
**Purpose**: Job profile management with skill requirements and cost band configuration.

**Layout**:
- Header with title and "New Profile" button
- Table: profile name, level, skill count, cost band, actions
- Create/Edit modal:
  - Profile fields: name, level, description
  - Skills editor: add/remove skills with proficiency levels
  - Cost band: hourly rate, currency

**Hooks**:
- `useJobProfiles` — list profiles
- `useCreateJobProfile` — create
- `useUpdateJobProfile` — update
- `useDeleteJobProfile` — delete
- `useFeatureFlag('job_profiles')` — gate access

**API Endpoints**:
- `GET /api/job-profiles`
- `POST /api/job-profiles`
- `PATCH /api/job-profiles/:id`
- `DELETE /api/job-profiles/:id`

---

### Approvals

**File**: `packages/frontend/src/pages/Approvals.tsx`
**Route**: `/approvals`
**Purpose**: Approval workflow management with inbox, submitted requests, and chain visualization.

**Layout**:
- 2 sections:
  - **Approver Inbox**: pending approval requests assigned to current user, with approve/reject actions
  - **My Requests**: requests submitted by current user, with status tracking and cancel action
- Approval chain visualization: step progression showing each approver, their decision, and timestamps

**Hooks**:
- `useApproverInbox` — pending approvals for current user
- `useMyRequests` — requests submitted by current user
- `useApprovalRequest` — single request details
- `useSubmitDecision` — approve or reject
- `useCancelRequest` — cancel own request

**API Endpoints**:
- `GET /api/approvals/inbox`
- `GET /api/approvals/my-requests`
- `GET /api/approvals/requests/:id`
- `POST /api/approvals/requests/:id/decision`
- `POST /api/approvals/requests/:id/cancel`

---

### AuthoritiesAdmin

**File**: `packages/frontend/src/pages/AuthoritiesAdmin.tsx`
**Route**: `/admin/authorities`
**Permission**: `authority:admin`
**Purpose**: Authority and permission management with role mapping, access testing, drift detection, and audit logging.

**Layout**:
- 5 tabs:
  - **Registry**: authority definitions table with CRUD
  - **Role Mapping**: role-to-authority assignment matrix
  - **Test Access**: test effective permissions for a user/role combination
  - **Drift Detection**: detect mismatches between expected and actual permissions
  - **Audit Log**: permission change history with filters

**Hooks**:
- `useAuthorities` — authority definitions
- `useRoleMapping` — role-authority mappings
- `useAuthorityDrift` — drift detection results
- `useEffectivePermissions` — test access results
- `useAuthorityAuditLog` — audit history
- `useUpdateAuthority` — update authority definitions

**API Endpoints**:
- `GET /api/authorities`
- `PATCH /api/authorities/:id`
- `GET /api/authorities/role-mapping`
- `POST /api/authorities/test-access`
- `GET /api/authorities/drift`
- `GET /api/authorities/audit-log`

---

### UsersAdmin

**File**: `packages/frontend/src/pages/UsersAdmin.tsx`
**Route**: `/admin/users`
**Permission**: `authority:admin`
**Purpose**: User management, licensing oversight, and Auth0 synchronization.

**Layout**:
- 3 tabs:
  - **Users**: user table with name, email, role, status, actions (edit, deactivate)
  - **Licensing**: entitlement summary cards, entitlements table, usage metrics
  - **Auth0 Sync**: sync status, bulk sync all, individual user sync, sync history

**Hooks**:
- `useUsers` — user list
- `useCreateUser` — create user
- `useUpdateUser` — edit user
- `useDeactivateUser` — deactivate user
- `useEntitlementSummary` — licensing summary
- `useEntitlements` — entitlement details
- `useSyncRoles` — sync role definitions
- `useSyncAllUsers` — bulk Auth0 sync
- `useSyncUser` — individual user sync

**API Endpoints**:
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `POST /api/users/:id/deactivate`
- `GET /api/entitlements/summary`
- `GET /api/entitlements`
- `POST /api/auth/sync-roles`
- `POST /api/auth/sync-all`
- `POST /api/auth/sync/:id`

---

### RevOpsAdmin

**File**: `packages/frontend/src/pages/RevOpsAdmin.tsx`
**Route**: `/admin/revops`
**Permission**: `authority:admin`
**Purpose**: Revenue operations dashboard with usage analytics and entitlement event tracking.

**Layout**:
- Signal cards: licensed users, utilization %, blocked attempts, current tier
- Entitlement event log: timestamped list of entitlement-related events (grants, revocations, tier changes)
- Filters for event log: date range, event type

**Hooks**:
- `useRevOpsSummary` — summary metrics
- `useRevOpsEvents` — event log

**API Endpoints**:
- `GET /api/revops/summary`
- `GET /api/revops/events`

---

## Integration

### JiraSettings

**File**: `packages/frontend/src/pages/JiraSettings.tsx`
**Route**: `/admin/jira-settings`
**Purpose**: Jira integration configuration with OAuth connections, site/project selection, and sync management.

**Layout**:
- Connection section: OAuth connect/disconnect buttons, connection status
- Site selection: list of available Jira sites with checkboxes
- Project selection: list of projects within selected sites with checkboxes
- Sync section: last sync timestamp, sync status, trigger manual sync button, sync history table

**Hooks**:
- `useJiraConnections` — connection status
- `useConnectJira` — initiate OAuth flow
- `useDisconnectJira` — disconnect
- `useJiraSites` — available sites
- `useSelectSites` — save site selection
- `useJiraProjects` — projects in selected sites
- `useSelectProjects` — save project selection
- `useSyncStatus` — current sync status
- `useSyncRuns` — sync history
- `useTriggerSync` — manual sync trigger

**API Endpoints**:
- `GET /api/jira/connections`
- `POST /api/jira/connect`
- `POST /api/jira/disconnect`
- `GET /api/jira/sites`
- `POST /api/jira/sites/select`
- `GET /api/jira/projects`
- `POST /api/jira/projects/select`
- `GET /api/jira/sync/status`
- `GET /api/jira/sync/runs`
- `POST /api/jira/sync/trigger`

---

## Auth

### Unauthorized

**File**: `packages/frontend/src/pages/Unauthorized.tsx`
**Route**: `/unauthorized` (outside protected layout)
**Purpose**: Access denied page shown when a user lacks required permissions.

**Layout**:
- Centered message: "Access Denied" heading with explanation text
- Link back to `/initiatives`

**Hooks**: None
**API Endpoints**: None
