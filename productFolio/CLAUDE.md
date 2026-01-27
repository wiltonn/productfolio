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

- **Backend**: Fastify 4.26, TypeScript, Prisma 5.9, Zod 4.3, Vitest, BullMQ
- **Frontend**: React 18.2, Vite 5.1
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

**Core Entities**:
- **Initiative**: Business projects with status workflow (DRAFT → PENDING_APPROVAL → APPROVED → IN_PROGRESS → COMPLETED)
- **ScopeItem**: Work items with skill demands and P50/P90 estimates
- **Employee**: Team members with skills, capacity calendars, and manager hierarchy
- **Scenario**: What-if planning with allocations and priority rankings
- **Allocation**: Employee assignments to initiatives with date ranges and percentages

## API Patterns

- Base URL: `/api`
- Pagination: `?page=1&limit=20` returns `{ page, limit, total, totalPages }`
- Validation: Zod schemas in `schemas/` directory
- Errors: Custom classes in `lib/errors.ts` (NotFoundError, ValidationError, WorkflowError, ConflictError)

## API Endpoints

**Initiatives**: `/api/initiatives` - CRUD, status transitions, bulk ops, CSV import/export
**Scoping**: `/api/initiatives/:id/scope-items` - Scope items, approval workflow
**Resources**: `/api/employees` - Employees, skills, capacity calendars
**Scenarios**: `/api/scenarios` - Scenarios, allocations, capacity-demand analysis
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

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost:5433/productfolio
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Redis (for caching and job queues)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

## Conventions

- UUIDs for all primary keys
- TypeScript strict mode enabled
- ESM modules throughout
- Skill demands stored as JSON: `{frontend: 2, backend: 3}`
- Approval workflow uses version tracking for audit trails
