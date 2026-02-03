# Scenarios

Resource allocation planning through what-if modeling. Scenarios let users create, compare, and lock quarterly staffing plans by assigning employees to initiatives, analyzing capacity gaps, and promoting a single plan to "primary" status.

---

## Screens

### Scenarios List (`/scenarios`)

The landing page for scenario management. Scenarios are organized into three collapsible quarter sections.

**Layout:**
- Page header with "New Scenario" button
- Next-quarter countdown bar (red if <=14 days, amber if <=30 days, blue otherwise)
- Three quarter sections:
  - **Last Quarter** (collapsed by default)
  - **Current Quarter** (expanded, accent-highlighted border)
  - **Next Quarter** (expanded)
- Quick Comparison table at the bottom (current quarter only)

**Scenario Cards** display within each quarter section in a responsive grid (1-4 columns). Each card shows:
- Scenario name
- Status badge (DRAFT / REVIEW / APPROVED / LOCKED)
- Primary badge (gold star) if the scenario is the primary plan for its quarter
- Allocation count
- Lock date (if locked)
- Last updated timestamp
- Hover action: "Set as Primary" button

A dashed-border "New Scenario" card appears at the end of each section.

**Quick Comparison Table** (current quarter only) shows all scenarios side by side:
| Column | Description |
|--------|-------------|
| Primary | Star icon if primary |
| Name | Link to planner |
| Status | Badge |
| Allocations | Count |
| Updated | Date |

### Scenario Planner (`/scenarios/:id`)

The main planning workspace. A three-panel drag-and-drop interface.

**Header bar:**
- Back link to `/scenarios`
- Scenario name + period label (e.g. "2026-Q1 -- Strategic Initiative")
- Status badge + primary badge
- Summary stats pills: Demand, Available, Allocated, Utilization %, Gap count
- Action buttons: Assumptions, Compare, Save Version, Export, Help, Set Primary, Status Transition

**Left Panel** (420px default, resizable 320-600px) -- Initiative Rankings:
- Search input with debounce
- "Approved only" checkbox filter (shows RESOURCING and IN_EXECUTION statuses)
- Drag-and-drop sortable initiative cards with dnd-kit
- Each card shows: rank number, title, lock icon, shortage warning, quarter badge, hours badge, status badge, origin badge, drag handle
- Click a card to select it and open the initiative-focused allocation panel

**Right Panel** -- Capacity Visualization with three tabs:
1. **By Quarter**: Weekly stacked bar chart (13 weeks). Capacity background + demand overlay. Bars colored red (shortage), amber (tight), green (ok). Hover tooltip with week dates, capacity, demand, gap.
2. **By Skill**: Horizontal bars per skill. Shows demand/capacity hours, utilization %, and gap indicator.
3. **By Team**: Card grid with SVG gauge arcs showing utilization. Displays capacity, demand, gap, and status text ("Over capacity" / "Near limit" / "Available").

**Bottom Panel** (280px default, collapsible) -- Allocation Editor with two modes:
1. **All Allocations**: Table of every allocation in the scenario. Columns: Employee (avatar + name), Initiative, Type (PROJECT/RUN/SUPPORT), Start, End, %, Status, Actions. Inline-editable dates and percentages. Overallocation warning icon when employee total > 100%. Delete button per row.
2. **Initiative-Focused**: Filtered to the selected initiative. Same table plus an "Add Allocation" form at the bottom (employee dropdown, start/end dates, percentage). Close button returns to all-allocations view.

**Read-Only Banners** appear when:
- LOCKED: Amber banner -- "This scenario is locked. All editing is disabled."
- APPROVED: Green banner -- "This scenario is approved. Return to Review to make changes."
- No permission: Gray banner -- "You do not have permission to edit this scenario."

---

## Users & Roles

| Role | Can View | Can Edit Allocations | Can Transition Status | Can Set Primary | Can Force-Unlock |
|------|----------|---------------------|----------------------|-----------------|------------------|
| ADMIN | Yes | Yes (DRAFT/REVIEW) | Yes | Yes | Yes (LOCKED -> DRAFT) |
| PRODUCT_OWNER | Yes | Yes (DRAFT/REVIEW) | Yes | Yes | No |
| BUSINESS_OWNER | Yes | Yes (DRAFT/REVIEW) | Yes | Yes | No |
| RESOURCE_MANAGER | Yes | No | No | No | No |
| VIEWER | Yes | No | No | No | No |

