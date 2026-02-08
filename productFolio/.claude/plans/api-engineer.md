# API Engineer Plan — Strangler Token Flow

## Overview
I own Tasks #3, #10, #11, #12, and #15. These span Phases 1, 4, and 5. All routes, schemas, and services follow existing codebase patterns (Fastify + Zod + Prisma singleton services).

---

## Task #3 (P1): PUT /api/scenarios/:id/planning-mode
**Blocked by**: #1 (PlanningMode enum), #2 (PlanningService)

### Schema: `packages/backend/src/schemas/planning.schema.ts` (NEW)
```ts
import { z } from 'zod';
import { PlanningMode } from '@prisma/client';

export const updatePlanningModeSchema = z.object({
  mode: z.nativeEnum(PlanningMode),
});
export type UpdatePlanningMode = z.infer<typeof updatePlanningModeSchema>;
```

### Route: `packages/backend/src/routes/planning.ts` (NEW)
- Fastify plugin `planningRoutes`
- `fastify.addHook('onRequest', fastify.authenticate)`
- `const MUTATION_ROLES = [UserRole.ADMIN, UserRole.PRODUCT_OWNER, UserRole.BUSINESS_OWNER]`
- `const authorizeMutation = fastify.authorize(MUTATION_ROLES)`
- **PUT /api/scenarios/:id/planning-mode**
  - `preHandler: [authorizeMutation]`
  - Parse body with `updatePlanningModeSchema`
  - Call `planningService.setMode(id, mode)`
  - Return 200 `{ planningMode: mode }`

### Registration: `packages/backend/src/index.ts`
- Add import: `import { planningRoutes } from './routes/planning.js';`
- Add registration: `await fastify.register(planningRoutes);`

---

## Task #10 (P4): Skill Pools CRUD
**Blocked by**: #8 (SkillPool model), #9 (seed data)

### Schema: `packages/backend/src/schemas/skill-pool.schema.ts` (NEW)
```ts
import { z } from 'zod';

export const createSkillPoolSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
});
export type CreateSkillPoolInput = z.infer<typeof createSkillPoolSchema>;

export const updateSkillPoolSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateSkillPoolInput = z.infer<typeof updateSkillPoolSchema>;

export const skillPoolFiltersSchema = z.object({
  includeInactive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});
export type SkillPoolFiltersInput = z.infer<typeof skillPoolFiltersSchema>;
```

### Service: `packages/backend/src/services/skill-pool.service.ts` (NEW)
- Class `SkillPoolService`
  - `list(includeInactive?: boolean)` — findMany with optional isActive filter, ordered by name
  - `getById(id: string)` — findUnique with tokenCalibrations, throw NotFoundError
  - `create(data: CreateSkillPoolInput)` — create with unique name check (ConflictError)
  - `update(id: string, data: UpdateSkillPoolInput)` — findUnique then update, name-conflict check
  - `delete(id: string)` — soft-delete: update isActive=false
- Export `skillPoolService` singleton

### Route: `packages/backend/src/routes/skill-pools.ts` (NEW)
- `fastify.addHook('onRequest', fastify.requireFeature('token_planning_v1'))`
- `fastify.addHook('onRequest', fastify.authenticate)`
- **GET /api/skill-pools** — list (any authenticated role)
- **GET /api/skill-pools/:id** — get by id (any role)
- **POST /api/skill-pools** — create (ADMIN only)
- **PUT /api/skill-pools/:id** — update (ADMIN only)
- **DELETE /api/skill-pools/:id** — soft delete (ADMIN only)

### Registration: index.ts
- Import + register `skillPoolsRoutes`

---

## Task #11 (P4): Token Supply Routes
**Blocked by**: #3 (planning routes), #8 (TokenSupply model)

### Schema: `packages/backend/src/schemas/token-supply.schema.ts` (NEW)
```ts
import { z } from 'zod';

export const upsertTokenSupplySchema = z.object({
  skillPoolId: z.string().uuid(),
  tokens: z.number().min(0),
  notes: z.string().max(1000).optional(),
});
export type UpsertTokenSupplyInput = z.infer<typeof upsertTokenSupplySchema>;
```

### Service: `packages/backend/src/services/token-supply.service.ts` (NEW)
- Class `TokenSupplyService`
  - `list(scenarioId: string)` — validate scenario exists, findMany where scenarioId, include skillPool
  - `upsert(scenarioId: string, data: UpsertTokenSupplyInput)` — validate scenario exists + planningMode=TOKEN (throw WorkflowError if LEGACY), validate skillPoolId exists, upsert on [scenarioId, skillPoolId]
  - `delete(scenarioId: string, skillPoolId: string)` — validate scenario, delete where [scenarioId, skillPoolId]
- Export `tokenSupplyService` singleton

### Route: extend `packages/backend/src/routes/planning.ts`
- Token supply routes added in Phase 4 (after Phase 1 creates the file):
- `const requireTokenPlanning = fastify.requireFeature('token_planning_v1')`
- **GET /api/scenarios/:id/token-supply** — `preHandler: [requireTokenPlanning]`, call `tokenSupplyService.list(id)`
- **PUT /api/scenarios/:id/token-supply** — `preHandler: [requireTokenPlanning, authorizeMutation]`, parse with upsertTokenSupplySchema, call `tokenSupplyService.upsert(id, data)`
- **DELETE /api/scenarios/:id/token-supply/:skillPoolId** — `preHandler: [requireTokenPlanning, authorizeMutation]`, call `tokenSupplyService.delete(id, skillPoolId)`

