# RevOps Telemetry Model

This document describes the entitlement event telemetry system used for revenue operations tracking and expansion signal detection.

## Event Schema

Events are stored in the `entitlement_events` table:

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `event_name` | String | Event identifier (see catalog below) |
| `user_id` | UUID? | The user who triggered the event |
| `seat_type` | String | The user's seat type at time of event (`decision`, `observer`) |
| `metadata` | JSONB? | Event-specific payload |
| `created_at` | DateTime | Timestamp |

## Event Catalog

### `scenario_created`

- **When**: A new scenario is created via `POST /api/scenarios`
- **Actor**: Decision-seat user
- **Metadata**: `{ scenarioId, scenarioName }`
- **Business purpose**: Track planning activity volume per licensed seat

### `scenario_approved`

- **When**: A scenario transitions to `APPROVED` status via `PUT /api/scenarios/:id/status`
- **Actor**: Decision-seat user
- **Metadata**: `{ scenarioId, newStatus: "APPROVED" }`
- **Business purpose**: Track approval workflow adoption

### `scenario_locked`

- **When**: A scenario transitions to `LOCKED` status via `PUT /api/scenarios/:id/status`
- **Actor**: Decision-seat user
- **Metadata**: `{ scenarioId, newStatus: "LOCKED" }`
- **Business purpose**: Track plan finalization rates

### `forecast_run`

- **When**: A forecast is executed via `POST /api/forecast/scope-based` or `POST /api/forecast/empirical`
- **Actor**: Decision-seat user
- **Metadata**: `{ mode: "SCOPE_BASED" | "EMPIRICAL", scenarioId? }`
- **Business purpose**: Track forecasting feature adoption

### `capacity_modeled`

- **When**: Planning mode is toggled, or token supply/demand is modified
- **Actor**: Decision-seat user
- **Metadata**: `{ scenarioId, action: "planning_mode_toggle" | "token_supply_upsert" | "token_demand_upsert", mode? }`
- **Business purpose**: Track token planning adoption

### `decision_seat_blocked`

- **When**: A user without a decision seat attempts to access a write endpoint guarded by `requireSeat('decision')`
- **Actor**: Observer-seat user (the one who was blocked)
- **Metadata**: `{ requiredSeat: "decision", route, method }`
- **Business purpose**: Critical expansion signal — indicates users who need decision seats but don't have them

## Expansion Signals

The RevOps dashboard (`GET /api/admin/revops`) surfaces these signals:

1. **Blocked Attempts** (last 30 days): Count of `decision_seat_blocked` events. Any non-zero value is an expansion signal.
2. **Near Limit**: `true` when `licensed_users >= seat_limit - 1`. Indicates the tenant is approaching capacity.
3. **Utilization %**: `(licensed_users / seat_limit) * 100`. High utilization suggests upgrade opportunity.

## Admin Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/admin/revops` | GET | Expansion signals summary |
| `/api/admin/revops/events` | GET | Paginated event log (filterable by eventName, userId) |
| `/api/admin/entitlements` | GET | Licensed and observer user lists |
| `/api/admin/entitlements/summary` | GET | Seat counts, tier, limit, utilization |
| `/api/admin/entitlements/config` | PUT | Update tenant tier and seat limit |
| `/api/admin/entitlements/export` | GET | CSV download of licensed users |
