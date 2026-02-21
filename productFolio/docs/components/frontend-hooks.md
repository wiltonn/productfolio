# Frontend Hooks Reference

All hooks live in `packages/frontend/src/hooks/` and are re-exported through the barrel file `index.ts`.
Every data-fetching hook uses **TanStack React Query** (`@tanstack/react-query`). Mutations display toast notifications on success/error via the `toast` store.

---

## 1. Auth

### `useAuth.ts`

**Query Keys**

```ts
authKeys = {
  all: ['auth'],
  me: () => ['auth', 'me'],
};
```

| Hook | Type | Description | API Endpoint | Cache Strategy |
|------|------|-------------|--------------|----------------|
| `useCurrentUser(tokenReady?)` | Query | Fetches the current user profile and hydrates the `useAuthStore` Zustand store. Only fires when `tokenReady` is `true`. | `GET /auth/me` | staleTime 5 min, retry false |
| `useLogout()` | Imperative | Clears local auth state and triggers Auth0 logout redirect. Returns `{ logout, isPending }`. | N/A (Auth0 SDK) | N/A |

**Return Types**
- `useCurrentUser` returns `User | null` (from `stores/auth.store`).

---

### `useAuth0Admin.ts`

No query keys (mutation-only file).

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useSyncRoles()` | Mutation | Syncs local roles to Auth0. | `POST /admin/auth0/sync-roles` | None |
| `useSyncAllUsers()` | Mutation | Syncs all local users to Auth0. | `POST /admin/auth0/sync-all-users` | None |
| `useSyncUser()` | Mutation | Syncs a single user to Auth0 by user ID. | `POST /admin/auth0/sync-user/:userId` | None |

---

### `useAuthz.ts`

No query keys, no API calls. Reads from `useAuthStore` (Zustand).

| Hook | Type | Description |
|------|------|-------------|
| `useAuthz()` | Derived state | Returns `{ permissions, hasPermission(p), hasAny(ps), hasAll(ps), isAdmin, seatType, isLicensed, tier }` derived from the current user's auth store. |

---

## 2. Core Data

### `useInitiatives.ts`

**Query Keys**

```ts
initiativeKeys = {
  all: ['initiatives'],
  lists: () => ['initiatives', 'list'],
  list: (filters) => ['initiatives', 'list', filters],
  details: () => ['initiatives', 'detail'],
  detail: (id) => ['initiatives', 'detail', id],
  allocations: (id, periodId?) => ['initiatives', 'allocations', id, periodId],
  allocationHours: (ids, datesKey) => ['initiatives', 'allocationHours', ids, datesKey],
  allocationHoursByType: (ids, datesKey) => ['initiatives', 'allocationHoursByType', ids, datesKey],
};
```

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useInitiatives(filters?)` | Query | Paginated initiative list with status, search, quarter, owner, area, orgNode filters. | `GET /initiatives?...` | Default |
| `useInitiative(id)` | Query | Single initiative by ID. Enabled when `id` is truthy. | `GET /initiatives/:id` | Default |
| `useInitiativeAllocationsAll(id, periodId?)` | Query | All allocations for an initiative, optionally filtered by period. | `GET /initiatives/:id/allocations` | Default |
| `useInitiativeAllocationHours(ids, qs, qe, ns, ne)` | Query | Aggregated allocation hours for multiple initiatives across two quarters. staleTime 30s. | `GET /initiatives/allocation-hours?...` | Default |
| `useInitiativeAllocationHoursByType(ids, qs, qe, ns, ne)` | Query | Allocation hours broken down by allocation type (PROJECT/RUN/SUPPORT). staleTime 30s. | `GET /initiatives/allocation-hours-by-type?...` | Default |
| `useCreateInitiative()` | Mutation | Creates a new initiative. | `POST /initiatives` | `initiativeKeys.lists()` |
| `useUpdateInitiative()` | Mutation | Updates an initiative. Uses **optimistic update** on the detail cache with rollback on error. | `PUT /initiatives/:id` | `detail(id)` + `lists()` |
| `useUpdateInitiativeStatus()` | Mutation | Transitions initiative status. Uses **optimistic update** with rollback. | `POST /initiatives/:id/status` | `detail(id)` + `lists()` |
| `useBulkUpdateStatus()` | Mutation | Bulk status update for multiple initiatives. | `PATCH /initiatives/bulk` | `initiativeKeys.all` (all) |
| `useBulkAddTags()` | Mutation | Bulk add tags to multiple initiatives. | `PATCH /initiatives/bulk` | `initiativeKeys.all` |
| `useDeleteInitiative()` | Mutation | Deletes a single initiative. | `DELETE /initiatives/:id` | `initiativeKeys.lists()` |
| `useBulkDeleteInitiatives()` | Mutation | Bulk delete multiple initiatives. | `POST /initiatives/bulk-delete` | `initiativeKeys.all` |
| `useExportInitiatives()` | Mutation | Exports initiatives as CSV file download. Uses direct `fetch` for blob. | `GET /initiatives/export?...` | None |
| `useImportInitiatives()` | Mutation | Imports initiatives from CSV data. Supports async mode for large imports (>100 rows). | `POST /initiatives/import` | `initiativeKeys.lists()` |

**Return Types**
- List: `PaginatedResponse<Initiative>`
- Detail: `Initiative`
- Allocations: `InitiativeAllocation[]`
- Hours: `Record<string, InitiativeAllocationHours>`
- Hours by type: `Record<string, InitiativeAllocationHoursByType>`

---

### `useScenarios.ts`

**Query Keys**