---

## Task #12 (P4): Token Demand Routes
**Blocked by**: #3 (planning routes), #8 (TokenDemand model)

### Schema: `packages/backend/src/schemas/token-demand.schema.ts` (NEW)
```ts
import { z } from 'zod';

export const upsertTokenDemandSchema = z.object({
  initiativeId: z.string().uuid(),
  skillPoolId: z.string().uuid(),
  tokensP50: z.number().min(0),
  tokensP90: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
});
export type UpsertTokenDemandInput = z.infer<typeof upsertTokenDemandSchema>;

export const bulkUpsertTokenDemandSchema = z.object({
  items: z.array(upsertTokenDemandSchema).min(1).max(500),
});
export type BulkUpsertTokenDemandInput = z.infer<typeof bulkUpsertTokenDemandSchema>;
```

### Service: `packages/backend/src/services/token-demand.service.ts` (NEW)
- Class `TokenDemandService`
  - `list(scenarioId: string)` — validate scenario, findMany grouped by initiative (include skillPool + relations)
  - `upsert(scenarioId: string, data: UpsertTokenDemandInput)` — validate scenario + planningMode=TOKEN, validate initiativeId + skillPoolId exist, upsert on [scenarioId, initiativeId, skillPoolId]
  - `delete(id: string)` — findUnique, throw NotFoundError, then delete
  - `bulkUpsert(scenarioId: string, items: UpsertTokenDemandInput[])` — validate scenario + mode, run all upserts in `prisma.$transaction`
- Export `tokenDemandService` singleton

### Route: extend `packages/backend/src/routes/planning.ts`
- **GET /api/scenarios/:id/token-demand** — `preHandler: [requireTokenPlanning]`, call `tokenDemandService.list(id)`
- **PUT /api/scenarios/:id/token-demand** — `preHandler: [requireTokenPlanning, authorizeMutation]`, parse with upsertTokenDemandSchema
- **POST /api/scenarios/:id/token-demand/bulk** — `preHandler: [requireTokenPlanning, authorizeMutation]`, parse with bulkUpsertTokenDemandSchema
- **DELETE /api/scenarios/:id/token-demand/:demandId** — `preHandler: [requireTokenPlanning, authorizeMutation]`

---

## Task #15 (P5): GET /api/scenarios/:id/token-ledger
**Blocked by**: #14 (TokenFlowModel.getTokenLedgerSummary), #3 (planning routes)

### Route: extend `packages/backend/src/routes/planning.ts`
- **GET /api/scenarios/:id/token-ledger** — any authenticated role can read
  - `preHandler: [requireTokenPlanning]`
  - Load scenario, check `planningMode === TOKEN`, return 409 ConflictError if LEGACY
  - Call `planningService.getEngine(id)` then `engine.getTokenLedgerSummary(id)`
  - Return 200 with ledger summary

---

## planning.ts Growth Plan

The `planning.ts` file will grow across phases:

| Phase | Endpoints Added |
|-------|----------------|
| P1 (Task #3) | `PUT /api/scenarios/:id/planning-mode` |
| P4 (Task #11) | `GET/PUT/DELETE /api/scenarios/:id/token-supply` |
| P4 (Task #12) | `GET/PUT/POST/DELETE /api/scenarios/:id/token-demand` |
| P5 (Task #15) | `GET /api/scenarios/:id/token-ledger` |

All token routes share `requireFeature('token_planning_v1')` preHandler. The planning-mode endpoint has no feature flag guard (it's the core toggle).

---

## index.ts Changes Summary

Two new route registrations:
```ts
import { planningRoutes } from './routes/planning.js';
import { skillPoolsRoutes } from './routes/skill-pools.js';

await fastify.register(planningRoutes);
await fastify.register(skillPoolsRoutes);
```

---

## Service Validation Patterns

All token services (supply + demand) share this validation pattern:
1. Load scenario by id — throw `NotFoundError('Scenario', id)` if missing
2. Check `scenario.planningMode === 'TOKEN'` — throw `WorkflowError('Scenario must be in TOKEN planning mode')` if LEGACY
3. Validate referenced entities exist (skillPool, initiative)

---

## Files Created/Modified

| File | Action |
|------|--------|
| `schemas/planning.schema.ts` | NEW (Task #3) |
| `schemas/skill-pool.schema.ts` | NEW (Task #10) |
| `schemas/token-supply.schema.ts` | NEW (Task #11) |
| `schemas/token-demand.schema.ts` | NEW (Task #12) |
| `routes/planning.ts` | NEW (Task #3), extended (Tasks #11, #12, #15) |
| `routes/skill-pools.ts` | NEW (Task #10) |
| `services/skill-pool.service.ts` | NEW (Task #10) |
| `services/token-supply.service.ts` | NEW (Task #11) |
| `services/token-demand.service.ts` | NEW (Task #12) |
| `index.ts` | MODIFY — 2 imports + 2 registrations |
