# Frontend Engineer Plan: Tasks #19 and #20

## Task #19: Scenario Settings - Planning Mode Toggle UI

### 19a. Create `packages/frontend/src/hooks/usePlanningMode.ts`

New React Query hook file following the established pattern:

```ts
// Query keys
export const planningModeKeys = {
  all: ['planningMode'] as const,
  detail: (scenarioId: string) => [...planningModeKeys.all, scenarioId] as const,
};

// Type
export type PlanningMode = 'LEGACY' | 'TOKEN';

// Mutation: usePlanningModeToggle
// - PUT /api/scenarios/:id/planning-mode with body { planningMode: 'LEGACY' | 'TOKEN' }
// - On success: invalidate scenarioKeys.detail(id) and scenarioKeys.lists()
// - Toast success/error following existing pattern
```

No separate query hook needed since `useScenario(id)` already fetches the scenario which includes the `planningMode` field (once backend adds it). The Scenario interface in `useScenarios.ts` will need a `planningMode?: PlanningMode` field added.

### 19b. Add `planningMode` to Scenario interface in `useScenarios.ts`

Add `planningMode?: 'LEGACY' | 'TOKEN';` to the existing `Scenario` interface (line ~8-23). This is a minimal, additive change.

### 19c. Add Planning Mode toggle in `ScenarioPlanner.tsx`

**Placement**: Inside the existing `header-right` div (line ~1731), next to the "Assumptions" dropdown button. Add a new toggle/select element between the stat-pills area and the Assumptions button. This follows the existing pattern of scenario-level settings in the header toolbar.

**Component**: A simple toggle button similar to the "Ramp Modeling" toggle pattern already used in the Assumptions dropdown (lines 1796-1832), but placed directly in the header as it is more prominent than an assumption.

**Implementation details**:
- Import `usePlanningModeToggle` from the new hook file
- Import `useFeatureFlag` to gate visibility on a feature flag (e.g., `token_flow_v1` or whichever flag the backend team creates)
- Read `scenario.planningMode` (default to `'LEGACY'` if undefined)
- Only show toggle when user has mutation role (reuse `canEdit` from `useScenarioPermissions`)
- Before switching to TOKEN mode: show a confirmation Modal ("Switching to Token Flow mode will use token-based capacity planning. Continue?")
- Before switching to LEGACY mode: show a confirmation Modal ("Switching to Legacy mode will use time-based capacity planning. Any token data will be preserved. Continue?")
- On confirm, call `planningModeToggle.mutate({ id, planningMode: newMode })`

**Visual design**: A segmented toggle showing "Legacy" / "Token Flow" labels, styled as a pair of buttons with the active one highlighted in accent color. Similar to the existing `activeTab` tab pattern but smaller (pill-sized).

### 19d. Export new hooks from barrel file `packages/frontend/src/hooks/index.ts`

Add export for `usePlanningModeToggle`, `planningModeKeys`, and `PlanningMode` type.

---

## Task #20: Token Ledger Tab + View UI

### 20a. Create `packages/frontend/src/hooks/useTokenLedger.ts`

New React Query hook file:

```ts
export const tokenLedgerKeys = {
  all: ['tokenLedger'] as const,
  ledger: (scenarioId: string) => [...tokenLedgerKeys.all, 'ledger', scenarioId] as const,
  supply: (scenarioId: string) => [...tokenLedgerKeys.all, 'supply', scenarioId] as const,
  demand: (scenarioId: string) => [...tokenLedgerKeys.all, 'demand', scenarioId] as const,
  skillPools: () => [...tokenLedgerKeys.all, 'skillPools'] as const,
};

// Types
export interface TokenLedgerRow {
  poolId: string;
  poolName: string;
  supply: number;
  demandP50: number;
  demandP90: number;
  delta: number; // supply - demandP50 (or P90)
}

export interface TokenLedgerSummary {
  rows: TokenLedgerRow[];
  bindingConstraints: TokenLedgerRow[]; // pools with delta < 0, sorted by deficit
  totalSupply: number;
  totalDemandP50: number;
  totalDemandP90: number;
}

export interface SkillPool {
  id: string;
  name: string;
  skills: string[];
  createdAt: string;
  updatedAt: string;
}

// Queries
// useTokenLedger(scenarioId) - GET /api/scenarios/:id/token-ledger
// useSkillPools() - GET /api/skill-pools
// useTokenSupply(scenarioId) - GET /api/scenarios/:id/token-supply (for inline edit)
// useTokenDemand(scenarioId) - GET /api/scenarios/:id/token-demand (for inline edit)

// Mutations
// useUpdateTokenSupply - PUT /api/scenarios/:id/token-supply/:poolId
// useUpdateTokenDemand - PUT /api/scenarios/:id/token-demand/:poolId
// useDeriveTokenDemand - POST /api/scenarios/:id/derive-token-demand
```