Editing is further restricted by scenario status:
- **DRAFT**: Full editing (allocations, priorities, assumptions, name)
- **REVIEW**: Full editing (same as DRAFT)
- **APPROVED**: Name editable; allocations, priorities, and assumptions are locked
- **LOCKED**: Nothing editable (immutable)

---

## Workflows

### Scenario Status Workflow

```
          +--------+
          | DRAFT  |<--------+
          +--------+         |
              |              |
   Submit for Review    Return to Draft
              |              |
              v              |
          +--------+         |
          | REVIEW |---------+
          +--------+
              |              |
           Approve     Return to Review
              |              |
              v              |
          +----------+       |
          | APPROVED |-------+
          +----------+
              |
             Lock
              |
              v
          +--------+
          | LOCKED |-----> (ADMIN only: force to DRAFT)
          +--------+
```

**Transition side effects:**
- **-> LOCKED**: Sets `planLockDate` to now. Auto-sets `isPrimary` if no other primary exists for the quarter. If scenario type is BASELINE, captures an immutable `BaselineSnapshot` of all capacity, demand, and allocation data.

### Create Scenario

1. User clicks "New Scenario" from the list page or within a quarter section.
2. Modal opens with fields: Name (required), Quarter selector, optional Clone Source.
3. If cloning, user picks which data to carry over: Project allocations, Run/Support allocations, Priority rankings.
4. Scenario created as DRAFT. Cloned allocations have dates adjusted to the target quarter (clamped to quarter boundaries).

### Priority Ranking

1. User drags initiative cards up/down in the left panel of the Scenario Planner.
2. On drag end, new priority order is sent to the API (`PUT /scenarios/:id/priorities`).
3. Background job enqueued to recompute capacity-demand analysis.
4. Priority rank is used by auto-allocate to determine allocation order.

### Allocation Management

1. User selects an initiative card (or uses the "all allocations" view).
2. Allocations are created via the "Add Allocation" form or the Add Allocation modal: employee, initiative (optional), allocation type, start/end dates, percentage.
3. Inline editing: click any date or percentage cell to edit in place. Enter saves, Escape cancels.
4. Delete: click the trash icon on a row.
5. Each change triggers a background recompute job and invalidates the calculator cache.

**Allocation guards:**
- Scenario must be in DRAFT or REVIEW status.
- Allocation dates must fall within the scenario's quarter boundaries.
- Initiatives in RESOURCING, IN_EXECUTION, or COMPLETE status cannot have allocations added or modified.

### Auto-Allocate

1. User clicks "Auto-allocate" button in the bottom panel.
2. System computes proposed allocations using a greedy algorithm:
   - Iterates initiatives in priority rank order.
   - For each required skill, finds employees with that skill sorted by proficiency (highest first).
   - Allocates remaining employee capacity up to `maxAllocationPercentage`.
3. Preview modal shows: summary stats, coverage by initiative (with per-skill breakdown), proposed allocation table, and any warnings.
4. User reviews and clicks "Apply" to commit. This replaces all existing allocations in the scenario with the proposed set (transaction).

### Set Primary

1. User clicks the star icon on a scenario card (list page) or the "Set Primary" button (planner page).
2. Transaction: all other scenarios for the same quarter have `isPrimary` unset; the target scenario gets `isPrimary = true`.
3. The primary scenario's locked allocations are treated as "actual" allocations in initiative views (vs. "proposed" from non-primary scenarios).

### Clone Scenario

1. User creates a new scenario and selects a clone source.
2. System copies allocations from the source to the new scenario:
   - Allocation dates are offset to the target quarter and clamped to quarter bounds.
   - `AllocationPeriod` junction rows are recomputed for the new dates.
   - Filtering options control which allocation types (PROJECT, RUN/SUPPORT) and whether priority rankings are copied.
3. New scenario starts as DRAFT.

### Revision (from Locked Baseline)

1. For a LOCKED BASELINE scenario, an authorized user can create a REVISION.
2. A reason is required: CRITICAL, COMPLIANCE, PRODUCTION_OUTAGE, or EXEC_DIRECTIVE.
3. System clones all allocations from the baseline into a new DRAFT REVISION scenario (same quarter, same dates).
4. `needsReconciliation` is set to true on the revision.
5. User edits the revision as needed, then locks it.
6. Reconciliation can be marked complete via `PUT /scenarios/:id/reconcile`.

### Scenario Comparison

