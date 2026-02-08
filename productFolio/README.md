# ProductFolio

Portfolio management and resource allocation platform for planning initiatives, managing employee capacity, and optimizing resource allocation across scenarios.

## Features

- **Initiative Management** - Track business projects through approval workflows
- **Resource Planning** - Manage employee skills, capacity, and availability
- **Scenario Planning** - Model what-if scenarios with different allocations
- **Capacity Analysis** - Compare demand vs. capacity across teams
- **Token Flow Planning** - Token-based capacity planning with skill pools, supply/demand ledger, and binding constraints (Strangler Pattern alongside legacy time-based planning)
- **Flow Forecasting** - Monte Carlo simulation with scope-based (Mode A) and empirical (Mode B) forecasting
- **Org Hierarchy** - Org tree with capacity rollups and coverage reporting
- **Intake Pipeline** - Intake request workflow with Jira integration
- **Background Jobs** - Async processing for imports and calculations
- **Auth0 Authentication** - Auth0 Universal Login with RS256 JWT verification
- **Feature Flags** - Gradual rollout of new features via feature flag system

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | Fastify 4.26, TypeScript, Prisma 5.9, Zod, BullMQ |
| **Frontend** | React 18.2, Vite 5.1, TanStack Query, Zustand, Tailwind CSS |
| **Database** | PostgreSQL 16 |
| **Cache/Queue** | Redis 7 |
| **Auth** | Auth0 SPA (PKCE), jose (JWKS RS256), @auth0/auth0-react |

## Quick Start

### Prerequisites

- Node.js >= 18
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)
- Redis 7 (or use Docker)

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd productfolio

# Start database and Redis
docker-compose up -d

# Install dependencies
npm install

# Setup database
npm run db:generate
npm run db:push
npm run db:seed

# Start development servers
npm run dev
```

The application will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000

### Auth0 Setup

Authentication is handled by Auth0. You need an Auth0 tenant configured:

1. **Create an Auth0 Application** (type: Single Page Application)
   - Allowed Callback URLs: `http://localhost:5173`
   - Allowed Logout URLs: `http://localhost:5173`
   - Allowed Web Origins: `http://localhost:5173`

2. **Create an Auth0 API** with identifier matching `AUTH0_AUDIENCE`

3. **Set environment variables**:

   Backend (`.env`):
   ```env
   AUTH0_DOMAIN=your-tenant.auth0.com
   AUTH0_AUDIENCE=https://api.productfolio.local
   ```

   Frontend (`packages/frontend/.env`):
   ```env
   VITE_AUTH0_DOMAIN=your-tenant.auth0.com
   VITE_AUTH0_CLIENT_ID=your-client-id
   VITE_AUTH0_AUDIENCE=https://api.productfolio.local
   ```

### User Provisioning

Users are automatically provisioned on first login via Auth0:
- New Auth0 users get the **VIEWER** role by default
- Existing users are matched by email and linked to their Auth0 identity
- An admin can promote users via the database or Prisma Studio (`npm run db:studio`)

### Seeded Users

After seeding, these users exist in the local database (link them by signing into Auth0 with the same email):

| Email | Role |
|-------|------|
| admin@example.com | Admin |
| product.owner@example.com | Product Owner |
| business.owner@example.com | Business Owner |

## Project Structure

