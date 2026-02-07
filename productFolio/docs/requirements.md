# CohesionXL Planning Stack v1 — Requirements

## Purpose
Introduce a professional-grade planning stack that supports:
1) Org-scoped planning (who owns demand, where capacity lives)
2) Capability planning (skills + ramp remain the calculation truth)
3) Flow forecasting (probabilistic delivery dates, with honest fallbacks)
4) Finance/headcount views (job profiles + cost bands as a human layer)

This must be implemented without rewriting the existing scenario allocator.

---

## Non-Negotiable Invariants
- Existing allocation algorithm remains skill-based and unchanged.
- `ScopeItem.skillDemand` remains JsonB and continues to exist.
- All schema changes must be additive (no destructive migrations).
- All new UI and API functionality must be behind feature flags.
- The system must support partial/empty data (e.g., missing forecast history).

---

## Current System Facts (Source of Truth)
- Stack: Node/Fastify backend, React/Vite frontend, Prisma/Postgres.
- Demand:
  - `ScopeItem.skillDemand` JsonB: `{ "frontend": X, "backend": Y }`
  - `ScopeItem.estimateP50` / `estimateP90` are hours-based estimates (optional).
  - `ScopeItemPeriodDistribution` controls how a scope item is spread across periods.
- Supply:
  - `CapacityCalendar.hoursAvailable` is per `Employee` per `Period`.
  - `Skill` is per-employee capability: `Skill { employeeId, name, proficiency }`
- Scenarios:
  - `Scenario`, `Allocation`, `AllocationPeriod` compute per-period allocated hours and ramp modifiers.

---

## Scope (v1 Deliverables)

### A) Org Structure (Org-scoped planning)
**Goal:** enable “Engineering org capacity vs demand” views.

#### Data Model
Add:
- `OrgNode` (hierarchy/tree)
- `OrgAssignment` (employee ↔ org membership), supports:
  - `percent` (0–100) to support matrix orgs
  - `isPrimary` for “home org”

Add to Initiative:
- `owningOrgNodeId` (nullable FK) for “who owns demand”

#### Core Behaviors
- Ability to query employees in org node (optionally include children).
- Ability to query initiatives owned by org node (optionally include children).

### B) Capability Engine (skills remain truth)
**Goal:** compute org supply/demand/gaps by skill per period without changing allocator.

#### Supply Calculation (per OrgNode + Period)
- Employees in org, weighted by `OrgAssignment.percent` (default 100 if missing).
- Use `CapacityCalendar.hoursAvailable` for period.
- Bucket by employee skills: `Skill.name`.
- Output: `supplyBySkill: { [skillName]: hoursAvailableWeighted }`

> Note: In v1, supply is "available capacity". Future versions may subtract current allocations for net-free capacity.

#### Demand Calculation (per OrgNode + Period)
- Initiatives owned by org.
- For each initiative scope item:
  - Determine period distribution (from `ScopeItemPeriodDistribution`)
  - Use `skillDemand` values as "effort units" unless explicitly configured otherwise.
- Output: `demandBySkill: { [skillName]: effortUnitsWeighted }`

#### Gap Calculation
- `gapBySkill = demandBySkill - supplyBySkill` (align units)
- Must clearly label the unit in API responses (hours vs units).

### C) Job Profiles (human layer; optional translation)
**Goal:** consistent “roles” for reporting, hiring, and cost, without changing allocation.

#### Data Model
Add:
- `CostBand` (optional but recommended)
- `JobProfile`
- `JobProfileSkill` mapping: profile → skills with target proficiency/weights

Add to Employee:
- `jobProfileId` (nullable FK)

#### Behaviors
- CRUD JobProfile and JobProfileSkill.
- Reporting: headcount by JobProfile per OrgNode.

### D) Flow Forecasting (probabilistic dates, honest fallbacks)
**Goal:** deliver p50/p80 forecast dates by initiative/org portfolio.

#### Data Model
Add (minimal):
- `Initiative.startedAt` (nullable)
- `Initiative.completedAt` (nullable)

#### Forecast Modes
- Mode A (no history):
  - Uses `estimateP50/estimateP90` and period distributions + org capacity to output approximate p50/p80 dates.
  - Must label output as Mode A.
- Mode B (has history):
  - Uses cycle time distribution from initiatives with startedAt/completedAt.
  - Runs Monte Carlo simulation to output p50/p80.
  - Must label output as Mode B.

If insufficient history for Mode B, fallback to Mode A.

---

## API Requirements (v1)
Create a new route group: `/api/planning`

Required endpoints:
- `GET /api/planning/org/:orgNodeId/supply?periodId=...&includeChildren=true|false`
- `GET /api/planning/org/:orgNodeId/demand?periodId=...&includeChildren=true|false`
- `GET /api/planning/org/:orgNodeId/gaps?periodId=...&includeChildren=true|false`
- `GET /api/planning/forecast/org/:orgNodeId?periodId=...&includeChildren=true|false`

Response requirements:
- Must include `unit` metadata for supply/demand (hours vs units).
- Must include `mode` for forecasts (A or B).
- Must be stable JSON shapes for frontend.

---

## UI Requirements (v1)
All screens behind feature flag: `PLANNING_STACK_V1`

1) Org Capacity screen:
- Org selector (tree)
- Period selector
- Table: supply vs demand vs gap by skill
- Highlight top gaps

2) Flow Forecast screen:
- Initiative list with p50/p80 date bands
- Portfolio p50/p80 summary
- Show forecast mode (A/B)

3) Job Profiles screen:
- CRUD JobProfiles + mapping to skills
- Assign Employee → JobProfile (simple control)

---

## Feature Flags / Rollout
- Feature flag gating at:
  - backend routes
  - frontend navigation
- Ship in read-only mode first; allow edits only for profiles/org membership.
- Provide seed data (minimal) for local dev.

---

## Out of Scope (v1)
- Rewriting allocator logic to be role-based.
- Automatic extraction of skills from Jira.
- Full net-free capacity calculation subtracting allocations (optional v1.1).
- Advanced cost forecasting and salary modeling.
- Multi-tenant org structures (future).

---

## Acceptance Criteria
- Org Capacity screen produces correct supply/demand/gaps for a known seeded dataset.
- Job Profiles can be created and assigned; headcount by profile works.
- Forecast screen returns p50/p80 with Mode A working even with zero history.
- Mode B activates when startedAt/completedAt data exists and passes tests.
- No existing scenario allocation workflows regress.