1. User clicks "Compare" in the planner header.
2. Selects 2+ scenarios for comparison.
3. System returns side-by-side metrics: total demand, total capacity, utilization %, capacity gaps by skill.

### Guided Tour

1. User clicks the "?" (Help) button in the planner header.
2. Three-step overlay walks through: Initiative Rankings panel, Capacity Visualization panel, Allocation Editor panel.
3. Step indicators, Skip, and Next buttons navigate the tour.

---

## Data Model

### Core Entities

```
Scenario
  id              UUID (PK)
  name            String
  periodId        UUID (FK -> Period, QUARTER only)
  status          ScenarioStatus (DRAFT | REVIEW | APPROVED | LOCKED)
  isPrimary       Boolean (default false)
  planLockDate    DateTime? (set when LOCKED)
  assumptions     JSON? (see Assumptions below)
  priorityRankings JSON? (Array<{initiativeId, rank}>)
  version         Int (default 1)
  scenarioType    ScenarioType (BASELINE | REVISION | WHAT_IF)
  revisionOfScenarioId UUID? (FK -> Scenario, self-ref for revisions)
  revisionReason  RevisionReason? (CRITICAL | COMPLIANCE | PRODUCTION_OUTAGE | EXEC_DIRECTIVE)
  changeLog       String?
  needsReconciliation Boolean (default false)
  createdAt       DateTime
  updatedAt       DateTime
```

```
Allocation
  id              UUID (PK)
  scenarioId      UUID (FK -> Scenario)
  employeeId      UUID (FK -> Employee)
  initiativeId    UUID? (FK -> Initiative, null = unallocated capacity)
  allocationType  AllocationType (PROJECT | RUN | SUPPORT)
  startDate       Date
  endDate         Date
  percentage      Float (0-100, default 100)
  createdAt       DateTime
  updatedAt       DateTime
```

```
AllocationPeriod (junction table)
  allocationId    UUID (PK/FK -> Allocation, cascade delete)
  periodId        UUID (PK/FK -> Period)
  hoursInPeriod   Float (calculated: hoursPerQuarter * overlapRatio * percentage/100)
  overlapRatio    Float (0.0-1.0, temporal overlap with the period)
```

```
BaselineSnapshot
  id              UUID (PK)
  scenarioId      UUID (unique FK -> Scenario)
  snapshotDate    DateTime
  capacitySnapshot  JSON (employees with hoursAvailable, skills)
  demandSnapshot    JSON (initiative skill demands with distributions)
  allocationSnapshot JSON (all allocations with calculated hours)
  summarySnapshot   JSON (aggregate stats)
  createdAt       DateTime
```

### Enums

| Enum | Values |
|------|--------|
| ScenarioStatus | DRAFT, REVIEW, APPROVED, LOCKED |
| ScenarioType | BASELINE, REVISION, WHAT_IF |
| AllocationType | PROJECT, RUN, SUPPORT |
| RevisionReason | CRITICAL, COMPLIANCE, PRODUCTION_OUTAGE, EXEC_DIRECTIVE |

### Assumptions Object (JSON)

```json
{
  "allocationCapPercentage": 100,
  "bufferPercentage": 0,
  "proficiencyWeightEnabled": true,
  "includeContractors": true,
  "hoursPerPeriod": 520
}
```

Defaults shown. `hoursPerPeriod` = 40 hrs/week * 13 weeks.

### Relationships

```
Scenario (aggregate root)
  |-- Period (1:1, required, QUARTER type only)
  |-- Allocation[] (1:N, cascade delete)
  |     |-- Employee (N:1, required)
  |     |     |-- Skill[] (employee's skills used for capacity calc)
  |     |     |-- CapacityCalendar[Period] (hours available per period)
  |     |-- Initiative? (N:1, optional, null = unallocated)
  |     |     |-- ScopeItem[] (skill demands + period distributions)
  |     |-- AllocationPeriod[] (1:N, junction for period-hour mapping)
  |-- BaselineSnapshot? (1:1, only for LOCKED BASELINE scenarios)
  |-- DriftAlert[] (1:N, deviation monitoring from snapshot)
  |-- revisions: Scenario[] (self-ref, REVISION type child scenarios)
```

---

## API Endpoints

