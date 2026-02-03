# Org Structure

Organizational hierarchy, membership tracking, and approval policy management for ProductFolio.

## Overview

The org structure system models a company's organizational tree alongside a traditional manager reporting chain. Employees are placed into org nodes (divisions, departments, teams) via time-tracked memberships, and approval policies are attached to nodes to govern resource allocation, initiative, and scenario workflows.

Two parallel hierarchies coexist:

- **Manager hierarchy** — `Employee.managerId` self-referential FK. Represents direct reporting lines.
- **Org tree** — `OrgNode` parent/child tree with materialized paths. Represents structural placement (division > department > team).

An employee's manager and their org node leader may be different people.

---

## Data Model

### OrgNode

Tree nodes representing organizational units.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | String | Display name |
| `code` | String | Short code (e.g., "ENG-PLATFORM") |
| `type` | Enum | `ROOT`, `DIVISION`, `DEPARTMENT`, `TEAM`, `VIRTUAL` |
| `parentId` | UUID? | FK to parent OrgNode |
| `path` | String | Materialized path (e.g., `/root-id/div-id/team-id/`) |
| `depth` | Int | Tree depth level (root = 0) |
| `managerId` | UUID? | FK to Employee (node owner/leader) |
| `sortOrder` | Int | Display ordering among siblings |
| `isActive` | Boolean | Soft-delete flag |
| `metadata` | JSON | Flexible key-value metadata |

**Relations:** `parent`, `children`, `manager` (Employee), `memberships` (OrgMembership[]), `approvalPolicies` (ApprovalPolicy[])

**Materialized path pattern:** Paths like `/aaa/bbb/ccc/` enable efficient ancestor and descendant queries without recursive CTEs. Paths are recomputed when a node is moved.

### OrgMembership

Junction between Employee and OrgNode with temporal tracking.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `employeeId` | UUID | FK to Employee |
| `orgNodeId` | UUID | FK to OrgNode |
| `effectiveStart` | DateTime | Start of membership |
| `effectiveEnd` | DateTime? | End of membership (null = current) |

When an employee is reassigned to a new node, the previous membership's `effectiveEnd` is set automatically. This preserves a full membership history per employee.

### Employee (Org-Relevant Fields)

| Field | Type | Description |
|-------|------|-------------|
| `managerId` | UUID? | FK to Employee (direct manager) |
| `role` | String | Job role / title |
| `employmentType` | Enum | `FULL_TIME`, `PART_TIME`, `CONTRACTOR`, `INTERN` |
| `activeStart` | DateTime | Employment start |
| `activeEnd` | DateTime? | Employment end (null = active) |

**Relations:** `manager`, `directReports`, `orgMemberships`, `skills`, `domains`, `capacityCalendar`, `allocations`

### ApprovalPolicy

Approval rules attached to org nodes.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `orgNodeId` | UUID | FK to OrgNode |
| `scope` | Enum | `RESOURCE_ALLOCATION`, `INITIATIVE`, `SCENARIO` |
| `level` | Int | Approval chain level (1 = first approver) |
| `ruleType` | Enum | See rule types below |
| `ruleConfig` | JSON | Rule-specific configuration |
| `crossBuStrategy` | Enum | `COMMON_ANCESTOR`, `ALL_BRANCHES` |
| `isActive` | Boolean | Soft-delete flag |

**Rule types:**

| Type | Behavior |
|------|----------|
| `NODE_MANAGER` | Node's assigned manager approves |
| `SPECIFIC_PERSON` | Named individual approves |
| `ROLE_BASED` | Any user with a specified role approves |
| `ANCESTOR_MANAGER` | Walk up the tree to find an approver |
| `COMMITTEE` | Multiple approvers required |
| `FALLBACK_ADMIN` | System admin fallback |

### Relationship Diagram

```
OrgNode (tree)
  ├── parentId → OrgNode
  ├── children → OrgNode[]
  ├── managerId → Employee
  ├── memberships → OrgMembership[]
  └── approvalPolicies → ApprovalPolicy[]

OrgMembership
  ├── employeeId → Employee
  └── orgNodeId → OrgNode

Employee
  ├── managerId → Employee (reporting line)
  ├── directReports → Employee[]
  └── orgMemberships → OrgMembership[]
```

---

## API Endpoints

### Org Tree

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/org/tree` | Full nested tree |
| `GET` | `/api/org/nodes` | Flat node list (filterable by parentId, type, isActive, search) |
| `GET` | `/api/org/nodes/:id` | Single node with parent, children, counts |
| `POST` | `/api/org/nodes` | Create node |
| `PUT` | `/api/org/nodes/:id` | Update node |
| `POST` | `/api/org/nodes/:id/move` | Move node to new parent (recomputes paths) |
| `DELETE` | `/api/org/nodes/:id` | Soft-delete node |
| `GET` | `/api/org/nodes/:id/ancestors` | Ancestry chain (parsed from materialized path) |
| `GET` | `/api/org/nodes/:id/descendants` | Full subtree (path prefix query) |
| `GET` | `/api/org/coverage` | Coverage report: unassigned employees, nodes without policies |

### Memberships

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/org/memberships` | List memberships (filter by orgNodeId, employeeId, activeOnly) |
| `POST` | `/api/org/memberships` | Assign employee to node (auto-ends previous membership) |
| `POST` | `/api/org/memberships/bulk` | Bulk assign employees to a node |
| `DELETE` | `/api/org/memberships/:id` | End membership (sets effectiveEnd) |
| `GET` | `/api/org/memberships/employee/:id` | Full membership history for employee |