```ts
scenarioKeys = {
  all: ['scenarios'],
  lists: () => ['scenarios', 'list'],
  list: () => ['scenarios', 'list'],
  details: () => ['scenarios', 'detail'],
  detail: (id) => ['scenarios', 'detail', id],
  allocations: (id) => ['scenarios', 'detail', id, 'allocations'],
  initiativeAllocations: (scenarioId, initiativeId) =>
    ['scenarios', 'detail', scenarioId, 'initiativeAllocations', initiativeId],
  analysis: (id) => ['scenarios', 'detail', id, 'analysis'],
  calculator: (id, options?) => ['scenarios', 'detail', id, 'calculator', options],
  compare: (ids) => ['scenarios', 'compare', ids],
};
```

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useScenarios(options?)` | Query | List scenarios with optional periodIds and orgNodeId filters. Limit 100. | `GET /scenarios?...` | Default |
| `useScenario(id)` | Query | Single scenario by ID. | `GET /scenarios/:id` | Default |
| `useScenarioAllocations(id)` | Query | All allocations for a scenario. | `GET /scenarios/:id/allocations` | Default |
| `useInitiativeAllocations(scenarioId, initiativeId)` | Query | Allocations for a specific initiative within a scenario. | `GET /scenarios/:sid/initiatives/:iid/allocations` | Default |
| `useScenarioAnalysis(id)` | Query | Capacity-demand analysis (by skill). | `GET /scenarios/:id/capacity-demand` | Default |
| `useScenarioCalculator(id, options?)` | Query | Full calculator result with optional breakdown and cache skip. | `GET /scenarios/:id/calculator?...` | Default |
| `useCompareScenarios(ids)` | Query | Compare 2+ scenarios side by side. Enabled when `ids.length >= 2`. | `GET /scenarios/compare?...` | Default |
| `useCreateScenario()` | Mutation | Creates a new scenario. | `POST /scenarios` | `lists()` |
| `useUpdateScenario()` | Mutation | Updates scenario metadata. | `PUT /scenarios/:id` | `detail(id)` + `lists()` |
| `useDeleteScenario()` | Mutation | Deletes a scenario. | `DELETE /scenarios/:id` | `lists()` |
| `useUpdatePriorities()` | Mutation | Sets initiative priority rankings within a scenario. | `PUT /scenarios/:id/priorities` | `detail(id)` + `analysis(id)` |
| `useCloneScenario()` | Mutation | Clones a scenario to a target period with configurable inclusion of allocations and priorities. | `POST /scenarios/:id/clone` | `lists()` |
| `useSetPrimary()` | Mutation | Sets a scenario as the primary scenario. | `PUT /scenarios/:id/primary` | `lists()` + `all` |
| `useCreateAllocation()` | Mutation | Creates an allocation within a scenario. | `POST /scenarios/:id/allocations` | `allocations(id)` + `analysis(id)` + `calculator(id)` + initiative-specific |
| `useUpdateAllocation()` | Mutation | Updates an existing allocation. | `PUT /allocations/:id` | `allocations(sid)` + `analysis(sid)` + `calculator(sid)` |
| `useDeleteAllocation()` | Mutation | Deletes an allocation. | `DELETE /allocations/:id` | `allocations(sid)` + `analysis(sid)` + `calculator(sid)` + initiative-specific |
| `useAutoAllocatePreview()` | Mutation | Computes proposed auto-allocations (preview only, not persisted). | `POST /scenarios/:id/auto-allocate` | None |
| `useAutoAllocateApply()` | Mutation | Applies proposed auto-allocations. | `POST /scenarios/:id/auto-allocate/apply` | `allocations(sid)` + `analysis(sid)` + `calculator(sid)` + `detail(sid)` |
| `useInvalidateCalculatorCache()` | Mutation | Manually invalidates server-side calculator cache. | `POST /scenarios/:id/calculator/invalidate` | `calculator(id)` |
| `useTransitionScenarioStatus()` | Mutation | Transitions scenario status (DRAFT/LOCKED/APPROVED etc.). | `PUT /scenarios/:id/status` | `detail(id)` + `lists()` |
| `useScenarioPermissions(scenario)` | Derived | Returns `{ canEdit, canTransition, canModifyAllocations, isReadOnly, hasMutationRole }` based on user role and scenario status. | N/A | N/A |

**Return Types**
- `Scenario`, `Allocation`, `CapacityAnalysis[]`, `CalculatorResult`, `ScenarioComparison[]`, `AutoAllocateResult`

---

### `useEmployees.ts`

**Query Keys**

```ts
employeeKeys = {
  all: ['employees'],
  lists: () => ['employees', 'list'],
  list: (filters) => ['employees', 'list', filters],
  details: () => ['employees', 'detail'],
  detail: (id) => ['employees', 'detail', id],
  skills: (id) => ['employees', 'detail', id, 'skills'],
  domains: (id) => ['employees', 'detail', id, 'domains'],
  capacity: (id) => ['employees', 'detail', id, 'capacity'],
  allocations: (id) => ['employees', 'detail', id, 'allocations'],
  availability: (id, start, end) => ['employees', 'detail', id, 'availability', start, end],
  allocationSummaries: (ids, dates) => ['employees', 'allocation-summaries', ids.join(','), dates],
  ptoHours: (ids, dates) => ['employees', 'pto-hours', ids.join(','), dates],
};
```

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useEmployees(filters?)` | Query | Paginated employee list with department, skill, search filters. | `GET /employees?...` | Default |
| `useEmployee(id)` | Query | Single employee by ID. | `GET /employees/:id` | Default |
| `useEmployeeAllocations(id)` | Query | All allocations for an employee across scenarios. | `GET /employees/:id/allocations` | Default |
| `useCreateEmployee()` | Mutation | Creates a new employee. | `POST /employees` | `lists()` |
| `useUpdateEmployee()` | Mutation | Updates employee data. | `PUT /employees/:id` | `detail(id)` + `lists()` |
| `useDeleteEmployee()` | Mutation | Deletes an employee. | `DELETE /employees/:id` | `lists()` |
| `useEmployeeSkills(id)` | Query | Lists skills for an employee. | `GET /employees/:id/skills` | Default |
| `useAddSkill()` | Mutation | Adds a skill to an employee. | `POST /employees/:id/skills` | `skills(id)` + `detail(id)` |
| `useUpdateSkill()` | Mutation | Updates a skill's proficiency level. | `PUT /employees/:id/skills/:sid` | `skills(id)` |
| `useRemoveSkill()` | Mutation | Removes a skill from an employee. | `DELETE /employees/:id/skills/:sid` | `skills(id)` + `detail(id)` |
| `useEmployeeDomains(id)` | Query | Lists domains for an employee. | `GET /employees/:id/domains` | Default |
| `useAddDomain()` | Mutation | Adds a domain to an employee. | `POST /employees/:id/domains` | `domains(id)` + `detail(id)` + `lists()` |
| `useUpdateDomain()` | Mutation | Updates a domain's proficiency. | `PUT /employees/:id/domains/:did` | `domains(id)` |
| `useRemoveDomain()` | Mutation | Removes a domain from an employee. | `DELETE /employees/:id/domains/:did` | `domains(id)` + `detail(id)` + `lists()` |
| `useEmployeeCapacity(id)` | Query | Capacity calendar entries for an employee. | `GET /employees/:id/capacity` | Default |
| `useUpdateCapacity()` | Mutation | Bulk updates capacity calendar entries. | `PUT /employees/:id/capacity` | `capacity(id)` |
| `useEmployeeAvailability(id, start, end)` | Query | Availability summary (total, allocated, available hours, utilization). | `GET /employees/:id/availability?...` | Default |
| `useEmployeeAllocationSummaries(ids, qs, qe, ns, ne)` | Query | Quarter-level allocation summaries for multiple employees. staleTime 30s. | `GET /employees/allocation-summaries?...` | Default |
| `useEmployeePtoHours(ids, qs, qe, ns, ne)` | Query | PTO hours for current and next quarter for multiple employees. staleTime 30s. | `GET /employees/pto-hours?...` | Default |

