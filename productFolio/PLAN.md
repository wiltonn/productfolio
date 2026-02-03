# Integrated Intake Workflow Plan for ProductFolio

---

## PHASE 0: CURRENT STATE MAP

### Intent

ProductFolio is an enterprise portfolio planning tool that helps product organizations:

1. **Define initiatives** through a lifecycle (PROPOSED → SCOPING → RESOURCING → IN_EXECUTION → COMPLETE)
2. **Staff initiatives** via scenario-based capacity planning (allocate employees with % and date ranges)
3. **Compare planning scenarios** (BASELINE, REVISION, WHAT_IF) per quarter
4. **Track delivery health** and detect drift from locked baselines
5. **Sync Jira issues** as intake items for reference/linking

### Entity Relationships (How Data Flows Today)

```
User (owner roles)
  └── Initiative (the core planning unit)
        ├── ScopeItem[] (skill demands: {frontend: 2, backend: 3}, P50/P90 estimates)
        ├── Approval[] (version-tracked audit trail)
        └── Allocation[] (via Scenario)

Period (QUARTER → MONTH → WEEK hierarchy)
  └── Scenario (DRAFT → REVIEW → APPROVED → LOCKED)
        ├── Allocation[] (employeeId, initiativeId, %, dateRange)
        │     └── AllocationPeriod[] (computed hours per period)
        ├── BaselineSnapshot (frozen at LOCK)
        └── DriftAlert[] (capacity/demand drift detection)

Employee
  ├── Skill[] (name + proficiency 1-5)
  ├── Domain[] (name + proficiency 1-5)
  ├── CapacityCalendar[] (hoursAvailable per period)
  └── Allocation[] (assignments across scenarios)

IntakeItem (Jira mirror - READ-ONLY sync)
  ├── jiraSiteId (required FK - Jira-coupled)
  ├── initiativeId (nullable FK - optional link to Initiative)
  └── itemStatus: ACTIVE | ARCHIVED | DELETED (sync-level, not workflow)

PortfolioArea → groups Initiatives
OrgTree → organizes Employees
```

### Where Planning Decisions Are Made Today

| Screen | Model | Decision |
|--------|-------|----------|
| **Scenario Planner** (`/scenarios/:id`) | Scenario, Allocation | Who works on what, for how long, at what % |
| **Initiative Detail** (`/initiatives/:id`) | Initiative, ScopeItem | What needs to be done, skill demands |
| **Capacity** (`/capacity`) | Employee, CapacityCalendar | Who is available, hours per period |
| **Reports** (`/reports`) | Aggregated views | Utilization, skill gaps, scenario comparison |
| **Intake** (`/intake`) | IntakeItem (Jira mirror) | View synced Jira issues, link to initiatives |

### Existing Constraints

1. **Quarter/Period hierarchy**: Year → Quarter → Month → Week; scenarios are scoped to quarters
2. **Scenario lock**: LOCKED status + FreezePolicy prevents allocation modifications; baseline captured at lock
3. **Initiative status gates**: PROPOSED → SCOPING → RESOURCING → IN_EXECUTION → COMPLETE (with ON_HOLD/CANCELLED branches)
4. **Allocation locks**: Cannot modify allocations for initiatives in RESOURCING/IN_EXECUTION/COMPLETE (`allocation.service.ts:18`)
5. **Baseline drift detection**: DriftAlert compares live vs snapshot, thresholds configurable

### Gap Analysis (What's Missing)

| Gap | Impact |
|-----|--------|
| No upstream funnel workflow | Cannot track how work enters the planning process |
| No origin tracking on initiatives | Cannot distinguish intake-backed vs directly-created work |
| No conversion process | No formal "Intake → Initiative" with audit trail |
| No pipeline visibility | Cannot see "approved but unplanned" or "converted but unallocated" |
| IntakeItem is Jira-only | Cannot create manual intake requests; tightly coupled to Jira sync |
| No coverage metrics | Cannot measure % of planned work with intake backing |

### Key Code References

| File | Purpose |
|------|---------|
| `packages/backend/prisma/schema.prisma` | All models, enums, relationships |
| `packages/backend/src/services/initiatives.service.ts` | Initiative CRUD + status transitions |
| `packages/backend/src/services/allocation.service.ts` | Allocation CRUD + capacity-demand |
| `packages/backend/src/services/scenarios.service.ts` | Scenario lifecycle + lock logic |
| `packages/backend/src/services/scenario-calculator.service.ts` | Demand vs capacity calculation engine |
| `packages/backend/src/services/intake.service.ts` | Current intake (Jira mirror read-only) |
| `packages/backend/src/schemas/initiatives.schema.ts` | Initiative validation + status transitions |
| `packages/frontend/src/router.tsx` | All UI routes |
| `packages/frontend/src/pages/IntakeList.tsx` | Current intake UI (Jira issue viewer) |
| `packages/frontend/src/pages/ScenarioPlanner.tsx` | Interactive allocation planning |
| `packages/frontend/src/components/CreateInitiativeModal.tsx` | Initiative creation form |

