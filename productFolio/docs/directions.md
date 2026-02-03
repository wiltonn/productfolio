# ProductFolio: Statuses, Resource Assignment, and Scenarios

## Initiative Statuses

Every initiative follows a linear lifecycle with escape hatches at each stage:

```
PROPOSED --> SCOPING --> RESOURCING --> IN_EXECUTION --> COMPLETE
    |           |           |              |
    +-----+-----+-----+-----+--- ON_HOLD --+
    |           |           |              |
    +-----------+-----------+--------------+---> CANCELLED
```

### Status Definitions

| Status | Purpose |
|--------|---------|
| **PROPOSED** | Default starting state. The initiative idea exists but has no scope or resource plan. |
| **SCOPING** | Active sizing. Scope items are being added with skill demands and P50/P90 estimates. |
| **RESOURCING** | Scope is finalized. The initiative is visible in scenario demand calculations and ready for staff assignment. Allocations can still be modified at this stage. |
| **IN_EXECUTION** | Work is underway. Allocations remain locked. Still contributes to scenario demand. |
| **COMPLETE** | Terminal state. No further transitions allowed. |
| **ON_HOLD** | Pause state. Can resume to any prior stage (PROPOSED, SCOPING, RESOURCING, IN_EXECUTION). |
| **CANCELLED** | Terminal state. No further transitions allowed. |

### Transition Rules

- You can only move forward one step at a time on the main path.
- You can jump to ON_HOLD or CANCELLED from any non-terminal state.
- ON_HOLD can return to any earlier stage, making it the only state that allows backward movement.
- COMPLETE and CANCELLED are dead ends.

### What Each Status Unlocks

| Status | Scope editing | Shows in demand calcs | Allocation locked |
|--------|--------------|----------------------|-------------------|
| PROPOSED | Yes | No | No |
| SCOPING | Yes | No | No |
| RESOURCING | No | **Yes** | No |
| IN_EXECUTION | No | **Yes** | **Yes** |
| COMPLETE | No | No | **Yes** |

**Key takeaway:** Allocations remain editable through RESOURCING status. Once an initiative reaches IN_EXECUTION, its allocations are locked and cannot be modified.

---

## When Resources Can Be Assigned

Resource assignment (allocations) requires **three conditions** to be met simultaneously:

### 1. The Scenario Must Be Editable

Only scenarios in **DRAFT** or **REVIEW** status accept new or modified allocations.

| Scenario Status | Can modify allocations? |
|----------------|------------------------|
| DRAFT | Yes |
| REVIEW | Yes |
| APPROVED | **No** |
| LOCKED | **No** |

### 2. The Initiative Must Not Be Locked

Allocations cannot be created or modified for initiatives in IN_EXECUTION or COMPLETE status.

This means the typical flow is:
1. Create allocations while the initiative is in PROPOSED, SCOPING, or RESOURCING status
2. Transition the initiative to IN_EXECUTION (this locks the allocations in place)
3. Any further allocation changes require working within the scenario system

### 3. Dates Must Fall Within the Scenario's Quarter

Every scenario is tied to a specific quarter (Period). Allocation start and end dates must fall entirely within that quarter's boundaries.

### Allocation Data Model

Each allocation captures:

| Field | Description |
|-------|-------------|
| **employeeId** | Which team member (required) |
| **initiativeId** | Which initiative (optional -- null means unallocated capacity) |
| **allocationType** | PROJECT, RUN, or SUPPORT |
| **startDate / endDate** | When the assignment runs |
| **percentage** | 0-100, how much of the person's time (default: 100%) |

### How Hours Are Calculated

```
hoursInPeriod = hoursPerWeek x 13 x overlapRatio x (percentage / 100)
```

- `hoursPerWeek`: Employee's base weekly hours (default 40)
- `13`: Weeks in a quarter
- `overlapRatio`: Fraction of the allocation date range that overlaps with the period
- `percentage`: The allocation percentage

For effective capacity (what actually gets delivered):

```
effectiveHours = allocatedHours x (proficiency / 5) x bufferMultiplier x rampModifier
```

- `proficiency`: Employee skill rating 1-5 (optional weighting)
- `bufferMultiplier`: `1 - (bufferPercentage / 100)` from scenario assumptions
- `rampModifier`: Accounts for onboarding ramp-up time

### Auto-Allocate

The system can propose allocations automatically by:
1. Reading initiative priority rankings from the scenario
2. Matching employee skills to scope item skill demands
3. Preferring higher-proficiency employees for each skill
4. Allocating in priority order until capacity is exhausted
5. Returning a preview that you can review before applying