**Return Types**
- `Employee`, `Skill`, `Domain`, `CapacityEntry`, `Availability`, `EmployeeAllocation[]`, `AllocationSummariesResponse`, `PtoHoursResponse`

---

### `useScoping.ts`

**Query Keys**

```ts
scopingKeys = {
  all: ['scoping'],
  scopeItems: (initiativeId) => ['scoping', 'scope-items', initiativeId],
  scopeItemsList: (initiativeId, page?) => ['scoping', 'scope-items', initiativeId, 'list', page],
  scopeItemDetail: (id) => ['scoping', 'scope-item', id],
  approvalHistory: (initiativeId) => ['scoping', 'approval-history', initiativeId],
};
```

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useScopeItems(initiativeId, options?)` | Query | Paginated scope items for an initiative. | `GET /initiatives/:id/scope-items?...` | Default |
| `useScopeItem(id)` | Query | Single scope item by ID. | `GET /scope-items/:id` | Default |
| `useCreateScopeItem()` | Mutation | Creates a scope item for an initiative. | `POST /initiatives/:id/scope-items` | `scopeItems(iid)` |
| `useUpdateScopeItem()` | Mutation | Updates a scope item (title, estimates, skill demands). | `PUT /scope-items/:id` | `scopeItemDetail(id)` + `scopeItems(iid)` |
| `useDeleteScopeItem()` | Mutation | Deletes a scope item. | `DELETE /scope-items/:id` | `scopeItems(iid)` |
| `useSubmitForApproval()` | Mutation | Submits an initiative for scope approval. | `POST /initiatives/:id/submit-approval` | `initiativeKeys.detail(id)` + `lists()` + `approvalHistory(id)` |
| `useApproveInitiative()` | Mutation | Approves an initiative's scope. | `POST /initiatives/:id/approve` | `initiativeKeys.detail(id)` + `lists()` + `approvalHistory(id)` |
| `useRejectInitiative()` | Mutation | Rejects an initiative's scope. | `POST /initiatives/:id/reject` | `initiativeKeys.detail(id)` + `lists()` + `approvalHistory(id)` |
| `useApprovalHistory(initiativeId)` | Query | Approval history entries for an initiative. | `GET /initiatives/:id/approval-history` | Default |

**Return Types**
- `ScopeItem`, `PaginatedResponse<ScopeItem>`, `ApprovalHistoryEntry[]`

---

### `usePeriods.ts`

**Query Keys**

```ts
periodKeys = {
  all: ['periods'],
  lists: () => ['periods', 'list'],
  list: (filters?) => ['periods', 'list', filters],
};
```

| Hook / Function | Type | Description | API Endpoint | Cache Strategy |
|----------------|------|-------------|--------------|----------------|
| `useQuarterPeriods()` | Query | Fetches all quarter periods (limit 100). staleTime 5 min. | `GET /periods?type=QUARTER&limit=100` | staleTime 5 min |
| `useAdjacentQuarters()` | Query | Returns last, current, and next quarter periods. staleTime 1 hour. | `GET /periods/adjacent-quarters` | staleTime 1 hour |
| `getQuarterPeriodIds(periods, start, end)` | Utility | Filters a period array to IDs within a label range (e.g., "2026-Q1" to "2026-Q4"). | N/A | N/A |
| `deriveQuarterRange(periodIds, periods)` | Utility | Converts period IDs back to a "label:label" range string. | N/A | N/A |

**Return Types**
- `Period`, `AdjacentQuarters`

---

### `usePortfolioAreas.ts`

**Query Keys**

```ts
portfolioAreaKeys = {
  all: ['portfolioAreas'],
  lists: () => ['portfolioAreas', 'list'],
  list: (filters?) => ['portfolioAreas', 'list', filters],
};
```

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `usePortfolioAreas()` | Query | Fetches all portfolio areas (limit 100). staleTime 60s. | `GET /portfolio-areas?limit=100` | Default |
| `useCreatePortfolioArea()` | Mutation | Creates a portfolio area. | `POST /portfolio-areas` | `lists()` |
| `useUpdatePortfolioArea()` | Mutation | Updates a portfolio area name. | `PUT /portfolio-areas/:id` | `lists()` |
| `useDeletePortfolioArea()` | Mutation | Deletes a portfolio area. | `DELETE /portfolio-areas/:id` | `lists()` |

**Return Types**
- `PaginatedResponse<PortfolioArea>`

---

### `usePortfolioAreaNodes.ts`

**Query Keys**

```ts
portfolioAreaNodeKeys = {
  all: ['portfolioAreaNodes'],
  list: () => ['portfolioAreaNodes', 'list'],
};
```

| Hook | Type | Description | API Endpoint | Cache Strategy |
|------|------|-------------|--------------|----------------|
| `usePortfolioAreaNodes()` | Query | Fetches org nodes that are portfolio areas. staleTime 60s. | `GET /org/portfolio-areas` | staleTime 60s |

**Return Types**
- `OrgNode[]`

---

## 3. Planning

### `usePlanningMode.ts`

**Query Keys**

```ts
planningModeKeys = {
  all: ['planningMode'],
  detail: (scenarioId) => ['planningMode', scenarioId],
};
```

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `usePlanningModeToggle()` | Mutation | Toggles a scenario between LEGACY and TOKEN planning modes. | `PUT /scenarios/:id/planning-mode` | `scenarioKeys.detail(id)` + `scenarioKeys.lists()` |

---

### `useTokenLedger.ts`

**Query Keys**

```ts
tokenLedgerKeys = {
  all: ['tokenLedger'],
  ledger: (scenarioId) => ['tokenLedger', 'ledger', scenarioId],
  supply: (scenarioId) => ['tokenLedger', 'supply', scenarioId],
  demand: (scenarioId) => ['tokenLedger', 'demand', scenarioId],
  skillPools: () => ['tokenLedger', 'skillPools'],
};
```

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useTokenLedger(scenarioId)` | Query | Full token ledger summary (rows, binding constraints, totals). staleTime 60s. | `GET /scenarios/:id/token-ledger` | Default |
| `useSkillPools()` | Query | All skill pools. staleTime 5 min. | `GET /skill-pools` | Default |
| `useTokenSupply(scenarioId)` | Query | Token supply entries for a scenario. | `GET /scenarios/:id/token-supply` | Default |
| `useTokenDemand(scenarioId)` | Query | Token demand entries for a scenario. | `GET /scenarios/:id/token-demand` | Default |
| `useUpdateTokenSupply()` | Mutation | Updates supply for a specific pool in a scenario. | `PUT /scenarios/:id/token-supply/:poolId` | `supply(sid)` + `ledger(sid)` |
| `useUpdateTokenDemand()` | Mutation | Updates demand (P50/P90) for a specific pool in a scenario. | `PUT /scenarios/:id/token-demand/:poolId` | `demand(sid)` + `ledger(sid)` |
| `useDeriveTokenDemand()` | Mutation | Derives token demand from scope item estimates via calibration rates. | `POST /scenarios/:id/derive-token-demand` | `demand(sid)` + `ledger(sid)` |