---

## PHASE 1: TARGET WORKFLOW OVERLAY

### A. Core Concepts

#### IntakeRequest (NEW entity - source-agnostic upstream request)

**Why a new entity instead of modifying existing IntakeItem:**
- Current `IntakeItem` has a **required** `jiraSiteId` FK and Jira-specific fields (jiraIssueKey, jiraIssueUrl, statusCategory, contentHash, etc.)
- IntakeRequest is source-agnostic: can originate from Jira, manual creation, or future integrations
- Preserves all existing Jira sync machinery (`JiraSyncService`, `JiraApiService`, `IntakeItem` model) untouched
- Clean separation: `IntakeItem` = sync mirror layer; `IntakeRequest` = workflow layer

#### Initiative (EXISTING entity - enhanced with origin tracking)

- Adds `origin` field to classify how the initiative was created
- Adds `intakeRequestId` FK for traceability back to intake

#### Origin Classification

| Origin | Meaning | `initiative.origin` | `initiative.intakeRequestId` |
|--------|---------|---------------------|------------------------------|
| Intake-origin | Created via intake conversion | `INTAKE_CONVERTED` | set (FK to IntakeRequest) |
| Non-Intake scope | Created directly by PM | `DIRECT_PM` | null |
| Legacy | Pre-existing initiatives | `LEGACY` | null |

### B. Workflow States

#### IntakeRequest Lifecycle

```
DRAFT ──→ TRIAGE ──→ ASSESSED ──→ APPROVED ──→ CONVERTED ──→ CLOSED
  │          │           │            │                          ↑
  │          │           │            └── "Convert to Initiative" │
  │          │           │                                       │
  └──────────┴───────────┴── Can be CLOSED at any stage ────────┘
```

**Status Definitions:**

| Status | Meaning | Who Acts | Editable? |
|--------|---------|----------|-----------|
| `DRAFT` | Initial submission, incomplete | Requester | Full edit |
| `TRIAGE` | Under review for priority/fit | Product ops / PM | Edit allowed |
| `ASSESSED` | Effort/value assessed, ready for decision | PM / Leadership | Edit allowed |
| `APPROVED` | Approved for planning, not yet initiative | Leadership | Limited edit |
| `CONVERTED` | Linked initiative created | System (on conversion) | Read-only (except notes) |
| `CLOSED` | Rejected, deferred, or duplicate | Any authorized | Read-only |

**Valid Transitions:**

```
DRAFT     → TRIAGE, CLOSED
TRIAGE    → ASSESSED, DRAFT, CLOSED
ASSESSED  → APPROVED, TRIAGE, CLOSED
APPROVED  → CONVERTED, ASSESSED, CLOSED
CONVERTED → CLOSED (only if initiative is also cancelled)
CLOSED    → DRAFT (reopen)
```

#### Initiative Lifecycle (UNCHANGED)

```
PROPOSED → SCOPING → RESOURCING → IN_EXECUTION → COMPLETE
    ↕          ↕          ↕              ↕
  ON_HOLD    ON_HOLD    ON_HOLD       ON_HOLD
    ↓          ↓          ↓              ↓
 CANCELLED  CANCELLED  CANCELLED     CANCELLED
```

No changes to existing initiative status semantics. Scenarios, allocations, and reporting continue to work identically.

### C. Conversion Process: IntakeRequest → Initiative

**"Convert to Initiative" is a system action with these rules:**

1. **Precondition**: IntakeRequest.status must be `APPROVED`
2. **Action**:
   - Creates a new Initiative with:
     - `title` = IntakeRequest.title
     - `description` = IntakeRequest.description
     - `businessOwnerId` = IntakeRequest.sponsorId (or user-selected)
     - `productOwnerId` = IntakeRequest.requestedById (or user-selected)
     - `portfolioAreaId` = IntakeRequest.portfolioAreaId
     - `targetQuarter` = IntakeRequest.targetQuarter
     - `origin` = `INTAKE_CONVERTED`
     - `intakeRequestId` = IntakeRequest.id
     - `status` = `PROPOSED` (enters normal initiative workflow)
   - Freezes a `conversionSnapshot` (JSON) on IntakeRequest capturing key fields at conversion time
   - Sets IntakeRequest.status = `CONVERTED`
   - Sets IntakeRequest.initiativeId = new Initiative.id
3. **Post-conversion**: IntakeRequest becomes read-only except for notes/attachments/decision log
4. **One-to-one**: Each IntakeRequest can convert to exactly one Initiative. Re-conversion requires closing and creating new.

**Conversion modal fields (user can override defaults):**

| Field | Default from IntakeRequest | Overridable? |
|-------|---------------------------|--------------|
| Title | IntakeRequest.title | Yes |
| Description | IntakeRequest.description | Yes |
| Business Owner | IntakeRequest.sponsorId | Yes (required) |
| Product Owner | IntakeRequest.requestedById | Yes (required) |
| Portfolio Area | IntakeRequest.portfolioAreaId | Yes |
| Target Quarter | IntakeRequest.targetQuarter | Yes |

