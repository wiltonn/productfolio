# Authorization Architecture (AUTHZ)

## Overview

ProductFolio uses Auth0 for authentication and a permission-based authorization model. The source of truth for permissions is the Auth0 JWT access token, with a fallback to role-derived permissions for backward compatibility.

## Claims Contract

### Canonical Claim

The JWT access token contains a namespaced claim:

```
https://productfolio.local/permissions
```

This is a `string[]` containing permission codes (e.g. `["initiative:read", "scenario:write"]`).

### Example Token Payload

```json
{
  "sub": "auth0|abc123",
  "aud": "https://api.productfolio.local",
  "iss": "https://your-tenant.auth0.com/",
  "https://productfolio.local/permissions": [
    "initiative:read",
    "initiative:write",
    "scenario:read",
    "scenario:write"
  ],
  "https://productfolio.local/email": "user@example.com",
  "https://productfolio.local/name": "User Name"
}
```

## Permission Strings

| Permission | Description |
|---|---|
| `initiative:read` | View initiatives and their details |
| `initiative:write` | Create, update, and delete initiatives |
| `scenario:read` | View scenarios and allocations |
| `scenario:write` | Create, update, and delete scenarios and allocations |
| `employee:read` | View employees and capacity |
| `employee:write` | Create, update, and delete employees |
| `planning:read` | View planning data (token ledger, supply, demand) |
| `planning:write` | Modify planning mode, token supply, and demand |
| `forecast:read` | View forecast runs and data quality |
| `forecast:write` | Run forecasts (scope-based and empirical) |
| `org:read` | View org tree and memberships |
| `org:write` | Manage org tree nodes and memberships |
| `approval:read` | View approval policies and requests |
| `approval:write` | Manage approval policies and delegations |
| `drift:read` | View drift alerts and thresholds |
| `drift:write` | Acknowledge/resolve drift alerts, update thresholds and freeze policies |
| `job-profile:read` | View job profiles and cost bands |
| `job-profile:write` | Create, update, and delete job profiles and skill pools |
| `feature-flag:admin` | Manage feature flags |
| `jira:admin` | Manage Jira integration settings |
| `authority:admin` | Manage authority registry and view audit logs |

## Role-to-Permission Mapping (Fallback)

When the JWT does not contain the `permissions` claim (e.g. Auth0 RBAC not yet configured), permissions are derived from `User.role` in the database:

| Role | Permissions |
|---|---|
| **ADMIN** | All permissions |
| **PRODUCT_OWNER** | initiative:r/w, scenario:r/w, planning:r/w, forecast:r/w, drift:r/w, approval:r/w, employee:r, org:r, job-profile:r |
| **BUSINESS_OWNER** | initiative:r/w, scenario:r/w, planning:r/w, forecast:r, employee:r, org:r, job-profile:r |
| **RESOURCE_MANAGER** | employee:r/w, org:r, scenario:r, initiative:r, job-profile:r |
| **VIEWER** | initiative:r, scenario:r, employee:r, org:r, forecast:r, job-profile:r |

The `User.role` field remains in the database as a display/sync field, but is no longer the primary enforcement source.

## Backend Enforcement

### Route Guards

Routes use `fastify.requirePermission(perm)` instead of `fastify.authorize(roles[])`:

```typescript
// Before (role-based)
fastify.put('/api/scenarios/:id', { preHandler: [fastify.authorize(['ADMIN', 'PRODUCT_OWNER'])] }, handler);

// After (permission-based)
fastify.put('/api/scenarios/:id', { preHandler: [fastify.requirePermission('scenario:write')] }, handler);
```

Available decorators:
- `fastify.requirePermission(permission: string)` — requires exactly one permission
- `fastify.requireAnyPermission(permissions: string[])` — requires at least one of the given permissions
- `fastify.authorize(roles: UserRole[])` — legacy, kept for backward compatibility

### Auth Plugin Flow

1. Verify JWT via Auth0 JWKS
2. Provision/lookup local user
3. Extract `permissions` from JWT claim `https://productfolio.local/permissions`
4. If claim is absent or empty → derive from `User.role` using fallback map
5. Set `request.user.permissions = string[]`

## Frontend Enforcement

### useAuthz Hook

```typescript
import { useAuthz } from '../hooks/useAuthz';

function MyComponent() {
  const { hasPermission, hasAny, isAdmin } = useAuthz();

  if (!hasPermission('scenario:write')) {
    return <p>Read-only access</p>;
  }
  // ...
}
```

### ProtectedRoute

```tsx
<ProtectedRoute requiredPermissions={['authority:admin']}>
  <AuthoritiesAdmin />
</ProtectedRoute>
```

## Authority Registry

The `authorities` table stores all known permission codes with descriptions and categories. This enables:
- Admin UI listing of all permissions
- Drift detection (compare DB registry vs code-defined permissions)
- Deprecation tracking
- Audit logging of registry changes

### API Endpoints

| Endpoint | Method | Guard | Description |
|---|---|---|---|
| `/api/authorities` | GET | authenticated | List all authorities |
| `/api/authorities/role-mapping` | GET | authenticated | Get role-to-permissions mapping |
| `/api/authorities/drift` | GET | `authority:admin` | Detect drift between code and registry |
| `/api/authorities/user/:id/effective` | GET | `authority:admin` | Get effective permissions for a user |
| `/api/authorities/:code` | PUT | `authority:admin` | Update authority description/deprecated |
| `/api/authorities/audit-log` | GET | `authority:admin` | View authority audit log |

## How to Add a New Authority

1. **Define the permission string** (format: `resource:action`, e.g. `widget:write`)
2. **Add to `ROLE_PERMISSIONS`** in `packages/backend/src/lib/permissions.ts`
3. **Add to DB registry** via seed or migration (insert into `authorities` table)
4. **Add to Auth0 Dashboard**: Applications > APIs > Permissions
5. **Assign to Auth0 roles**: User Management > Roles > Permissions
6. **Use in route guard**: `fastify.requirePermission('widget:write')`
7. **Use in frontend**: `hasPermission('widget:write')`

## Auth0 Configuration Checklist

1. **Enable RBAC**: Auth0 Dashboard > Applications > APIs > your API > Settings > Enable RBAC + "Add Permissions in the Access Token"
2. **Define permissions**: Auth0 Dashboard > Applications > APIs > your API > Permissions — add all permission strings from the table above
3. **Create roles**: Auth0 Dashboard > User Management > Roles — create roles (Admin, Product Owner, etc.) and assign permissions
4. **Post-Login Action**: Create a Post-Login Action that copies the `permissions` array into the namespaced claim:

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://productfolio.local';
  if (event.authorization) {
    api.accessToken.setCustomClaim(`${namespace}/permissions`, event.authorization.roles_permissions || []);
    api.accessToken.setCustomClaim(`${namespace}/email`, event.user.email);
    api.accessToken.setCustomClaim(`${namespace}/name`, event.user.name);
  }
};
```

5. **Assign users to roles**: Auth0 Dashboard > User Management > Users > select user > Roles tab

## Fallback Behavior

If Auth0 RBAC is not configured:
- The JWT will not contain the `permissions` claim
- The backend automatically falls back to deriving permissions from `User.role`
- This makes the migration safe and incremental
- The `/api/auth/me` endpoint always returns `permissions: string[]` regardless of source