**Return Types**
- `TokenLedgerSummary`, `SkillPool[]`, `TokenSupplyEntry[]`, `TokenDemandEntry[]`

---

## 4. Forecasting

### `useForecast.ts`

**Query Keys**

```ts
forecastKeys = {
  all: ['forecast'],
  runs: (filters?) => ['forecast', 'runs', filters],
  run: (id) => ['forecast', 'run', id],
  dataQuality: (params?) => ['forecast', 'dataQuality', params],
};
```

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useForecastRuns(filters?)` | Query | Paginated list of past forecast runs. Filterable by scenarioId and mode. staleTime 30s. | `GET /forecast/runs?...` | Default |
| `useForecastRun(id)` | Query | Single forecast run detail. | `GET /forecast/runs/:id` | Default |
| `useDataQuality(scenarioId?, initiativeIds?)` | Query | Data quality assessment (score 0-100, confidence, issues). staleTime 60s. | `GET /forecast/data-quality?...` | Default |
| `useRunScopeBasedForecast()` | Mutation | Runs a Mode A scope-based Monte Carlo forecast. | `POST /forecast/scope-based` | `forecastKeys.all` |
| `useRunEmpiricalForecast()` | Mutation | Runs a Mode B empirical (historical cycle time) forecast. | `POST /forecast/empirical` | `forecastKeys.all` |

**Return Types**
- `ForecastRun`, `PaginatedResponse<ForecastRun>`, `DataQualityResult`, `ScopeBasedForecastResult`, `EmpiricalForecastResult`

---

## 5. Organization

### `useOrgTree.ts`

**Query Keys**

```ts
orgTreeKeys = {
  all: ['orgTree'],
  tree: () => ['orgTree', 'tree'],
  nodes: () => ['orgTree', 'nodes'],
  node: (id) => ['orgTree', 'node', id],
  ancestors: (id) => ['orgTree', 'ancestors', id],
  descendants: (id) => ['orgTree', 'descendants', id],
  coverage: () => ['orgTree', 'coverage'],
  memberships: () => ['orgTree', 'memberships'],
  membershipList: (filters) => ['orgTree', 'memberships', filters],
  employeeMembership: (id) => ['orgTree', 'employeeMembership', id],
};
```

**Tree Queries**

| Hook | Type | Description | API Endpoint | Cache Strategy |
|------|------|-------------|--------------|----------------|
| `useOrgTree()` | Query | Full org tree (flat array of OrgNode with parent references). staleTime 60s. | `GET /org/tree` | staleTime 60s |
| `useOrgNodes(filters?)` | Query | Org nodes with parentId, type, isActive, search filters. | `GET /org/nodes?...` | Default |
| `useOrgNode(id)` | Query | Single org node. staleTime 60s. | `GET /org/nodes/:id` | staleTime 60s |
| `useOrgNodeAncestors(id)` | Query | Ancestor chain for a node (internal, currently unused). | `GET /org/nodes/:id/ancestors` | Default |
| `useOrgNodeDescendants(id)` | Query | Descendant tree for a node (internal, currently unused). | `GET /org/nodes/:id/descendants` | Default |
| `useCoverageReport()` | Query | Org coverage report. staleTime 60s. | `GET /org/coverage` | staleTime 60s |

**Node Mutations**

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useCreateNode()` | Mutation | Creates an org node (name, code, type, parentId, managerId, etc.). | `POST /org/nodes` | `orgTreeKeys.all` |
| `useUpdateNode()` | Mutation | Updates node properties. | `PUT /org/nodes/:id` | `orgTreeKeys.all` |
| `useMoveNode()` | Mutation | Moves a node to a new parent. | `POST /org/nodes/:id/move` | `orgTreeKeys.all` |
| `useDeleteNode()` | Mutation | Deletes an org node. | `DELETE /org/nodes/:id` | `orgTreeKeys.all` |