```
productfolio/
├── packages/
│   ├── backend/
│   │   ├── prisma/
│   │   │   ├── schema.prisma    # Database schema
│   │   │   └── seed.ts          # Database seeding
│   │   └── src/
│   │       ├── index.ts         # Fastify server entry
│   │       ├── worker.ts        # Background worker entry
│   │       ├── routes/          # API route handlers
│   │       ├── services/        # Business logic
│   │       ├── schemas/         # Zod validation schemas
│   │       ├── planning/        # Planning engine (Strangler Pattern)
│   │       ├── plugins/         # Fastify plugins (auth, feature flags)
│   │       ├── lib/             # Utilities, Prisma client, errors
│   │       ├── jobs/            # BullMQ job processors
│   │       └── tests/           # Vitest tests
│   └── frontend/
│       └── src/
│           ├── api/             # API client
│           ├── components/      # React components
│           ├── hooks/           # Custom hooks (TanStack Query)
│           ├── pages/           # Page components
│           ├── stores/          # Zustand stores
│           └── types/           # TypeScript types
├── .env                         # Environment variables
├── docker-compose.yml           # Docker services
└── package.json                 # Workspace root
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all packages in development mode |
| `npm run dev:backend` | Start backend only (port 3000) |
| `npm run dev:frontend` | Start frontend only (port 5173) |
| `npm run dev:worker` | Start background worker |
| `npm run build` | Build all packages |
| `npm run test` | Run all tests |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed database with initial data |
| `npm run db:studio` | Open Prisma Studio GUI |

## API Endpoints

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/auth/me` | Yes | Get current user profile |

All other auth operations (login, signup, logout, password reset) are handled by Auth0.

### Initiatives

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/initiatives` | List initiatives (with filters) |
| GET | `/api/initiatives/:id` | Get single initiative |
| POST | `/api/initiatives` | Create initiative |
| PUT | `/api/initiatives/:id` | Update initiative |
| DELETE | `/api/initiatives/:id` | Delete initiative |
| POST | `/api/initiatives/:id/status` | Transition status |
| PATCH | `/api/initiatives/bulk` | Bulk update |
| POST | `/api/initiatives/import` | Import from CSV |
| GET | `/api/initiatives/export` | Export to CSV |

### Resources

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/employees` | List employees |
| GET | `/api/employees/:id` | Get employee details |
| POST | `/api/employees` | Create employee |
| PUT | `/api/employees/:id` | Update employee |
| DELETE | `/api/employees/:id` | Delete employee |
| GET | `/api/employees/:id/skills` | Get employee skills |
| POST | `/api/employees/:id/skills` | Add skill |
| GET | `/api/employees/:id/capacity` | Get capacity calendar |
| PUT | `/api/employees/:id/capacity` | Update capacity |

### Scenarios

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scenarios` | List scenarios |
| GET | `/api/scenarios/:id` | Get scenario details |
| POST | `/api/scenarios` | Create scenario |
| PUT | `/api/scenarios/:id` | Update scenario |
| DELETE | `/api/scenarios/:id` | Delete scenario |
| PUT | `/api/scenarios/:id/priorities` | Update priority rankings |
| GET | `/api/scenarios/:id/allocations` | Get allocations |
| POST | `/api/scenarios/:id/allocations` | Create allocation |
| GET | `/api/scenarios/:id/capacity-demand` | Capacity vs demand analysis |
| GET | `/api/scenarios/:id/calculator` | Demand vs capacity with caching |
| GET | `/api/scenarios/compare` | Compare multiple scenarios |
| PUT | `/api/scenarios/:id/planning-mode` | Switch planning mode (LEGACY/TOKEN) |

### Token Planning (Feature Flag: `token_planning_v1`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/skill-pools` | List skill pools |
| GET | `/api/skill-pools/:id` | Get skill pool details |
| POST | `/api/skill-pools` | Create skill pool (Admin) |
| PUT | `/api/skill-pools/:id` | Update skill pool (Admin) |
| DELETE | `/api/skill-pools/:id` | Soft-delete skill pool (Admin) |
| GET | `/api/scenarios/:id/token-supply` | List token supply for scenario |
| PUT | `/api/scenarios/:id/token-supply` | Upsert token supply |
| DELETE | `/api/scenarios/:id/token-supply/:poolId` | Remove token supply |
| GET | `/api/scenarios/:id/token-demand` | List token demand for scenario |
| PUT | `/api/scenarios/:id/token-demand` | Upsert token demand |
| POST | `/api/scenarios/:id/token-demand/bulk` | Bulk upsert token demand |
| DELETE | `/api/scenarios/:id/token-demand/:id` | Remove token demand |
| GET | `/api/scenarios/:id/token-ledger` | Token ledger summary (TOKEN mode only) |
| POST | `/api/scenarios/:id/derive-token-demand` | Derive demand from scope items |