**Unlink / Relink Rules:**
- Unlinking is NOT allowed after conversion (preserves audit trail)
- If the converted Initiative is CANCELLED, the IntakeRequest can be moved to CLOSED
- A CLOSED IntakeRequest can be reopened (→ DRAFT) and go through the workflow again to create a different Initiative
- Audit log records all conversion events with timestamps and actor

### D. Direct PM Initiative Creation (Non-Intake Scope)

**UX Path**: PM clicks "New Initiative" → same modal as today, with one addition:

- A new origin indicator (not a dropdown the user picks; it's automatic):
  - If creating from "Convert Intake" action → `origin = INTAKE_CONVERTED` (set automatically)
  - If creating from "New Initiative" button → `origin = DIRECT_PM` (set automatically)
- The PM does NOT choose origin; it's determined by the creation path
- Existing initiatives get `origin = LEGACY` via a data migration

**Reporting visibility**:
- Non-Intake scope initiatives are fully eligible for Scenario allocation and Capacity planning
- They appear in all existing views exactly as before
- New "Origin" filter and column allows separating intake-backed vs direct-created

### E. How Intake Integrates into Planning (The Key Overlay)

**Fundamental rule: IntakeRequests do NOT consume capacity. Only Initiatives do.**

```
IntakeRequest (upstream funnel)
    │
    │ "Convert to Initiative"
    ▼
Initiative (planning unit)
    │
    │ "Allocate in Scenario"
    ▼
Allocation (capacity consumption)
```

**Intake influences planning by:**

1. **Creating Initiatives** (converted) → these then get allocated in Scenarios
2. **Providing upstream prioritization signals** (value score, strategic alignment, urgency)
3. **Enabling a pipeline view**: "Approved but not yet planned" = demand that hasn't been resourced
4. **Coverage metrics**: What % of planned work has intake backing?

### Planned vs Unplanned Definitions

#### Core Definitions

**Planned Initiative (for a given period/quarter):**
An Initiative is "Planned" if it has **at least one Allocation** in **any Scenario** for that period.

```sql
-- Pseudocode: Is initiative X planned for quarter Q?
SELECT EXISTS (
  FROM Allocation a
  JOIN Scenario s ON a.scenarioId = s.id
  WHERE a.initiativeId = :initiativeId
    AND s.periodId = :periodId
)
```

**Primary Planned:**
An Initiative is "Primary Planned" if it has at least one Allocation in the **Primary Scenario** (`isPrimary = true`) for that period.

**Unplanned Initiative (for a given period/quarter):**
An Initiative is "Unplanned" if it has **zero Allocations** across **all Scenarios** for that period.

#### Intake Pipeline States (Derived)

| State | Condition |
|-------|-----------|
| **Approved but Unconverted** | IntakeRequest.status = APPROVED AND IntakeRequest.initiativeId IS NULL |
| **Converted but Unplanned** | IntakeRequest.status = CONVERTED AND linked Initiative is Unplanned for selected period |
| **Converted and Planned** | IntakeRequest.status = CONVERTED AND linked Initiative is Planned for selected period |
| **Non-Intake Planned Work** | Initiative.origin = DIRECT_PM AND Initiative is Planned for selected period |

#### Implementation

**Server-side query helpers:**

```typescript
// In a new service: intake-planning.service.ts

function getInitiativePlanningState(
  initiativeId: string,
  periodId: string
): Promise<'PLANNED' | 'UNPLANNED' | 'PRIMARY_PLANNED'>

function getIntakePipelineState(
  intakeRequestId: string,
  periodId: string
): Promise<'APPROVED_UNCONVERTED' | 'CONVERTED_UNPLANNED' | 'CONVERTED_PLANNED'>

function getIntakePipelineStats(
  periodId: string
): Promise<{
  approvedUnconverted: number;
  convertedUnplanned: number;
  convertedPlanned: number;
  nonIntakePlanned: number;
  intakeLeakagePct: number;      // % of planned that is DIRECT_PM
  conversionCoveragePct: number;  // % of approved intake that becomes planned
}>
```

**These use the existing join model:**
- `Allocation` table has `scenarioId` + `initiativeId` (nullable)
- `Scenario` table has `periodId` (links to quarter)
- Query: `SELECT FROM allocations WHERE initiativeId = X AND scenario.periodId = Y`

**The definition works even when scenarios are locked** because planned/unplanned is based on existence of allocations, not editability.

### F. Required Planning Views

#### 1. Intake Pipeline View (NEW page or tab on existing Intake page)

**Shows:**
- Stats cards: Approved Unconverted | Converted Unplanned | Converted Planned | Total Active
- Period/quarter selector
- Table of IntakeRequests with derived pipeline state
- Columns: Title, Status, Priority, Value Score, Pipeline State, Linked Initiative, Target Quarter
- Filters: Status, Pipeline State, Portfolio Area, Quarter

#### 2. Origin Filters (additions to existing pages)

**Initiative List** (`/initiatives`):
- New filter: "Origin" dropdown (All | Intake-origin | Non-Intake scope | Legacy)
- New column: Origin badge (small indicator showing source)

**Scenario Planner** (`/scenarios/:id`):
- Initiative cards show origin badge
- Filter initiatives by origin in the sidebar

**Reports** (`/reports`):
- New section: "Intake Coverage"
  - % of planned initiatives with intake backing
  - Intake leakage (% direct-PM by portfolio area)
  - Conversion pipeline funnel chart

#### 3. Coverage Metrics

| Metric | Formula |
|--------|---------|
| **Intake Coverage %** | (Planned initiatives with origin=INTAKE_CONVERTED) / (Total planned initiatives) × 100 |
| **Intake Leakage %** | (Planned initiatives with origin=DIRECT_PM) / (Total planned initiatives) × 100 |
| **Conversion Rate** | (IntakeRequests with status=CONVERTED) / (IntakeRequests that reached APPROVED) × 100 |
| **Planning Coverage** | (Converted + Planned) / (Total APPROVED IntakeRequests) × 100 |

---

## PHASE 2: DATA MODEL & RELATIONSHIPS

### New Enum: IntakeRequestStatus

```prisma
enum IntakeRequestStatus {
  DRAFT
  TRIAGE
  ASSESSED
  APPROVED
  CONVERTED
  CLOSED
}
```

### New Enum: InitiativeOrigin

```prisma
enum InitiativeOrigin {
  INTAKE_CONVERTED
  DIRECT_PM
  LEGACY
}
```

### New Model: IntakeRequest

```prisma
model IntakeRequest {
  id                String               @id @default(uuid()) @db.Uuid
  title             String               @db.VarChar(500)
  description       String?              @db.Text
  status            IntakeRequestStatus  @default(DRAFT)

  // Requester & Sponsor
  requestedById     String?              @db.Uuid
  requestedBy       User?                @relation("intakeRequester", fields: [requestedById], references: [id])
  sponsorId         String?              @db.Uuid
  sponsor           User?                @relation("intakeSponsor", fields: [sponsorId], references: [id])

  // Classification
  portfolioAreaId   String?              @db.Uuid
  portfolioArea     PortfolioArea?       @relation(fields: [portfolioAreaId], references: [id])
  targetQuarter     String?              @db.VarChar(10)  // "2026-Q2"
  valueScore        Int?                 // 1-10 business value
  effortEstimate    String?              @db.VarChar(10)  // T-shirt: XS, S, M, L, XL
  urgency           String?              @db.VarChar(20)  // LOW, MEDIUM, HIGH, CRITICAL
  customerName      String?              @db.VarChar(255)
  tags              Json?                @db.JsonB         // string[]
  strategicThemes   Json?                @db.JsonB         // string[]

  // Source linkage (optional - from Jira or other)
  sourceType        IntakeSourceType?    // JIRA (reuse existing enum)
  intakeItemId      String?              @unique @db.Uuid  // FK to existing IntakeItem (Jira mirror)
  intakeItem        IntakeItem?          @relation(fields: [intakeItemId], references: [id])

  // Conversion linkage
  initiativeId      String?              @unique @db.Uuid
  initiative        Initiative?          @relation("intakeRequestToInitiative", fields: [initiativeId], references: [id])
  conversionSnapshot Json?              @db.JsonB  // Frozen copy of key fields at conversion time

  // Decision log
  decisionNotes     String?              @db.Text
  closedReason      String?              @db.VarChar(50)  // REJECTED, DEFERRED, DUPLICATE, OUT_OF_SCOPE

  // Audit
  createdBy         String?              @db.Uuid
  updatedBy         String?              @db.Uuid
  createdAt         DateTime             @default(now())
  updatedAt         DateTime             @updatedAt

  // Attachments (future: separate table; for now, use JSON)
  attachments       Json?                @db.JsonB  // [{name, url, uploadedAt}]

  @@index([status])
  @@index([portfolioAreaId])
  @@index([targetQuarter])
  @@index([initiativeId])
  @@index([intakeItemId])
  @@map("intake_requests")
}
```

### Modified Model: Initiative (additions only)

```prisma
model Initiative {
  // ... existing fields unchanged ...

  // NEW: Origin tracking
  origin            InitiativeOrigin     @default(LEGACY)
  intakeRequestId   String?              @unique @db.Uuid
  intakeRequest     IntakeRequest?       @relation("initiativeToIntakeRequest", fields: [intakeRequestId], references: [id])

  // ... existing relations unchanged ...
}
```

**Note on bidirectional FK**: IntakeRequest has `initiativeId` FK and Initiative has `intakeRequestId` FK. This is intentional for the 1:1 relationship - Prisma requires the FK on one side but we add the reverse relation. We'll use ONE FK direction: `IntakeRequest.initiativeId → Initiative.id`. The `Initiative.intakeRequestId` field is the reverse lookup. Actually, to keep it clean, we use a single FK:

**Revised approach** (single FK direction):
- `IntakeRequest.initiativeId` (nullable FK → Initiative) — set on conversion
- `Initiative` gets a reverse relation `intakeRequest IntakeRequest?` without its own FK column
- This avoids dual FKs and is consistent with how `IntakeItem.initiativeId` already works

```prisma
// On Initiative model, ADD:
  origin            InitiativeOrigin     @default(LEGACY)
  intakeRequest     IntakeRequest?       // Reverse relation, no FK column on Initiative

// On IntakeRequest model:
  initiativeId      String?              @unique @db.Uuid
  initiative        Initiative?          @relation(fields: [initiativeId], references: [id])
```

### Modified Model: IntakeItem (minimal addition)

```prisma
model IntakeItem {
  // ... existing fields unchanged ...

  // NEW: reverse relation to IntakeRequest
  intakeRequest     IntakeRequest?       // Reverse of IntakeRequest.intakeItemId
}
```

### Relationship Justification

**Why `IntakeRequest.initiativeId` FK instead of `Initiative.intakeRequestId`:**
- Follows existing pattern: `IntakeItem.initiativeId` already exists with this direction
- IntakeRequest "knows about" Initiative (conversion creates the link)
- Initiative doesn't need to know about IntakeRequest at the model level (reverse relation suffices)
- Simpler migration: only adds column to new table, not existing Initiative table

**Why `IntakeRequest.intakeItemId` @unique:**
- 1:1 relationship: one Jira issue maps to at most one IntakeRequest
- Allows IntakeRequests without Jira source (manual creation)
- Preserves IntakeItem as read-only Jira mirror

**Impact on existing queries:**
- Scenario calculator queries Allocation → Scenario → Initiative chain: **no change** (origin field is informational)
- Allocation service validates initiative status: **no change** (Initiative status workflow unchanged)
- Capacity calculations use Employee → Allocation → Scenario: **no change**
- Adding `origin` to Initiative is additive; existing filters/queries ignore it until updated

### Data Migration

```sql
-- Set origin=LEGACY for all existing initiatives
UPDATE initiatives SET origin = 'LEGACY' WHERE origin IS NULL;
-- (After adding column with default, this is automatic)
```

---

## PHASE 3: UI + API INTEGRATION PLAN

### API Routes (NEW)

#### IntakeRequest CRUD: `/api/intake-requests`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/intake-requests` | GET | List intake requests with filters (status, portfolioArea, quarter, pipeline state) |
| `/api/intake-requests` | POST | Create new intake request (manual or from Jira item) |
| `/api/intake-requests/:id` | GET | Get single intake request with linked initiative/intake item |
| `/api/intake-requests/:id` | PUT | Update intake request (respects status-based editability) |
| `/api/intake-requests/:id` | DELETE | Delete intake request (only DRAFT/CLOSED) |
| `/api/intake-requests/:id/status` | POST | Transition intake request status |
| `/api/intake-requests/:id/convert` | POST | Convert to Initiative (APPROVED → CONVERTED) |
| `/api/intake-requests/stats` | GET | Pipeline statistics (counts by state) |
| `/api/intake-requests/pipeline` | GET | Pipeline stats with period filter (planned/unplanned derived states) |

#### Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `GET /api/initiatives` | Add `origin` filter parameter |
| `POST /api/initiatives` | Auto-set `origin = DIRECT_PM` for direct creation |
| `GET /api/initiatives/:id` | Include `intakeRequest` in response |
| `GET /api/reports/intake-coverage` | NEW: Coverage metrics endpoint |

### Backend Service Layer

**New files:**

| File | Purpose |
|------|---------|
| `services/intake-request.service.ts` | IntakeRequest CRUD, status transitions, conversion logic |
| `services/intake-planning.service.ts` | Planning state derivation (planned/unplanned), pipeline stats, coverage metrics |
| `schemas/intake-request.schema.ts` | Zod validation schemas |
| `routes/intake-requests.ts` | Route handlers |

**Modified files:**

| File | Change |
|------|---------|
| `services/initiatives.service.ts` | Set `origin = DIRECT_PM` on create; include intakeRequest relation in queries |
| `schemas/initiatives.schema.ts` | Add `origin` to filter schema |
| `routes/initiatives.ts` | Add origin filter param |
| `services/intake.service.ts` | Add method to create IntakeRequest from IntakeItem |

### Frontend Routes & Pages

**New routes:**

| Route | Page | Purpose |
|-------|------|---------|
| `/intake-requests` | IntakeRequestList | Pipeline view with status workflow |
| `/intake-requests/:id` | IntakeRequestDetail | Detail view with decision log + conversion action |

**Modified existing routes:**

| Route | Change |
|-------|--------|
| `/intake` | Add "Create Intake Request" action per Jira item (links IntakeItem → IntakeRequest) |
| `/initiatives` | Add Origin column + filter |
| `/initiatives/:id` | Show intake request link in header if origin=INTAKE_CONVERTED |
| `/scenarios/:id` | Show origin badge on initiative cards |
| `/reports` | Add "Intake Coverage" section |

### Navigation Update

```
Sidebar (updated):
- Initiatives (Alt+I)
- Intake Pipeline (NEW - replaces or sits alongside current "Intake")    ← IntakeRequest workflow
  - Sub-items or tabs: Pipeline | Jira Items (existing IntakeList)
- Capacity (Alt+C)
- Scenarios (Alt+S)
- Reports (Alt+R)
- Delivery (Alt+D)
- Approvals
- [Admin section unchanged]
```

### Key UI Components (NEW)

| Component | Purpose |
|-----------|---------|
| `IntakeRequestList.tsx` | Filterable list with pipeline state badges |
| `IntakeRequestDetail.tsx` | Tabbed detail: Overview, Decision Log, Linked Initiative |
| `CreateIntakeRequestModal.tsx` | Manual creation form |
| `ConvertToInitiativeModal.tsx` | Conversion form with field mapping + overrides |
| `IntakePipelineStats.tsx` | Stats cards for pipeline states |
| `OriginBadge.tsx` | Small badge component: "Intake" / "Direct" / "Legacy" |
| `IntakeCoverageReport.tsx` | Coverage metrics for Reports page |

### Key UI Modifications

| Component | Change |
|-----------|--------|
| `InitiativesList.tsx` | Add Origin column, origin filter dropdown |
| `InitiativeDetail.tsx` | Show IntakeRequest link in header when applicable |
| `CreateInitiativeModal.tsx` | Auto-set origin=DIRECT_PM (no UI change needed) |
| `ScenarioPlanner.tsx` | Origin badge on initiative cards |
| `Reports.tsx` | Add IntakeCoverageReport section |
| `IntakeList.tsx` | Add "Create Intake Request" button per unlinked Jira item |
| `Layout.tsx` | Update sidebar navigation |

---

## PHASE 4: QUARTER/SCENARIO LOCK INTERACTION

### Rules

| Scenario | Behavior | Rationale |
|----------|----------|-----------|
| IntakeRequest progresses through workflow | **Always allowed** regardless of scenario lock | Intake is upstream of planning; decisions should not be blocked by lock |
| IntakeRequest converts to Initiative | **Always allowed** | Creates the Initiative entity; does not allocate capacity |
| New Initiative (from conversion) needs allocation | **Follows existing scenario rules** | Can only add to DRAFT/REVIEW scenarios; LOCKED/APPROVED are immutable |
| All current-quarter scenarios are LOCKED | Initiative remains "Unplanned" for current quarter | Shows as "Converted but Unplanned" in pipeline view |
| Mid-quarter conversion needs immediate planning | **Create a WHAT_IF scenario** or wait for next quarter | Uses existing scenario creation; no new mechanism needed |

### Recommended Default Rule

**Allow conversion at any time. Planning follows existing scenario lock rules.**

Rationale:
- Conversion is a decision-tracking action, not a capacity action
- The Initiative exists as a planning candidate immediately
- If current quarter is locked, the initiative naturally surfaces as "Unplanned" in pipeline metrics
- PM can create a WHAT_IF scenario or plan into next quarter
- No new lock mechanism needed; existing LOCKED/FreezePolicy handles it

### IntakeRequest Status vs Scenario Lock Matrix

| IntakeRequest Status | Scenario DRAFT | Scenario LOCKED |
|---------------------|----------------|-----------------|
| APPROVED → Convert | Creates Initiative; can allocate immediately | Creates Initiative; cannot allocate in locked scenario |
| CONVERTED (Initiative Unplanned) | PM can allocate in this scenario | Cannot allocate here; try another scenario or next quarter |
| CONVERTED (Initiative Planned) | Allocation exists; modifiable | Allocation exists; frozen |

### Edge Case: Intake Changes After Conversion

- IntakeRequest is read-only after CONVERTED (except notes/attachments)
- If requirements change, the PM modifies the **Initiative** directly (scope items, description, etc.)
- This is intentional: once converted, the Initiative is the source of truth for planning
- IntakeRequest serves as the historical decision record (why it was approved, original assumptions via conversionSnapshot)

---

## PHASE 5: IMPLEMENTATION TASK BREAKDOWN

### Target Workflow Spec (Summary)

1. IntakeRequests are created manually or from Jira items
2. They progress through DRAFT → TRIAGE → ASSESSED → APPROVED → CONVERTED → CLOSED
3. At APPROVED, a "Convert to Initiative" action creates a new Initiative with origin=INTAKE_CONVERTED
4. Initiatives created directly get origin=DIRECT_PM
5. Only Initiatives consume capacity via Allocations in Scenarios
6. Pipeline views show derived states (approved-unconverted, converted-unplanned, converted-planned)
7. Coverage metrics track intake backing percentage
8. Scenario lock rules are unchanged; intake workflow is independent

### Schema Diff Plan

**New enums:**
- `IntakeRequestStatus`: DRAFT, TRIAGE, ASSESSED, APPROVED, CONVERTED, CLOSED
- `InitiativeOrigin`: INTAKE_CONVERTED, DIRECT_PM, LEGACY

**New table:**
- `intake_requests`: Full schema as defined in Phase 2

**Modified table:**
- `initiatives`: Add `origin InitiativeOrigin @default(LEGACY)` column

**New relation:**
- `IntakeRequest.initiativeId → Initiative.id` (nullable, unique, 1:1)
- `IntakeRequest.intakeItemId → IntakeItem.id` (nullable, unique, 1:1)

**Migration:**
- Add enums, add intake_requests table, add origin column to initiatives with LEGACY default

### Route/UI Plan

**New backend files (8):**
- `schemas/intake-request.schema.ts`
- `services/intake-request.service.ts`
- `services/intake-planning.service.ts`
- `routes/intake-requests.ts`
- (Register in `index.ts`)

**Modified backend files (4):**
- `schemas/initiatives.schema.ts` — add origin filter
- `services/initiatives.service.ts` — set origin on create, include intakeRequest relation
- `routes/initiatives.ts` — add origin query param
- `prisma/schema.prisma` — schema changes

**New frontend files (7):**
- `pages/IntakeRequestList.tsx`
- `pages/IntakeRequestDetail.tsx`
- `components/CreateIntakeRequestModal.tsx`
- `components/ConvertToInitiativeModal.tsx`
- `components/IntakePipelineStats.tsx`
- `components/OriginBadge.tsx`
- `components/IntakeCoverageReport.tsx`

**Modified frontend files (7):**
- `router.tsx` — add new routes
- `components/Layout.tsx` — update sidebar nav
- `pages/InitiativesList.tsx` — add origin column + filter
- `pages/InitiativeDetail.tsx` — show intake link
- `pages/IntakeList.tsx` — add "Create Intake Request" action
- `pages/ScenarioPlanner.tsx` — origin badge on cards
- `pages/Reports.tsx` — add coverage section

### Reporting Plan

**New metrics endpoint:** `GET /api/intake-requests/pipeline?periodId=<uuid>`

**Response:**
```json
{
  "period": { "id": "...", "label": "2026-Q2" },
  "pipeline": {
    "approvedUnconverted": 5,
    "convertedUnplanned": 3,
    "convertedPlanned": 12,
    "nonIntakePlanned": 8,
    "totalPlanned": 20
  },
  "coverage": {
    "intakeCoveragePct": 60.0,
    "intakeLeakagePct": 40.0,
    "conversionRatePct": 85.0,
    "planningCoveragePct": 70.6
  }
}
```

**Queries:**
1. Approved Unconverted: `IntakeRequest WHERE status=APPROVED AND initiativeId IS NULL`
2. Converted Unplanned: `IntakeRequest WHERE status=CONVERTED AND initiative.allocations(scenario.periodId=X).count = 0`
3. Converted Planned: `IntakeRequest WHERE status=CONVERTED AND initiative.allocations(scenario.periodId=X).count > 0`
4. Non-Intake Planned: `Initiative WHERE origin=DIRECT_PM AND allocations(scenario.periodId=X).count > 0`
5. Intake Leakage: `nonIntakePlanned / totalPlanned × 100`
6. Conversion Coverage: `convertedPlanned / (approvedUnconverted + convertedUnplanned + convertedPlanned) × 100`

### Phased Ticket List

#### Phase 1: Intake Foundation + Conversion + Origin Tracking

| # | Ticket | Description | Files |
|---|--------|-------------|-------|
| 1.1 | **Schema: Add IntakeRequest model + InitiativeOrigin enum** | Add Prisma schema changes, generate migration, add origin column to Initiative with LEGACY default | `schema.prisma`, migration |
| 1.2 | **Backend: IntakeRequest CRUD service** | Create `intake-request.service.ts` with list, get, create, update, delete. Include status transition validation (state machine). | `intake-request.service.ts`, `intake-request.schema.ts` |
| 1.3 | **Backend: IntakeRequest routes** | Create route handlers for all CRUD + status transition endpoints. Register in server. | `routes/intake-requests.ts`, `index.ts` |
| 1.4 | **Backend: Conversion service** | Implement "Convert to Initiative" logic: create Initiative, freeze snapshot, transition IntakeRequest to CONVERTED, set origin=INTAKE_CONVERTED. | `intake-request.service.ts` (convert method) |
| 1.5 | **Backend: Initiative origin tracking** | Modify initiative create to auto-set `origin=DIRECT_PM`. Add origin to filter schema and list query. Include intakeRequest reverse relation in get/list responses. | `initiatives.service.ts`, `initiatives.schema.ts`, `initiatives.ts` |
| 1.6 | **Frontend: IntakeRequest list page** | Build IntakeRequestList page with table, filters (status, portfolio area, quarter), stats cards, and pagination. | `IntakeRequestList.tsx`, `IntakePipelineStats.tsx` |
| 1.7 | **Frontend: IntakeRequest detail page** | Build detail page with tabs (Overview, Decision Log), status transition controls, and conversion action button. | `IntakeRequestDetail.tsx` |
| 1.8 | **Frontend: Create IntakeRequest modal** | Manual creation form + "Create from Jira Item" variant. | `CreateIntakeRequestModal.tsx` |
| 1.9 | **Frontend: Convert to Initiative modal** | Conversion form with field mapping, owner selection, override controls. | `ConvertToInitiativeModal.tsx` |
| 1.10 | **Frontend: Routing + Navigation** | Add `/intake-requests` and `/intake-requests/:id` routes. Update sidebar navigation. | `router.tsx`, `Layout.tsx` |
| 1.11 | **Frontend: Origin badge + Initiative list update** | Add OriginBadge component. Add origin column and filter to InitiativesList. Show intake link on InitiativeDetail header. | `OriginBadge.tsx`, `InitiativesList.tsx`, `InitiativeDetail.tsx` |
| 1.12 | **Tests: IntakeRequest service + conversion** | Unit tests for CRUD, status transitions, conversion logic, origin tracking. | `tests/intake-request.test.ts` |

#### Phase 1.5: Planning Page Overlays

| # | Ticket | Description | Files |
|---|--------|-------------|-------|
| 1.5.1 | **Backend: Intake planning service** | Implement `getInitiativePlanningState`, `getIntakePipelineState`, `getIntakePipelineStats` using existing Allocation/Scenario joins. | `intake-planning.service.ts` |
| 1.5.2 | **Backend: Pipeline stats endpoint** | `GET /api/intake-requests/pipeline?periodId=X` returning derived states + coverage metrics. | `routes/intake-requests.ts` |
| 1.5.3 | **Frontend: Pipeline view enhancements** | Add pipeline state badges to IntakeRequestList. Add period selector for pipeline context. Show "Converted but Unplanned" highlight. | `IntakeRequestList.tsx` |
| 1.5.4 | **Frontend: Scenario planner origin overlay** | Add origin badge to initiative cards in ScenarioPlanner. | `ScenarioPlanner.tsx` |
| 1.5.5 | **Frontend: Intake coverage report** | Add IntakeCoverageReport component to Reports page. Show coverage %, leakage %, conversion rate, funnel visualization. | `IntakeCoverageReport.tsx`, `Reports.tsx` |
| 1.5.6 | **Frontend: IntakeList → IntakeRequest bridge** | Add "Create Intake Request" action on IntakeList page for Jira items. Links IntakeItem to new IntakeRequest. | `IntakeList.tsx` |

#### Phase 2: JIRA Adapter Enhancement (OUTLINE ONLY)

| # | Ticket | Description |
|---|--------|-------------|
| 2.1 | **Auto-create IntakeRequest on Jira sync** | When JiraSyncService creates/updates IntakeItem, optionally auto-create a linked IntakeRequest in DRAFT status. Configurable per project. |
| 2.2 | **Jira status → IntakeRequest status mapping** | Configurable mapping: e.g., Jira "To Do" → TRIAGE, "In Progress" → ASSESSED, "Done" → APPROVED. Sync updates IntakeRequest status. |
| 2.3 | **Write-back: Conversion notification** | When IntakeRequest converts to Initiative, add Jira comment on source issue with link to ProductFolio Initiative. Uses existing `IntegrationWriteActionLog`. |
| 2.4 | **Bidirectional link sync** | Keep IntakeRequest fields in sync with Jira changes (title, description, priority) until status reaches APPROVED. After APPROVED, IntakeRequest is frozen. |

*Phase 2 is outline only — no build unless explicitly requested.*

---

## APPENDIX: Existing Code Impact Assessment

### Zero-impact areas (no changes needed):
- Scenario calculator service (`scenario-calculator.service.ts`) — queries Allocation → Initiative; origin field is ignored
- Allocation service (`allocation.service.ts`) — validates initiative status, not origin
- Baseline/drift services — snapshot Allocations, not IntakeRequests
- Employee/capacity services — no initiative awareness
- BullMQ job processors — scenario-recompute, view-refresh, drift-check unaffected
- CSV import/export — can optionally add origin column to export later

### Low-impact areas (small additions):
- Initiative service: add `origin` to create, add to include/filter
- Initiative schema: add `origin` filter field
- Initiative routes: pass through origin filter
- Frontend initiative pages: add column + filter + badge

### New code (bulk of work):
- IntakeRequest backend (service, schema, routes)
- IntakeRequest frontend (2 pages, 3 modals/components)
- Intake planning service (derived state queries)
- Coverage metrics (1 new endpoint, 1 new report component)
