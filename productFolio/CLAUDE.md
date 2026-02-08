# ProductFolio

Portfolio management and resource allocation platform for planning initiatives, managing employee capacity, and optimizing resource allocation across scenarios.

## Quick Start

```bash
# Start database
docker-compose up -d

# Install dependencies
npm install

# Setup database
npm run db:generate
npm run db:push

# Development
npm run dev           # All packages
npm run dev:backend   # Backend only (port 3000)
npm run dev:frontend  # Frontend only (port 5173)
```

## Tech Stack

- **Backend**: Fastify 4.26, TypeScript, Prisma 5.9, Zod 4.3, Vitest, BullMQ, jose (JWKS)
- **Frontend**: React 18.2, Vite 5.1, @auth0/auth0-react
- **Database**: PostgreSQL 16 (port 5433 local → 5432 container)
- **Cache/Queue**: Redis 7 (port 6379)

## Project Structure

```
packages/
├── backend/
│   └── src/
│       ├── index.ts          # Fastify server entry
│       ├── worker.ts         # Background worker entry
│       ├── routes/           # API route handlers
│       ├── services/         # Business logic
│       ├── schemas/          # Zod validation schemas
│       ├── planning/         # Planning engine (Strangler Pattern)
│       │   ├── types.ts      # TokenLedgerSummary, BindingConstraint DTOs
│       │   ├── planning-engine.ts  # PlanningEngine interface
│       │   ├── planning.service.ts # Mode dispatch (LEGACY/TOKEN)
│       │   ├── legacy-time-model.ts # Delegates to existing services
│       │   ├── token-flow-model.ts  # Token ledger computation
│       │   └── derive-demand.ts     # Derive token demand from scope items
│       ├── plugins/          # Fastify plugins (auth, feature flags)
│       ├── lib/              # Error handling, Prisma client, Redis
│       ├── jobs/             # BullMQ background jobs
│       │   ├── queue.ts      # Queue definitions
│       │   ├── worker.ts     # Worker setup
│       │   ├── scheduler.ts  # Recurring jobs
│       │   └── processors/   # Job processors
│       ├── types/            # TypeScript interfaces
│       └── tests/            # Vitest tests
└── frontend/
    └── src/
        ├── main.tsx          # React entry
        └── App.tsx           # Root component
```

## Key Commands