### Forecasting (Feature Flag: `flow_forecast_v1`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/forecast/scope-based` | Run Monte Carlo scope-based forecast |
| POST | `/api/forecast/empirical` | Run empirical forecast from cycle times |
| GET | `/api/forecast/runs` | List forecast runs |
| GET | `/api/forecast/runs/:id` | Get forecast run details |
| POST | `/api/forecast/data-quality` | Assess data quality for forecasting |

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5433/productfolio

# Backend
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Authentication (Auth0)
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=https://api.productfolio.local
FRONTEND_URL=http://localhost:5173

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

## Architecture

### Core Entities

- **User** - System users with roles (Admin, Product Owner, Business Owner, Resource Manager, Viewer)
- **Initiative** - Business projects with status workflow (DRAFT → PENDING_APPROVAL → APPROVED → IN_PROGRESS → COMPLETED)
- **ScopeItem** - Work items with skill demands and P50/P90 estimates
- **Employee** - Team members with skills, capacity calendars, and manager hierarchy
- **Scenario** - What-if planning with allocations and priority rankings, supports LEGACY (time-based) and TOKEN (token flow) planning modes
- **Allocation** - Employee assignments to initiatives with date ranges and percentages
- **SkillPool** - Named capacity pools (backend, frontend, data, qa, domain) for token planning
- **TokenSupply/TokenDemand** - Token-based supply and demand per skill pool per scenario
- **ForecastRun** - Monte Carlo simulation results with data quality assessments

### Authentication Flow (Auth0)

1. User navigates to the app → redirected to Auth0 Universal Login
2. User signs up or logs in via Auth0 (email/password, social, etc.)
3. Auth0 returns an RS256 access token to the SPA via PKCE flow
4. Frontend attaches the token as `Authorization: Bearer` on all API requests
5. Backend verifies the token against Auth0's JWKS endpoint using `jose`
6. On first login, the user is auto-provisioned in the local database (matched by email or created with VIEWER role)
7. `GET /auth/me` returns the local user profile (role, name) to the frontend

### Background Jobs

| Queue | Purpose | Trigger |
|-------|---------|---------|
| `scenario-recompute` | Recalculate demand/capacity | Allocation changes |
| `csv-import` | Async initiative imports | Large imports (>100 rows) |
| `view-refresh` | Refresh materialized views | Scheduled or on-demand |

Run the worker alongside the API server:
```bash
npm run dev:worker
```

## Planning Modes (Strangler Pattern)

Scenarios support two planning modes, selectable per-scenario:

| Mode | Description |
|------|-------------|
| **LEGACY** (default) | Time-based planning using employee allocations, capacity calendars, and hour-based demand |
| **TOKEN** | Token flow planning using skill pools, token supply/demand, and a ledger-based balance sheet |

The `PlanningService` reads `scenario.planningMode` and dispatches to the appropriate engine:
- `LegacyTimeModel` delegates to existing `allocationService` and `scenarioCalculatorService`
- `TokenFlowModel` provides token ledger summaries with binding constraint analysis

Both modes coexist — switching modes preserves existing data. Enable token planning via the `token_planning_v1` feature flag.

## Feature Flags

| Flag | Description | Dependencies |
|------|-------------|-------------|
| `org_capacity_view` | Org capacity rollup page | None |
| `job_profiles` | Job profiles admin page | None |
| `flow_forecast_v1` | Flow forecasting (Mode A) | None |
| `forecast_mode_b` | Empirical forecasting (Mode B) | `flow_forecast_v1` |
| `token_planning_v1` | Token flow planning mode | None |

## Testing

```bash
npm run test              # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
```

## License

MIT