**Membership Queries and Mutations**

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useMemberships(filters?)` | Query | Paginated memberships with orgNodeId, employeeId, activeOnly filters. | `GET /org/memberships?...` | Default |
| `useEmployeeMembershipHistory(id)` | Query | Full membership history for an employee. | `GET /org/memberships/employee/:id` | Default |
| `useAssignMembership()` | Mutation | Assigns an employee to an org node. | `POST /org/memberships` | `orgTreeKeys.all` |
| `useBulkAssignMembership()` | Mutation | Bulk assigns multiple employees to a node. | `POST /org/memberships/bulk` | `orgTreeKeys.all` |
| `useEndMembership()` | Mutation | Ends (soft-deletes) a membership. | `DELETE /org/memberships/:id` | `orgTreeKeys.all` |

**Return Types**
- `OrgNode[]`, `OrgNode`, `OrgMembership`, `CoverageReport`, `PaginatedResponse<OrgMembership>`

---

### `useOrgCapacity.ts`

**Query Keys**

```ts
orgCapacityKeys = {
  all: ['orgCapacity'],
  capacity: (nodeId, scenarioId) => ['orgCapacity', 'capacity', nodeId, scenarioId],
  employees: (nodeId) => ['orgCapacity', 'employees', nodeId],
};
```

| Hook | Type | Description | API Endpoint | Cache Strategy |
|------|------|-------------|--------------|----------------|
| `useOrgCapacity(nodeId, scenarioId)` | Query | Full capacity analysis for an org node within a scenario (demand, capacity, gap, issues). staleTime 30s. | `GET /org/nodes/:id/capacity?scenarioId=...` | staleTime 30s |
| `useOrgNodeEmployees(nodeId)` | Query | Employees belonging to an org node with skills, job profile, and allocations. staleTime 30s. | `GET /org/nodes/:id/employees` | staleTime 30s |

**Return Types**
- `OrgCapacityResult` (includes demandBySkillPeriod, capacityBySkillPeriod, gapAnalysis, issues, summary)
- `OrgNodeEmployeesResponse`

---

### `useEmployeeOrgLinks.ts`

**Query Keys**

```ts
employeeOrgLinkKeys = {
  all: ['employeeOrgLinks'],
  lists: () => ['employeeOrgLinks', 'list'],
  list: (filters?) => ['employeeOrgLinks', 'list', filters],
  employee: (id) => ['employeeOrgLinks', 'employee', id],
  employeeHome: (id) => ['employeeOrgLinks', 'employee', id, 'home'],
  employeeHistory: (id) => ['employeeOrgLinks', 'employee', id, 'history'],
  employeeCapacity: (id) => ['employeeOrgLinks', 'employee', id, 'capacity'],
  orgNodeLinks: (id, relType?) => ['employeeOrgLinks', 'orgNode', id, relType],
};
```

| Hook | Type | Description | API Endpoint | Cache Strategy |
|------|------|-------------|--------------|----------------|
| `useEmployeeOrgLinks(filters?)` | Query | Paginated links with employeeId, orgNodeId, relationshipType, activeOnly, consumeCapacityOnly filters. staleTime 60s. | `GET /org/links?...` | staleTime 60s |
| `useActiveEmployeeLinks(employeeId)` | Query | Active links for an employee. staleTime 60s. | `GET /org/links/employee/:id` | staleTime 60s |
| `useEmployeeHomeOrg(employeeId)` | Query | PRIMARY_REPORTING link for an employee (home org). staleTime 60s. | `GET /org/links/employee/:id/home` | staleTime 60s |
| `useEmployeeLinkHistory(employeeId)` | Query | Full link history including ended links. | `GET /org/links/employee/:id/history` | Default |
| `useEmployeeCapacityLinks(employeeId)` | Query | Capacity-consuming links for an employee. staleTime 60s. | `GET /org/links/employee/:id/capacity` | staleTime 60s |
| `useOrgNodeLinks(orgNodeId, relType?)` | Query | Links for a specific org node, optionally filtered by relationship type. staleTime 60s. | `GET /org/nodes/:id/links?...` | staleTime 60s |
| `useCreateEmployeeOrgLink()` | Mutation | Creates a new org link. | `POST /org/links` | `employeeOrgLinkKeys.all` |
| `useUpdateEmployeeOrgLink()` | Mutation | Updates link allocation, capacity flag, or end date. | `PATCH /org/links/:id` | `employeeOrgLinkKeys.all` |
| `useEndEmployeeOrgLink()` | Mutation | Ends (soft-deletes) a link. | `DELETE /org/links/:id` | `employeeOrgLinkKeys.all` |
| `useReassignPrimaryReporting()` | Mutation | Atomically reassigns an employee's PRIMARY_REPORTING to a new org node. | `POST /org/links/reassign-primary` | `employeeOrgLinkKeys.all` |
| `useMigrateFromMemberships()` | Mutation | Migrates legacy OrgMembership records to EmployeeOrgUnitLink. Supports dry-run mode. | `POST /org/links/migrate-from-memberships?dryRun=...` | `employeeOrgLinkKeys.all` |

**Return Types**
- `EmployeeOrgUnitLink`, `EmployeeOrgUnitLink[]`, `PaginatedResponse<EmployeeOrgUnitLink>`, migration result object

---

## 6. Administration

### `useFeatureFlags.ts`

**Query Keys**

```ts
featureFlagKeys = {
  all: ['featureFlags'],
  list: () => ['featureFlags', 'list'],
};
```

| Hook | Type | Description | API Endpoint | Cache Strategy |
|------|------|-------------|--------------|----------------|
| `useFeatureFlags()` | Query | Fetches all feature flags. staleTime 5 min. | `GET /feature-flags` | staleTime 5 min |
| `useFeatureFlag(key)` | Derived | Convenience hook returning `{ enabled, isLoading }` for a single flag. Returns `false` while loading or if flag is missing. | (uses `useFeatureFlags` internally) | N/A |
| `useUpdateFeatureFlag()` | Mutation | Updates a flag's enabled state, description, or metadata. | `PUT /feature-flags/:key` | `featureFlagKeys.list()` |

**Return Types**
- `FeatureFlag[]`, `{ enabled: boolean; isLoading: boolean }`

---

### `useJobProfiles.ts`

**Query Keys**

```ts
jobProfileKeys = {
  all: ['jobProfiles'],
  lists: () => ['jobProfiles', 'list'],
  list: (filters?) => ['jobProfiles', 'list', filters],
  details: () => ['jobProfiles', 'detail'],
  detail: (id) => ['jobProfiles', 'detail', id],
};
```

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useJobProfiles(filters?)` | Query | Paginated job profiles with search and isActive filters. staleTime 30s. | `GET /job-profiles?...` | Default |
| `useJobProfile(id)` | Query | Single job profile with skills and cost band. | `GET /job-profiles/:id` | Default |
| `useCreateJobProfile()` | Mutation | Creates a job profile with optional skills and cost band. | `POST /job-profiles` | `lists()` |
| `useUpdateJobProfile()` | Mutation | Updates a job profile. | `PUT /job-profiles/:id` | `jobProfileKeys.all` |
| `useDeleteJobProfile()` | Mutation | Deletes a job profile. | `DELETE /job-profiles/:id` | `lists()` |
| `useAssignJobProfile()` | Mutation | Assigns or unassigns a job profile to an employee. | `PUT /employees/:id/job-profile` | `jobProfileKeys.all` |