| Command | Description |
|---------|-------------|
| `npm run test` | Run all tests |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run db:migrate` | Run database migrations |
| `npm run build` | Build all packages |
| `npm run dev:worker` | Run background worker (dev mode) |
| `npm run start:worker` | Run background worker (production) |

## Architecture

**Layers**: Routes → Services → Prisma (Database)
**Planning Layer**: Routes → PlanningService → PlanningEngine (LegacyTimeModel | TokenFlowModel) → Services → Prisma

**Core Entities**:
- **Initiative**: Business projects with status workflow (PROPOSED → SCOPING → RESOURCING → IN_EXECUTION → COMPLETE)
- **ScopeItem**: Work items with skill demands and P50/P90 estimates
- **Employee**: Team members with skills, capacity calendars, and manager hierarchy
- **Scenario**: What-if planning with allocations and priority rankings; supports `planningMode` (LEGACY or TOKEN)
- **Allocation**: Employee assignments to initiatives with date ranges and percentages
- **SkillPool**: Named capacity pools (backend, frontend, data, qa, domain) for token planning
- **TokenSupply/TokenDemand**: Token-based supply and demand per skill pool per scenario
- **TokenCalibration**: Conversion rate (tokenPerHour) for deriving token demand from hour estimates
- **ForecastRun**: Monte Carlo simulation results (scope-based or empirical mode)
- **FeatureFlag**: Feature flags for gradual rollout (`token_planning_v1`, `flow_forecast_v1`, etc.)

## API Patterns

- Base URL: `/api`
- Pagination: `?page=1&limit=20` returns `{ page, limit, total, totalPages }`
- Validation: Zod schemas in `schemas/` directory
- Errors: Custom classes in `lib/errors.ts` (NotFoundError, ValidationError, WorkflowError, ConflictError)

## API Endpoints

**Initiatives**: `/api/initiatives` - CRUD, status transitions, bulk ops, CSV import/export
**Scoping**: `/api/initiatives/:id/scope-items` - Scope items, approval workflow
**Resources**: `/api/employees` - Employees, skills, capacity calendars
**Scenarios**: `/api/scenarios` - Scenarios, allocations, capacity-demand analysis, planning mode toggle
**Planning (Token)**: `/api/scenarios/:id/token-supply`, `token-demand`, `token-ledger`, `derive-token-demand` (requires `token_planning_v1` flag)
**Skill Pools**: `/api/skill-pools` - CRUD for token planning pools (requires `token_planning_v1` flag)
**Forecasting**: `/api/forecast` - Monte Carlo scope-based and empirical forecasts (requires `flow_forecast_v1` flag)
**Feature Flags**: `/api/feature-flags` - Admin CRUD for feature flags
**Job Profiles**: `/api/job-profiles` - Job profiles with skills and cost bands
**Jobs**: `/api/jobs` - Background job status and management

## Background Jobs (BullMQ)

Three job queues handle async processing:

| Queue | Purpose | Trigger |
|-------|---------|---------|
| `scenario-recompute` | Recalculate demand/capacity | Allocation or priority changes |
| `csv-import` | Async initiative imports | Large CSV imports (>100 rows) |
| `view-refresh` | Refresh materialized views | Scheduled (every 15 min) or on-demand |

**Running the worker**: Start `npm run dev:worker` in a separate terminal alongside the API server.

**Job status API**:
- `GET /api/jobs/status` - Queue counts
- `GET /api/jobs/:queue/:jobId` - Single job status
- `GET /api/jobs/:queue/recent?status=completed` - Recent jobs

## Testing

```bash
npm run test              # Run tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
```

Test utilities in `tests/setup.ts`: `buildTestApp()`, mock data generators, `testUuid()`

## Authentication (Auth0)

Auth0 handles login/signup/logout. The backend verifies RS256 JWTs via Auth0's JWKS endpoint.

- **Backend plugin**: `src/plugins/auth.plugin.ts` — uses `jose` to verify Bearer tokens against `https://{AUTH0_DOMAIN}/.well-known/jwks.json`
- **Auto-provisioning**: `src/services/auth.service.ts` `findOrProvisionUser()` — matches by `auth0Sub`, then email, then creates new VIEWER user
- **Frontend**: `Auth0Provider` in `App.tsx`, token injected via `setTokenProvider(getAccessTokenSilently)` in `AuthSyncProvider`
- **API client**: `src/api/client.ts` — attaches `Authorization: Bearer` header on all requests
- **Only auth endpoint**: `GET /api/auth/me` — returns local user profile (role, name)

Decorators `fastify.authenticate` and `fastify.authorize(roles)` are unchanged — route files don't need auth-related modifications.

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost:5433/productfolio
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Auth0
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=https://api.productfolio.local

# Redis (for caching and job queues)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

Frontend env (`packages/frontend/.env`):
```env
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_AUTH0_AUDIENCE=https://api.productfolio.local
```

## Planning Modes (Strangler Pattern)

Scenarios have a `planningMode` field (`LEGACY` default, `TOKEN` opt-in):
- **LEGACY**: Time-based planning via `allocationService` and `scenarioCalculatorService`
- **TOKEN**: Token flow planning via skill pools, token supply/demand, and ledger summaries

`PlanningService.getEngine(scenarioId)` reads `planningMode` and returns the appropriate `PlanningEngine` implementation. Existing `/capacity-demand` and `/calculator` endpoints are routed through this layer — LEGACY mode output is identical to pre-Strangler behavior.

Toggle mode: `PUT /api/scenarios/:id/planning-mode` with `{ mode: "TOKEN" | "LEGACY" }`.

## Feature Flags

| Flag | Description |
|------|-------------|
| `token_planning_v1` | Token flow planning mode + skill pools + token ledger |
| `flow_forecast_v1` | Flow forecasting (Monte Carlo Mode A) |
| `forecast_mode_b` | Empirical forecasting (Mode B) |
| `org_capacity_view` | Org capacity rollup page |
| `job_profiles` | Job profiles admin |

Backend: `fastify.requireFeature('flag_key')` returns a preHandler that throws `NotFoundError('Resource')` when disabled.
Frontend: `useFeatureFlag('flag_key')` hook for conditional rendering.

## Conventions

- UUIDs for all primary keys
- TypeScript strict mode enabled
- ESM modules throughout
- Skill demands stored as JSON: `{frontend: 2, backend: 3}`
- Approval workflow uses version tracking for audit trails
- ADDITIVE schema changes only — never rename or remove existing tables/fields
- Feature flag guards on new feature routes
- Use agent-browser skill for browser tests