### 20b. Create `packages/frontend/src/pages/TokenLedger.tsx`

**Layout** (following existing page pattern):

1. **Header section**:
   - Breadcrumb: Scenarios > [Scenario Name] > Token Ledger
   - Title: "Token Ledger"
   - Subtitle: scenario name + period label
   - "Derive Demand" action button (calls POST /derive-token-demand)

2. **Summary cards row** (similar to stat-pills in ScenarioPlanner):
   - Total Supply | Total Demand (P50) | Total Demand (P90) | Net Position

3. **Main table**:
   - Columns: Pool Name | Supply | Demand (P50) | Demand (P90) | Delta (P50) | Delta (P90)
   - Delta cells color-coded: green text + light green bg for positive (surplus), red text + light red bg for negative (deficit)
   - Rows sorted by pool name
   - Use standard HTML table (matches FlowForecast table pattern, not VirtualTable since row count will be small)
   - Optionally: inline edit for supply values (click to edit input pattern)

4. **Binding Constraints section** (below table):
   - Card/panel with header "Binding Constraints"
   - Lists pools with deficit (delta < 0), sorted most severe first
   - Each row shows: pool name, deficit amount, and a small red progress bar showing how much over-budget
   - Empty state: "No binding constraints -- all pools have sufficient supply"

5. **Feature flag + mode guard**:
   - Check `useFeatureFlag('token_flow_v1')` or whatever flag name the backend uses
   - Check `scenario.planningMode === 'TOKEN'` (redirect to scenario detail if LEGACY)
   - Show appropriate message if feature not enabled

### 20c. Add route in `packages/frontend/src/router.tsx`

Add lazy import and route:

```ts
const TokenLedger = lazy(() =>
  import('./pages/TokenLedger').then((m) => ({ default: m.TokenLedger }))
);

// In router children, after scenarios/:id:
{
  path: 'scenarios/:id/token-ledger',
  element: (
    <ErrorBoundary>
      <LazyPage>
        <TokenLedger />
      </LazyPage>
    </ErrorBoundary>
  ),
}
```

### 20d. Add "Token Ledger" link/tab in ScenarioPlanner

In `ScenarioPlanner.tsx`, when `scenario.planningMode === 'TOKEN'`:
- Add a button/link in the header-right area: "Token Ledger" with a navigate to `/scenarios/${id}/token-ledger`
- Or alternatively, add it as a tab in the visualization panel (bottom panel) alongside Quarter/Skill/Team tabs

I prefer the **link in header** approach since the Token Ledger is a full page with its own detail, not just a chart. A small button next to "Assumptions" styled as `btn-secondary` with a "Token Ledger" label navigating to the sub-route.

### 20e. Export new hooks from barrel file `packages/frontend/src/hooks/index.ts`

Add exports for all token ledger hooks and types.

### 20f. Add breadcrumb mapping in `Layout.tsx`

Add `'token-ledger': 'Token Ledger'` to the breadcrumb path-segment-to-label map (around line 273).

---

## File Ownership Summary

| File | Action |
|------|--------|
| `packages/frontend/src/hooks/usePlanningMode.ts` | **Create** |
| `packages/frontend/src/hooks/useTokenLedger.ts` | **Create** |
| `packages/frontend/src/pages/TokenLedger.tsx` | **Create** |
| `packages/frontend/src/hooks/useScenarios.ts` | **Edit** (add `planningMode` to Scenario interface) |
| `packages/frontend/src/pages/ScenarioPlanner.tsx` | **Edit** (add toggle + Token Ledger link) |
| `packages/frontend/src/router.tsx` | **Edit** (add TokenLedger route) |
| `packages/frontend/src/hooks/index.ts` | **Edit** (add exports) |
| `packages/frontend/src/components/Layout.tsx` | **Edit** (add breadcrumb label) |

## Dependencies

- Task #19 depends on Task #3 (PUT /api/scenarios/:id/planning-mode endpoint)
- Task #20 depends on Task #15 (GET /api/scenarios/:id/token-ledger endpoint) and Task #19

Both tasks are **blocked** until backend endpoints are available. The frontend code can be written against the expected API contracts and will work once the backend is deployed.