### Approval Policies

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/org/nodes/:id/policies` | List policies for a node |
| `POST` | `/api/org/nodes/:id/policies` | Create policy |
| `PUT` | `/api/approval-policies/:id` | Update policy |
| `DELETE` | `/api/approval-policies/:id` | Deactivate policy |
| `POST` | `/api/approval-policies/preview` | Preview approval chain for a given context |

### Approval Requests

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/approval-requests` | List all requests |
| `GET` | `/api/approval-requests/inbox` | Approver's pending queue |
| `GET` | `/api/approval-requests/my` | Requester's own requests |
| `GET` | `/api/approval-requests/:id` | Single request |
| `POST` | `/api/approval-requests` | Create approval request |
| `POST` | `/api/approval-requests/:id/decide` | Submit approval/rejection |
| `POST` | `/api/approval-requests/:id/cancel` | Cancel request |

### Delegations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/delegations` | List active delegations |
| `POST` | `/api/delegations` | Create delegation |
| `DELETE` | `/api/delegations/:id` | Revoke delegation |

### Audit

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/audit` | Query audit events (filter by actor, entity, action, date range) |

### Employees

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/employees` | List employees (paginated, filterable by role, employmentType, managerId, search) |
| `GET` | `/api/employees/:id` | Single employee with manager, directReports, skills, domains |
| `POST` | `/api/employees` | Create employee |
| `PUT` | `/api/employees/:id` | Update employee |
| `DELETE` | `/api/employees/:id` | Delete employee |
| `GET` | `/api/employees/:id/skills` | Employee skills |
| `GET` | `/api/employees/:id/domains` | Employee domains |
| `GET` | `/api/employees/:id/capacity` | Capacity calendar |
| `GET` | `/api/employees/:id/availability` | Calculated availability for date range |
| `GET` | `/api/employees/:id/allocations` | Cross-scenario allocations |

---

## Backend Services

### org-tree.service.ts

- **`createNode(input, actorId)`** — Creates node, computes materialized path from parent, logs audit event.
- **`updateNode(id, input, actorId)`** — Updates name/code/manager/sortOrder/metadata.
- **`moveNode(nodeId, newParentId, actorId)`** — Validates no cycles, recomputes path for node and all descendants.
- **`deleteNode(nodeId, actorId)`** — Validates no children or active memberships exist before soft-delete.
- **`getFullTree()`** — Fetches all active nodes, builds nested structure in memory.
- **`getAncestors(nodeId)`** — Parses materialized path to return ordered ancestry chain.
- **`getDescendants(nodeId)`** — Path prefix query (`path LIKE '/nodeId/%'`) for subtree.
- **`getCoverageReport()`** — Returns unassigned employees and nodes without approval policies.

### org-membership.service.ts

- **`assignEmployeeToNode(input, actorId)`** — Auto-ends previous active membership, creates new one.
- **`bulkAssignEmployees(input, actorId)`** — Batch assignment with per-employee error tracking.
- **`endMembership(membershipId, actorId)`** — Sets `effectiveEnd` to now.
- **`getActiveMembership(employeeId)`** — Returns current membership (effectiveEnd = null).
- **`getMembershipHistory(employeeId)`** — Full ordered history.

### approval-policy.service.ts

- **`createPolicy(input, actorId)`** — Validates rule config matches rule type.
- **`previewChain(data)`** — Resolves approval chain for a given scope/entity context without creating a request.

### approval-workflow.service.ts

- **`createApprovalRequest(data, actorId)`** — Resolves approval chain from policies, creates request with pending steps.
- **`submitDecision(data, actorId)`** — Records approve/reject, advances chain or finalizes.
- **`getApproverInbox(userId)`** — Pending items for a user (includes delegations).
- **Delegation support** — Create/revoke delegations so another user can act as approver.

### audit.service.ts

All org mutations (node CRUD, membership changes, policy changes) are logged with actor, entity type, entity ID, action, and a JSON payload of the change.

---

## Frontend

### Pages

**OrgTreeAdmin** (`/admin/org-tree`)

The primary admin interface for managing the org structure. Contains:

- **Tree view** — Recursive rendering of OrgNode hierarchy with expand/collapse. Nodes are color-coded by type and show member counts.
- **Node detail panel** — Selected node's info, manager, current members, and approval policies.
- **Create node modal** — Name, code, type, parent selection.
- **Coverage stats** — Coverage percentage, total employees, unassigned count, active node count.
- **Policy management** — Add/remove approval policies per node with scope, level, and rule type configuration.

### Hooks

**useOrgTree.ts** — All org tree queries and mutations:

| Hook | Purpose |
|------|---------|
| `useOrgTree()` | Fetch full nested tree |
| `useOrgNodes(filters)` | Flat list with filters |
| `useOrgNode(id)` | Single node |
| `useOrgNodeAncestors(id)` | Ancestry chain |
| `useOrgNodeDescendants(id)` | Subtree |
| `useCoverageReport()` | Coverage metrics |
| `useMemberships(filters)` | Membership list |
| `useEmployeeMembershipHistory(id)` | Employee history |
| `useCreateNode()` | Create mutation |
| `useUpdateNode()` | Update mutation |
| `useMoveNode()` | Move mutation |
| `useDeleteNode()` | Delete mutation |
| `useAssignMembership()` | Assign mutation |
| `useBulkAssignMembership()` | Bulk assign mutation |
| `useEndMembership()` | End membership mutation |

**useEmployees.ts** — Employee CRUD, skills, domains, capacity, availability, and allocation queries.

### Types

```typescript
type OrgNodeType = 'ROOT' | 'DIVISION' | 'DEPARTMENT' | 'TEAM' | 'VIRTUAL'
type ApprovalScope = 'RESOURCE_ALLOCATION' | 'INITIATIVE' | 'SCENARIO'
type ApprovalRuleType = 'NODE_MANAGER' | 'SPECIFIC_PERSON' | 'ROLE_BASED'
                      | 'ANCESTOR_MANAGER' | 'COMMITTEE' | 'FALLBACK_ADMIN'
type ApprovalRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'
type CrossBuStrategy = 'COMMON_ANCESTOR' | 'ALL_BRANCHES'

interface OrgNode {
  id: string
  name: string
  code: string
  type: OrgNodeType
  parentId: string | null
  path: string
  depth: number
  managerId: string | null
  sortOrder: number
  isActive: boolean
  metadata: Record<string, unknown>
  manager?: { id: string; name: string }
  children?: OrgNode[]
  parent?: { id: string; name: string; code: string }
  _count?: { memberships: number; approvalPolicies: number }
}

interface OrgMembership {
  id: string
  employeeId: string
  orgNodeId: string
  effectiveStart: string
  effectiveEnd: string | null
  employee?: { id: string; name: string; role: string; employmentType: string }
  orgNode?: { id: string; name: string; code: string; type: OrgNodeType }
}

interface CoverageReport {
  totalEmployees: number
  assignedEmployees: number
  unassignedCount: number
  coveragePercentage: number
  unassignedEmployees: Employee[]
  totalActiveNodes: number
  nodesWithoutPolicies: OrgNode[]
}
```

---

## Key Design Decisions

### Materialized Path for Tree Traversal

Paths like `/aaa-uuid/bbb-uuid/ccc-uuid/` stored on each node enable:

- **Ancestor queries** — Parse the path string to get ordered parent chain.
- **Descendant queries** — `WHERE path LIKE '/node-id/%'` returns the full subtree.
- **Depth calculation** — Count path segments.

Trade-off: Moving a node requires updating paths for all descendants. This is acceptable because org restructures are infrequent compared to read operations.

### Temporal Memberships

Memberships track `effectiveStart` and `effectiveEnd` rather than using simple FK assignment. This supports:

- Historical org structure queries ("who was on Platform Team in Q1?")
- Audit trails for reorgs
- Future-dated transfers

### Dual Hierarchy

The manager reporting line (`Employee.managerId`) and org placement (`OrgMembership`) are independent. This handles real-world cases where:

- A dotted-line report sits in a different department than their manager
- Virtual/cross-functional teams pull from multiple departments
- Matrix organizations need both functional and project reporting

### Soft Deletes

OrgNode and ApprovalPolicy use `isActive` flags rather than hard deletes. Historical memberships and audit records reference these entities and must remain resolvable.

---

## Connections to Other Systems

| System | Integration Point |
|--------|-------------------|
| **Scenarios** | Approval policies with `scope: SCENARIO` govern scenario status transitions. |
| **Initiatives** | Approval policies with `scope: INITIATIVE` govern initiative approval workflows. Initiative `businessOwnerId` and `productOwnerId` link to Users. |
| **Resource Allocation** | Approval policies with `scope: RESOURCE_ALLOCATION` can require approval for allocation changes. Employee org placement provides team-level capacity views. |
| **Capacity Planning** | Employee `hoursPerWeek`, `capacityCalendar`, and `activeStart`/`activeEnd` feed into scenario capacity calculations. |
| **Portfolio Areas** | `PortfolioArea` provides a business-domain grouping orthogonal to org structure. Initiatives and intake requests reference portfolio areas. |