**Return Types**
- `JobProfile`, `PaginatedResponse<JobProfile>`

---

### `useUsers.ts`

**Query Keys**

```ts
userKeys = {
  all: ['users'],
  lists: () => ['users', 'list'],
  list: (filters) => ['users', 'list', filters],
  details: () => ['users', 'detail'],
  detail: (id) => ['users', 'detail', id],
};
```

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useUsers(filters?)` | Query | Paginated user list with role, search, includeInactive filters. staleTime 60s. | `GET /users?...` | Default |
| `useUser(id)` | Query | Single user detail including permissions. staleTime 60s. | `GET /users/:id` | Default |
| `useCreateUser()` | Mutation | Creates a user (email, name, optional role). | `POST /users` | `lists()` |
| `useUpdateUser()` | Mutation | Updates user name, role, or active status. | `PUT /users/:id` | `lists()` + `details()` |
| `useDeactivateUser()` | Mutation | Deactivates (soft-deletes) a user. | `DELETE /users/:id` | `lists()` |

**Return Types**
- `User`, `UserDetail`, `UsersResponse`

---

### `useAuthorities.ts`

**Query Keys**

```ts
authorityKeys = {
  all: ['authorities'],
  lists: () => ['authorities', 'list'],
  roleMapping: () => ['authorities', 'role-mapping'],
  drift: () => ['authorities', 'drift'],
  effective: (userId) => ['authorities', 'effective', userId],
  auditLog: (page) => ['authorities', 'audit-log', page],
};
```

| Hook | Type | Description | API Endpoint | Cache Strategy |
|------|------|-------------|--------------|----------------|
| `useAuthorities()` | Query | All authority codes. staleTime 60s. | `GET /authorities` | staleTime 60s |
| `useRoleMapping()` | Query | Role-to-authority mapping. staleTime 5 min. | `GET /authorities/role-mapping` | staleTime 5 min |
| `useAuthorityDrift()` | Query | Drift detection between code and registry. staleTime 30s. | `GET /authorities/drift` | staleTime 30s |
| `useEffectivePermissions(userId)` | Query | Effective permissions for a specific user. | `GET /authorities/user/:id/effective` | Default |
| `useAuthorityAuditLog(page?)` | Query | Paginated audit log of authority changes (20 per page). staleTime 15s. | `GET /authorities/audit-log?...` | staleTime 15s |
| `useUpdateAuthority()` | Mutation | Updates an authority's description or deprecated flag. | `PUT /authorities/:code` | `lists()` + `drift()` |

**Return Types**
- `Authority[]`, `Record<string, string[]>`, `DriftResult`, `EffectivePermissions`, paginated `AuditLogEntry`

---

### `useEntitlements.ts`

**Query Keys**

```ts
entitlementKeys = {
  all: ['entitlements'],
  summary: () => ['entitlements', 'summary'],
  lists: () => ['entitlements', 'list'],
  export: () => ['entitlements', 'export'],
  revops: () => ['entitlements', 'revops'],
  revopsEvents: (filters?) => ['entitlements', 'revops', 'events', filters],
};
```

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useEntitlementSummary()` | Query | Seat summary (licensed, observers, limit, tier, utilization). staleTime 60s. | `GET /api/admin/entitlements/summary` | Default |
| `useEntitlements()` | Query | Licensed and observer user lists. staleTime 60s. | `GET /api/admin/entitlements` | Default |
| `useUpdateTenantConfig()` | Mutation | Updates tier or seat limit. | `PUT /api/admin/entitlements/config` | `entitlementKeys.all` |
| `useExportEntitlements()` | Query | Exports entitlement data as CSV. Enabled manually (lazy). | `GET /api/admin/entitlements/export` | N/A |
| `useRevOpsSummary()` | Query | RevOps signals (blocked attempts, near limit, utilization). staleTime 60s. | `GET /api/admin/revops` | Default |
| `useRevOpsEvents(filters?)` | Query | Paginated entitlement events. staleTime 30s. | `GET /api/admin/revops/events?...` | Default |

**Return Types**
- `EntitlementSummary`, `EntitlementLists`, `RevOpsSignals`, paginated `EntitlementEvent`

---

## 7. Approval

### `useApprovals.ts`

**Query Keys**

```ts
approvalKeys = {
  all: ['approvals'],
  policies: (nodeId) => ['approvals', 'policies', nodeId],
  requests: () => ['approvals', 'requests'],
  requestList: (filters) => ['approvals', 'requests', filters],
  request: (id) => ['approvals', 'request', id],
  inbox: (filters?) => ['approvals', 'inbox', filters],
  myRequests: (filters?) => ['approvals', 'my', filters],
  preview: () => ['approvals', 'preview'],
  delegations: () => ['approvals', 'delegations'],
  audit: (filters?) => ['approvals', 'audit', filters],
};
```