---

## How Scenarios Work

Scenarios are the core planning unit. Each scenario represents a **what-if staffing plan for a single quarter**.

### Scenario Lifecycle

```
DRAFT --> REVIEW --> APPROVED --> LOCKED
  ^         |
  +----<----+   (can return to DRAFT from REVIEW)
```

| Status | What you can do |
|--------|----------------|
| **DRAFT** | Full editing. Add/remove/modify allocations, change priorities, update assumptions. |
| **REVIEW** | Allocations can still be modified. Assumptions and priorities can be changed. Intended for stakeholder review. |
| **APPROVED** | Allocations frozen. Assumptions and priority rankings cannot be changed. Can return to REVIEW if changes are needed. |
| **LOCKED** | Fully immutable. No changes allowed. If it's a BASELINE type, a snapshot is captured at this point. |

### Scenario Types

| Type | Purpose |
|------|---------|
| **WHAT_IF** | Exploratory plan. Compare different staffing strategies. |
| **BASELINE** | The accepted plan. When locked, captures an immutable snapshot of capacity, demand, and allocations. |
| **REVISION** | Created from a locked BASELINE when mid-quarter changes are needed. Tracks a reason (CRITICAL, COMPLIANCE, PRODUCTION_OUTAGE, EXEC_DIRECTIVE) and changelog. |

### Primary Scenario

Each quarter has at most one **primary** scenario. This is the plan the organization is executing against. Any scenario can be promoted to primary (the previous primary is automatically demoted).

### What a Scenario Contains

- **Period**: The quarter it plans for (e.g., Q2 2025)
- **Allocations**: Employee-to-initiative assignments with dates and percentages
- **Priority Rankings**: Ordered list of initiatives by importance (affects demand calculations and auto-allocate)
- **Assumptions**: Configuration like buffer percentages, whether to weight by proficiency, contractor inclusion rules

### Capacity-Demand Analysis

The scenario calculator computes a full picture for each scenario:

1. **Demand**: Aggregated from scope items of RESOURCING and IN_EXECUTION initiatives, broken down by skill and period, weighted by priority rankings
2. **Capacity**: Aggregated from allocations, broken down by skill and period, adjusted for proficiency, buffer, and ramp
3. **Gap Analysis**: `gap = capacity - demand` per skill per period
4. **Issues detected**:
   - **Shortages**: Skills where demand exceeds capacity
   - **Overallocations**: Employees assigned more than 100% of their time
   - **Skill mismatches**: Employees allocated to initiatives requiring skills they don't have

Results are cached in Redis (24-hour TTL) and recomputed automatically via background jobs when allocations, priorities, or scope items change.

### Comparing Scenarios

You can compare multiple scenarios side-by-side to evaluate different staffing strategies before committing to one. The compare endpoint returns capacity, demand, and gap metrics for each scenario.

### Cloning Scenarios

Scenarios can be cloned to a different quarter. Options include:
- Whether to carry over PROJECT allocations
- Whether to carry over RUN/SUPPORT allocations
- Whether to carry over priority rankings

Allocation dates are automatically offset and clamped to fit the target quarter.

### Baseline Snapshots and Drift

When a BASELINE scenario is locked, the system captures an immutable snapshot of:
- All employee capacity by period
- All initiative demand by skill
- All allocations with calculated hours
- Summary totals

The **delta engine** can then compare the current live state against this snapshot to detect drift -- employee departures, scope changes, allocation modifications, etc. This powers the revision workflow: when reality diverges from the plan, create a REVISION to formally track the changes.

---

## Putting It All Together

A typical planning cycle:

1. **Propose initiatives** (status: PROPOSED)
2. **Scope them out** -- add scope items with skill demands and estimates (status: SCOPING)
3. **Create a scenario** for the target quarter (scenario status: DRAFT)
4. **Rank initiative priorities** within the scenario
5. **Assign employees** to initiatives (create allocations), or use auto-allocate for a starting point
6. **Review capacity-demand analysis** -- check for shortages, overallocations, and skill mismatches
7. **Iterate** -- try different what-if scenarios, compare them
8. **Promote the best scenario** to primary and transition it through REVIEW -> APPROVED -> LOCKED
9. **Transition initiatives** to RESOURCING (locks their allocations) and then IN_EXECUTION
10. **Monitor drift** against the baseline snapshot; create revisions if mid-quarter changes are needed