### Scenario CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scenarios` | List scenarios. Query: `page`, `limit`, `periodIds` (comma-separated UUIDs) |
| GET | `/api/scenarios/:id` | Get scenario with period metadata and allocation count |
| POST | `/api/scenarios` | Create DRAFT scenario. Body: `name`, `periodId`, `assumptions?`, `priorityRankings?`, `scenarioType?` |
| PUT | `/api/scenarios/:id` | Update scenario (blocked if LOCKED). Body: `name?`, `assumptions?`, `priorityRankings?` |
| DELETE | `/api/scenarios/:id` | Delete scenario (blocked if LOCKED). Cascades to allocations. |

### Status & Primary

| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/scenarios/:id/status` | Transition status. Body: `{ status }`. Validates transition rules. |
| PUT | `/api/scenarios/:id/primary` | Set as primary for its quarter (unsets others in same quarter). |

### Cloning & Revisions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/scenarios/:id/clone` | Clone to target quarter. Body: `name`, `targetPeriodId`, `includeProjectAllocations?`, `includeRunSupportAllocations?`, `includePriorityRankings?` |
| POST | `/api/scenarios/:id/revision` | Create REVISION from LOCKED BASELINE. Body: `reason`, `name?`, `changeLog?` |
| PUT | `/api/scenarios/:id/reconcile` | Mark REVISION as reconciled (`needsReconciliation = false`). |

### Priority Rankings

| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/scenarios/:id/priorities` | Update initiative rankings. Body: `{ priorities: [{initiativeId, rank}] }`. Blocked if LOCKED/APPROVED. |

### Allocations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scenarios/:id/allocations` | List all allocations in the scenario with employee/initiative details. |
| GET | `/api/scenarios/:id/initiatives/:initiativeId/allocations` | List allocations for a specific initiative in the scenario. |
| POST | `/api/scenarios/:id/allocations` | Create allocation. Body: `employeeId`, `initiativeId?`, `allocationType?`, `startDate`, `endDate`, `percentage?`. Scenario must be DRAFT/REVIEW. |
| PUT | `/api/allocations/:id` | Update allocation. Body: `initiativeId?`, `startDate?`, `endDate?`, `percentage?` |
| DELETE | `/api/allocations/:id` | Delete allocation. Scenario must be DRAFT/REVIEW. |

### Analysis & Calculation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scenarios/:id/capacity-demand` | Simple capacity vs demand by skill. |
| GET | `/api/scenarios/:id/calculator` | Full calculation with caching. Query: `skipCache?`, `includeBreakdown?`. Returns demand/capacity/gaps/issues/summary. |
| POST | `/api/scenarios/:id/calculator/invalidate` | Clear cached calculation for this scenario. |
| GET | `/api/scenarios/compare` | Compare 2+ scenarios. Query: `scenarioIds` (comma-separated). Returns per-scenario metrics. |
| POST | `/api/scenarios/:id/auto-allocate` | Preview auto-allocations (no side effects). Body: `maxAllocationPercentage?`. Returns proposed allocations + coverage. |
| POST | `/api/scenarios/:id/auto-allocate/apply` | Apply proposed allocations (replaces all). Body: `proposedAllocations[]`. |