**Policy Management**

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useNodePolicies(nodeId)` | Query | Approval policies for an org node. | `GET /org/nodes/:id/policies` | Default |
| `useCreatePolicy()` | Mutation | Creates an approval policy on a node. | `POST /org/nodes/:id/policies` | `approvalKeys.all` |
| `useUpdatePolicy()` | Mutation | Updates a policy. | `PUT /approval-policies/:id` | `approvalKeys.all` |
| `useDeletePolicy()` | Mutation | Deactivates a policy. | `DELETE /approval-policies/:id` | `approvalKeys.all` |
| `usePreviewChain()` | Mutation | Previews the approval chain for a given scope and subject. | `POST /approval-policies/preview` | None |

**Request Management**

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useApprovalRequests(filters?)` | Query | Paginated approval requests with scope, subject, status filters. | `GET /approval-requests?...` | Default |
| `useApprovalRequest(id)` | Query | Single approval request detail. | `GET /approval-requests/:id` | Default |
| `useApproverInbox(filters?)` | Query | Pending requests assigned to the current approver. | `GET /approval-requests/inbox?...` | Default |
| `useMyRequests(filters?)` | Query | Requests submitted by the current user. | `GET /approval-requests/my?...` | Default |
| `useCreateApprovalRequest()` | Mutation | Creates an approval request. | `POST /approval-requests` | `approvalKeys.all` |
| `useSubmitDecision()` | Mutation | Submits APPROVED/REJECTED decision on a request. | `POST /approval-requests/:id/decide` | `approvalKeys.all` |
| `useCancelRequest()` | Mutation | Cancels a pending request. | `POST /approval-requests/:id/cancel` | `approvalKeys.all` |

**Delegation Management**

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useActiveDelegations()` | Query | Active delegations. | `GET /delegations` | Default |
| `useCreateDelegation()` | Mutation | Creates a time-bounded delegation. | `POST /delegations` | `delegations()` |
| `useRevokeDelegation()` | Mutation | Revokes an active delegation. | `DELETE /delegations/:id` | `delegations()` |

**Audit**

| Hook | Type | Description | API Endpoint |
|------|------|-------------|--------------|
| `useAuditEvents(filters?)` | Query | Paginated audit events with entityType, entityId, actorId, action, date range filters. | `GET /audit?...` |

**Return Types**
- `ApprovalPolicy[]`, `ApprovalRequest`, `PaginatedResponse<ApprovalRequest>`, `ApprovalDelegation[]`, `PaginatedResponse<AuditEvent>`, `{ chain: ChainStep[] }`

---

### `useApprovalStatus.ts`

**Query Keys**

```ts
approvalStatusKeys = {
  all: ['approvalStatus'],
  subject: (subjectType, subjectId) => ['approvalStatus', subjectType, subjectId],
};
```

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useApprovalStatus(subjectType, subjectId)` | Query | Derives approval status for a subject (allocation, initiative, or scenario) from the requests list. Returns status, pending request, latest request, and isBlocking flag. staleTime 60s. | `GET /approval-requests?subjectType=...&subjectId=...&limit=10` | Default |
| `useRequestApproval()` | Mutation | Creates an approval request for a subject. | `POST /approval-requests` | `approvalStatusKeys.subject(type, id)` |

**Return Types**
- `ApprovalStatusResult { status: 'none'|'pending'|'approved'|'rejected'|'requires_approval', pendingRequest, latestRequest, isBlocking }`

---

## 8. Integration

### `useJiraIntegration.ts`

**Query Keys**

```ts
jiraKeys = {
  all: ['jira'],
  connections: () => ['jira', 'connections'],
  sites: (connectionId) => ['jira', 'sites', connectionId],
  projects: (siteId) => ['jira', 'projects', siteId],
  syncStatus: () => ['jira', 'sync-status'],
  syncRuns: (filters) => ['jira', 'sync-runs', filters],
};
```

**Connections**

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useJiraConnections()` | Query | All Jira connections. staleTime 30s. | `GET /integrations/jira/connections` | Default |
| `useConnectJira()` | Mutation | Initiates OAuth flow -- redirects browser to Atlassian. | `GET /integrations/jira/connect` | N/A (redirect) |
| `useDisconnectJira()` | Mutation | Removes a Jira connection. | `DELETE /integrations/jira/connections/:id` | `connections()` |

**Sites and Projects**

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useJiraSites(connectionId)` | Query | Sites for a connection. staleTime 60s. | `GET /integrations/jira/connections/:id/sites` | Default |
| `useSelectSites()` | Mutation | Updates selected sites for a connection. | `PUT /integrations/jira/connections/:id/sites` | `sites(cid)` + `connections()` |
| `useJiraProjects(siteId)` | Query | Projects for a site. staleTime 60s. | `GET /integrations/jira/sites/:id/projects` | Default |
| `useSelectProjects()` | Mutation | Updates selected projects for a site. | `PUT /integrations/jira/sites/:id/projects` | `projects(sid)` + `connections()` |

**Sync**

| Hook | Type | Description | API Endpoint | Cache Strategy |
|------|------|-------------|--------------|----------------|
| `useSyncStatus()` | Query | Current sync status. staleTime 15s, auto-refetches every 30s. | `GET /integrations/jira/sync/status` | refetchInterval 30s |
| `useSyncRuns(filters?)` | Query | Paginated sync run history. staleTime 15s. | `GET /integrations/jira/sync/runs?...` | staleTime 15s |
| `useTriggerSync()` | Mutation | Enqueues a sync job (optional connection/site/fullResync params). | `POST /integrations/jira/sync` | `syncStatus()` |

**Return Types**
- `JiraConnection[]`, `JiraSite[]`, `JiraProject[]`, `JiraProjectSelection[]`, `SyncStatus`, `PaginatedResponse<SyncRun>`

---

## 9. Intake

### `useIntake.ts`

**Query Keys**

```ts
intakeKeys = {
  all: ['intake'],
  lists: () => ['intake', 'list'],
  list: (filters) => ['intake', 'list', filters],
  details: () => ['intake', 'detail'],
  detail: (id) => ['intake', 'detail', id],
  stats: () => ['intake', 'stats'],
};
```

| Hook | Type | Description | API Endpoint | Cache Strategy |
|------|------|-------------|--------------|----------------|
| `useIntakeItems(filters?)` | Query | Paginated intake items with search, status, priority, site, project, linked, sorting filters. staleTime 30s. | `GET /intake?...` | staleTime 30s |
| `useIntakeItem(id)` | Query | Single intake item. | `GET /intake/:id` | Default |
| `useIntakeStats()` | Query | Intake statistics. staleTime 60s. | `GET /intake/stats` | staleTime 60s |

