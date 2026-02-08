# Org-to-Entitlement Map

This document defines the canonical mapping between user roles, seat types, and licensing status.

**Core Rule**: Users who MAKE decisions are licensed. Users who ARE modeled are not.

## Role → Seat Type Mapping

| Role | Seat Type | Licensed | Reason |
|---|---|---|---|
| ADMIN | `seat:decision` | Yes | Full write + admin access |
| PRODUCT_OWNER | `seat:decision` | Yes | initiative:write, scenario:write, planning:write |
| BUSINESS_OWNER | `seat:decision` | Yes | initiative:write, scenario:write |
| RESOURCE_MANAGER | `seat:decision` | Yes | employee:write |
| VIEWER | `seat:observer` | No | Read-only permissions only |
| Employee (no User) | `seat:resource` | No | Modeled resource, not a system actor |

## Seat Definitions

- **Decision Seat** (`seat:decision`): Any user who creates, modifies, approves, or deletes plans, initiatives, scenarios, forecasts, or resource allocations. These users hold at least one write or admin permission.
- **Observer Seat** (`seat:observer`): Read-only system users who view dashboards, reports, and plans but cannot modify anything.
- **Resource Seat** (`seat:resource`): Employees modeled in the system for capacity planning. They are not system users and never log in.

## Decision Permissions

The following permissions imply `seat:decision` (any one is sufficient):

- `initiative:write`
- `scenario:write`
- `employee:write`
- `planning:write`
- `forecast:write`
- `org:write`
- `approval:write`
- `drift:write`
- `job-profile:write`
- `feature-flag:admin`
- `jira:admin`
- `authority:admin`

## Tier Feature Gates

| Feature Area | Starter | Growth | Enterprise |
|---|---|---|---|
| Initiative management | Yes | Yes | Yes |
| Scenario planning | Yes | Yes | Yes |
| Employee capacity | Yes | Yes | Yes |
| Basic reporting | Yes | Yes | Yes |
| Token flow planning | - | Yes | Yes |
| Flow forecasting | - | Yes | Yes |
| Approval workflows | - | Yes | Yes |
| Drift detection | - | Yes | Yes |
| Job profiles & cost bands | - | - | Yes |
| Org structure management | - | - | Yes |
| Jira integration | - | - | Yes |
| Authority registry | - | - | Yes |

## Billing Model

- Only `seat:decision` users count toward the seat limit.
- `seat:observer` and `seat:resource` are unlimited and free.
- Seat limit is configured per tenant via `TenantConfig.seatLimit`.