### Baseline Snapshots

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scenarios/:id/snapshot` | Retrieve baseline snapshot data. |
| GET | `/api/scenarios/:id/delta` | Compare live state vs baseline snapshot. |
| GET | `/api/scenarios/:id/revision-delta` | Compare revision vs its parent baseline. |

---

## Functions & Business Logic

### Capacity-Demand Calculation

The `ScenarioCalculatorService` performs the full analysis pipeline:

1. **Load data**: Scenario with allocations, employees with skills, capacity calendars, initiative scope items.
2. **Calculate demand**: Aggregates skill hours from scope items of RESOURCING and IN_EXECUTION initiatives, weighted by period distribution and priority rank.
3. **Calculate capacity**: Sums employee hours from `AllocationPeriod` junction rows. Applies assumptions:
   - `allocationCapPercentage`: Caps total allocation per employee.
   - `bufferPercentage`: Reduces effective capacity by a safety margin.
   - `proficiencyWeightEnabled`: Weights capacity by `skill.proficiency / 5`.
   - `includeContractors`: Whether to include contractor employees.
   - `hoursPerPeriod`: Base hours per quarter (default 520).
4. **Gap analysis**: `gap = capacity - demand` per skill per period. Calculates utilization percentage.
5. **Issue detection**:
   - **Shortages**: Skills where demand exceeds capacity. Severity: critical (>=50% shortfall), high (>=30%), medium (>=15%), low (<15%).
   - **Overallocations**: Employees with >100% allocation in a period.
   - **Skill mismatches**: Employees assigned to initiatives requiring skills they don't have.
6. **Caching**: Results cached in Redis for 24 hours. Cache key: `scenario:calculation:{scenarioId}`. Invalidated on allocation/priority/scope changes.

### Net Effective Capacity (Frontend)

Used in the planner header stats:

```
gross = (hoursPerWeek / 5) * workingDays
holidays = count(holidays on weekdays) * (totalWeeklyHours / 5)
net = gross - holidays
effective = net * (1 - ktloPercentage) * (1 - meetingOverheadPercentage)
```

### Auto-Allocate Algorithm

Greedy priority-first allocation:

1. Fetch priority rankings (error if empty).
2. Build a skill-to-employee index, employees sorted by proficiency descending.
3. For each initiative in priority order:
   - For each required skill from scope items:
     - Find matching employees with remaining capacity.
     - Allocate greedily: highest proficiency first, up to `maxAllocationPercentage`.
     - Track coverage (allocated hours / demand hours) per skill.
   - Compute overall coverage percentage for the initiative.
4. Return: proposed allocations, coverage by initiative, warnings, and summary stats.

### AllocationPeriod Computation

When an allocation is created or updated, `computeAllocationPeriods()` maps the date range to quarter periods:

```
For each overlapping QUARTER period:
  overlapStart = max(allocationStart, periodStart)
  overlapEnd = min(allocationEnd, periodEnd)
  overlapDays = businessDays(overlapStart, overlapEnd)
  totalDays = businessDays(periodStart, periodEnd)
  overlapRatio = overlapDays / totalDays
  hoursInPeriod = hoursPerQuarter * overlapRatio * (percentage / 100)
```

Creates `AllocationPeriod` junction rows linking the allocation to each overlapping period.

### Clone Date Adjustment

When cloning allocations to a different quarter:

```
dayOffset = targetQuarterStart - sourceQuarterStart
newStart = clamp(allocationStart + dayOffset, targetQuarterStart, targetQuarterEnd)
newEnd = clamp(allocationEnd + dayOffset, targetQuarterStart, targetQuarterEnd)
```

### Actual vs Proposed Distinction

In initiative list views:
- **Actual allocations**: From scenarios where `status = LOCKED` AND `isPrimary = true`.
- **Proposed allocations**: From all other scenarios (DRAFT, REVIEW, APPROVED, or non-primary LOCKED).

This distinction drives the "Actual hours" and "Proposed hours" columns on the Initiatives List page and the split in the Assignments tab on Initiative Detail.

### Background Jobs

| Queue | Job | Trigger | Behavior |
|-------|-----|---------|----------|
| `scenario-recompute` | `processScenarioRecompute` | Allocation create/update/delete, priority change, scope change | Invalidates cache, recalculates full analysis. Deduped by `recompute-{scenarioId}`. 3 retries with exponential backoff. |
| `view-refresh` | (scheduler) | Every 15 minutes or on-demand | Refreshes materialized views for reporting. |

---

## Validation Rules

### Scenario Creation
- `name`: 1-255 characters, required.
- `periodId`: Must reference an existing Period with `granularity = QUARTER`.
- `scenarioType`: BASELINE, REVISION, or WHAT_IF (default WHAT_IF).
- `assumptions`: Optional JSON object.
- `priorityRankings`: Optional array of `{initiativeId: UUID, rank: positive integer}`.

### Allocation Creation
- `employeeId`: Required, must exist.
- `initiativeId`: Optional UUID or null (null = unallocated capacity).
- `allocationType`: PROJECT (default), RUN, or SUPPORT.
- `startDate`, `endDate`: Required dates where `startDate <= endDate`.
- `percentage`: 0-100 (default 100).
- **Guard**: Scenario must be DRAFT or REVIEW.
- **Guard**: Dates must fall within the scenario's quarter boundaries.
- **Guard**: Initiative (if provided) must not be in RESOURCING, IN_EXECUTION, or COMPLETE status.

### Status Transitions
- DRAFT -> REVIEW
- REVIEW -> DRAFT, APPROVED
- APPROVED -> REVIEW, LOCKED
- LOCKED -> DRAFT (ADMIN only)
- All other transitions are rejected.

### Revision Creation
- Source scenario must be LOCKED with `scenarioType = BASELINE`.
- `reason` is required (CRITICAL, COMPLIANCE, PRODUCTION_OUTAGE, EXEC_DIRECTIVE).
- `name`: Optional, 1-255 characters.
- `changeLog`: Optional, max 2000 characters.