**Return Types**
- `PaginatedResponse<IntakeItem>`, `IntakeItem`, `IntakeStats`

---

### `useIntakeRequests.ts`

**Query Keys**

```ts
intakeRequestKeys = {
  all: ['intake-requests'],
  lists: () => ['intake-requests', 'list'],
  list: (filters) => ['intake-requests', 'list', filters],
  details: () => ['intake-requests', 'detail'],
  detail: (id) => ['intake-requests', 'detail', id],
  stats: () => ['intake-requests', 'stats'],
  pipeline: (periodId?) => ['intake-requests', 'pipeline', periodId],
};
```

| Hook | Type | Description | API Endpoint | Cache Invalidation |
|------|------|-------------|--------------|---------------------|
| `useIntakeRequests(filters?)` | Query | Paginated intake requests with status, portfolio area, org node, quarter, requester, sponsor, source, search filters. | `GET /intake-requests?...` | Default |
| `useIntakeRequest(id)` | Query | Single intake request. | `GET /intake-requests/:id` | Default |
| `useIntakeRequestStats()` | Query | Intake request statistics. staleTime 60s. | `GET /intake-requests/stats` | Default |
| `usePipelineStats(periodId?)` | Query | Pipeline statistics, optionally filtered by period. staleTime 60s. | `GET /intake-requests/pipeline?...` | Default |
| `useCreateIntakeRequest()` | Mutation | Creates an intake request. | `POST /intake-requests` | `lists()` + `stats()` |
| `useUpdateIntakeRequest()` | Mutation | Updates an intake request. | `PUT /intake-requests/:id` | `detail(id)` + `lists()` |
| `useDeleteIntakeRequest()` | Mutation | Deletes an intake request. | `DELETE /intake-requests/:id` | `lists()` + `stats()` |
| `useTransitionIntakeRequestStatus()` | Mutation | Transitions intake request status with optional closed reason and decision notes. | `POST /intake-requests/:id/status` | `detail(id)` + `lists()` + `stats()` |
| `useConvertToInitiative()` | Mutation | Converts an intake request to a full initiative. Also invalidates the initiatives list. | `POST /intake-requests/:id/convert` | `detail(id)` + `lists()` + `stats()` + `pipeline()` + `['initiatives', 'list']` |

**Return Types**
- `IntakeRequest`, `PaginatedResponse<IntakeRequest>`, `IntakeRequestStats`, `PipelineStats`, `{ initiative, intakeRequest }`

---

## 10. Rollups

### `useRollups.ts`

**Query Keys**

```ts
rollupKeys = {
  all: ['rollups'],
  portfolioAreas: (scenarioId) => ['rollups', 'portfolio-areas', scenarioId],
  orgNodes: (scenarioId) => ['rollups', 'org-nodes', scenarioId],
  businessOwners: (scenarioId) => ['rollups', 'business-owners', scenarioId],
};
```

| Hook | Type | Description | API Endpoint | Cache Strategy |
|------|------|-------------|--------------|----------------|
| `usePortfolioAreaRollup(scenarioId)` | Query | Triple constraint rollup by portfolio area. staleTime 60s. | `GET /scenarios/:id/rollups/portfolio-areas` | staleTime 60s |
| `useOrgNodeRollup(scenarioId)` | Query | Triple constraint rollup by org node. staleTime 60s. | `GET /scenarios/:id/rollups/org-nodes` | staleTime 60s |
| `useBusinessOwnerRollup(scenarioId)` | Query | Triple constraint rollup by business owner. staleTime 60s. | `GET /scenarios/:id/rollups/business-owners` | staleTime 60s |

**Return Types**
- `RollupResponse` (from `types/rollup.types`)

---

## 11. UI Utilities

### `useFocusTrap.ts`

No query keys, no API calls. Pure DOM hook.

| Hook | Type | Description |
|------|------|-------------|
| `useFocusTrap<T>({ isActive, returnFocusElement?, focusFirstElement? })` | DOM ref | Traps keyboard focus within a container element (Tab/Shift+Tab cycling). Returns a `containerRef` to attach to the DOM element. Restores focus to the previously active element on deactivation. |

**Parameters**
- `isActive: boolean` -- enables/disables the trap
- `returnFocusElement?: HTMLElement` -- explicit element to restore focus to
- `focusFirstElement?: boolean` (default `true`) -- auto-focus first focusable element on activation

---

### `useKeyboardShortcuts.ts`

No query keys, no API calls. Pure DOM hook.

| Hook / Function | Type | Description |
|----------------|------|-------------|
| `useKeyboardShortcuts({ shortcuts, enabled? })` | DOM listener | Registers global keyboard shortcuts. Ignores events in INPUT/TEXTAREA/contentEditable (except `/`). Supports `ctrl`, `alt`, `shift`, `meta` modifiers. |
| `formatShortcut(shortcut)` | Utility | Formats a shortcut for display (e.g., `{ key: 's', ctrl: true }` becomes `"Ctrl+S"` or `"Cmd+S"` on Mac). |

**Shortcut Shape**
```ts
interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  callback: () => void;
  description: string;
  preventDefault?: boolean;
}
```

---

### `useRoutePrefetch.ts`

No query keys, no API calls. Route-level code splitting optimization.

| Hook | Type | Description |
|------|------|-------------|
| `useRoutePrefetch(delay?)` | Side effect | Prefetches likely next route chunks based on a static `PREFETCH_MAP`. Triggers dynamic imports via `requestIdleCallback` after a configurable delay (default 2000ms). |
| `usePrefetchOnHover(route)` | Event handlers | Returns `{ onMouseEnter, onFocus }` handlers that trigger route chunk prefetch on hover/focus. |

**Prefetch Map**
| Current Route | Prefetched Routes |
|--------------|-------------------|
| `/login` | `/initiatives` |
| `/initiatives` | `/initiatives/:id`, `/capacity` |
| `/capacity` | `/scenarios`, `/initiatives` |
| `/scenarios` | `/scenarios/:id`, `/reports` |
| `/reports` | `/initiatives`, `/scenarios` |
