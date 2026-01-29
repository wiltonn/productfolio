# Business Unit Structure & Multi-Level Approval System — Implementation Plan

---

## Recommended Defaults

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tree representation | Adjacency list + materialized path column | Adjacency list is natural for Prisma; materialized path avoids recursive CTEs for ancestry lookups |
| Employee-to-node cardinality | One primary node per employee (effective-dated) | Matches real-world org charts; avoids ambiguous approval chains |
| Initiative/Scenario attachment | Derived from impacted employees' nodes, not directly assigned | An initiative can span multiple BUs; approval chain is computed from the union of affected nodes |
| Approval level numbering | 1 = closest to leaf, ascending toward root | Intuitive: L1 = team lead, L2 = director, L3 = VP |
| Approval chain computation | Computed at request-creation time, then snapshot-frozen on the request | Avoids mid-flight corruption; changes to tree apply to future requests only |
| Unassigned employees | Explicit "Unassigned" sentinel node (child of root) | Guarantees 100% coverage; easily queryable |
| Audit strategy | Append-only `audit_event` table with JSON payload | Simpler than CDC; aligns with existing `Approval` version tracking pattern |

---

## A) Assumptions & Definitions

### Glossary

- **Business Unit Tree** — A rooted tree of `OrgNode` records representing the organizational hierarchy. Every node has exactly one parent except the root (which has `parentId = null`). Example: Company → Division → Department → Team.
- **OrgNode (Node)** — A single vertex in the tree. Has a `type` discriminator (`ROOT`, `DIVISION`, `DEPARTMENT`, `TEAM`, `VIRTUAL`) and metadata (`name`, `code`, `managerId`).
- **Approval Node** — An `OrgNode` that has one or more `ApprovalPolicy` records attached, meaning it participates in approvals for a given scope.
- **Approval Scope** — The domain an approval applies to: `RESOURCE_ALLOCATION`, `INITIATIVE`, `SCENARIO`.
- **Approval Level** — An integer (1..N) indicating the ordering in a multi-step approval chain. Level 1 is evaluated first; all levels must approve for completion.
- **Covered** — An employee is "covered" if they have an active `OrgMembership` record linking them to exactly one `OrgNode`. If not, they reside in the sentinel "Unassigned" node.

### Cardinality Rules

- Each employee has **exactly one active** `OrgMembership` at any point in time (enforced by unique partial index on `employeeId` where `effectiveEnd IS NULL`).
- An initiative or scenario is **not directly assigned** to a node. Instead, the set of affected nodes is derived:
  - **Initiative**: union of nodes of all employees allocated to it (across any scenario) OR, if no allocations exist yet, the node of the `businessOwner` user's linked employee.
  - **Scenario**: union of nodes of all employees with allocations in that scenario.
  - **Resource Allocation**: the node of the allocated employee.
- This derivation handles cross-functional initiatives naturally: if an initiative spans 3 teams, approvals may be required from each team's chain.

### Exception Handling

- **Contractors / Interns**: Assigned to nodes like any employee. Their `employmentType` is orthogonal to the org tree.
- **Cross-functional initiatives**: Require approval from the *highest common ancestor* that has an approval policy, OR from each affected branch — configurable per policy (`COMMON_ANCESTOR` vs `ALL_BRANCHES` strategy).
- **Unassigned employees**: The "Unassigned" node can have its own approval policies (e.g., a system admin approves).

---

## B) Data Model

### New Tables

```
OrgNode
────────────────────────────────────────────
id              UUID PK DEFAULT gen_random_uuid()
name            VARCHAR(255) NOT NULL
code            VARCHAR(50) UNIQUE            -- e.g. "ENG-PLATFORM"
type            ENUM('ROOT','DIVISION','DEPARTMENT','TEAM','VIRTUAL') NOT NULL
parentId        UUID FK → OrgNode(id) NULLABLE  -- null = root
path            TEXT NOT NULL                  -- materialized path: "/root-id/div-id/dept-id/"
depth           INT NOT NULL DEFAULT 0
managerId       UUID FK → Employee(id) NULLABLE -- node-level manager
sortOrder       INT NOT NULL DEFAULT 0
isActive        BOOLEAN NOT NULL DEFAULT true
metadata        JSONB DEFAULT '{}'             -- extensible (cost center, location, etc.)
createdAt       TIMESTAMPTZ NOT NULL DEFAULT now()
updatedAt       TIMESTAMPTZ NOT NULL DEFAULT now()

INDEXES:
  - parentId
  - path (text_pattern_ops for LIKE prefix queries)
  - (parentId, sortOrder) for ordered children
  - managerId
CONSTRAINTS:
  - CHECK (parentId IS NULL) = (type = 'ROOT')  -- only root has null parent
  - UNIQUE partial: only one active ROOT node (WHERE type = 'ROOT' AND isActive = true)
```

```
OrgMembership
────────────────────────────────────────────
id              UUID PK DEFAULT gen_random_uuid()
employeeId      UUID FK → Employee(id) NOT NULL
orgNodeId       UUID FK → OrgNode(id) NOT NULL
effectiveStart  DATE NOT NULL DEFAULT CURRENT_DATE
effectiveEnd    DATE NULLABLE                  -- null = current
createdAt       TIMESTAMPTZ NOT NULL DEFAULT now()
updatedAt       TIMESTAMPTZ NOT NULL DEFAULT now()

INDEXES:
  - employeeId
  - orgNodeId
  - (employeeId, effectiveEnd) for "current membership" lookups
CONSTRAINTS:
  - UNIQUE partial: (employeeId) WHERE effectiveEnd IS NULL  -- one active membership per employee
```

```
ApprovalScope (ENUM)
────────────────────────────────────────────
RESOURCE_ALLOCATION
INITIATIVE
SCENARIO
```

```
ApprovalRuleType (ENUM)
────────────────────────────────────────────
NODE_MANAGER        -- the managerId of the node
SPECIFIC_PERSON     -- a named userId
ROLE_BASED          -- any user with a given UserRole
ANCESTOR_MANAGER    -- walk up tree to find first ancestor with a manager
COMMITTEE           -- multiple approvers, requires quorum
FALLBACK_ADMIN      -- system admin fallback
```

```
ApprovalPolicy
────────────────────────────────────────────
id              UUID PK DEFAULT gen_random_uuid()
orgNodeId       UUID FK → OrgNode(id) NOT NULL
scope           ApprovalScope NOT NULL
level           INT NOT NULL                   -- 1, 2, 3...
ruleType        ApprovalRuleType NOT NULL
ruleConfig      JSONB NOT NULL DEFAULT '{}'    -- e.g. {userId: "...", role: "ADMIN", quorum: 2}
crossBuStrategy VARCHAR(30) DEFAULT 'COMMON_ANCESTOR'  -- 'COMMON_ANCESTOR' | 'ALL_BRANCHES'
isActive        BOOLEAN NOT NULL DEFAULT true
createdAt       TIMESTAMPTZ NOT NULL DEFAULT now()
updatedAt       TIMESTAMPTZ NOT NULL DEFAULT now()

INDEXES:
  - orgNodeId
  - (orgNodeId, scope, level)
CONSTRAINTS:
  - UNIQUE: (orgNodeId, scope, level) WHERE isActive = true  -- one rule per node/scope/level
```

```
ApprovalRequestStatus (ENUM)
────────────────────────────────────────────
PENDING
APPROVED
REJECTED
CANCELLED
EXPIRED
```

```
ApprovalRequest
────────────────────────────────────────────
id              UUID PK DEFAULT gen_random_uuid()
scope           ApprovalScope NOT NULL
subjectType     VARCHAR(50) NOT NULL           -- 'allocation', 'initiative', 'scenario'
subjectId       UUID NOT NULL                  -- FK to the entity
requesterId     UUID FK → User(id) NOT NULL
status          ApprovalRequestStatus NOT NULL DEFAULT 'PENDING'
snapshotChain   JSONB NOT NULL                 -- frozen approval chain at creation time
                                               -- [{level, orgNodeId, ruleType, resolvedApprovers: [{userId, name}]}]
snapshotContext JSONB NOT NULL DEFAULT '{}'    -- snapshot of entity state at request time
currentLevel    INT NOT NULL DEFAULT 1
expiresAt       TIMESTAMPTZ NULLABLE
resolvedAt      TIMESTAMPTZ NULLABLE
createdAt       TIMESTAMPTZ NOT NULL DEFAULT now()
updatedAt       TIMESTAMPTZ NOT NULL DEFAULT now()

INDEXES:
  - (scope, subjectId)
  - requesterId
  - status
  - (status, currentLevel) for approver inbox queries
```

```
ApprovalDecision
────────────────────────────────────────────
id              UUID PK DEFAULT gen_random_uuid()
requestId       UUID FK → ApprovalRequest(id) NOT NULL
level           INT NOT NULL
deciderId       UUID FK → User(id) NOT NULL
decision        VARCHAR(20) NOT NULL           -- 'APPROVED' | 'REJECTED'
comments        TEXT NULLABLE
decidedAt       TIMESTAMPTZ NOT NULL DEFAULT now()

INDEXES:
  - requestId
  - deciderId
  - (requestId, level)
CONSTRAINTS:
  - UNIQUE: (requestId, level, deciderId) -- one decision per approver per level
```

```
ApprovalDelegation
────────────────────────────────────────────
id              UUID PK DEFAULT gen_random_uuid()
delegatorId     UUID FK → User(id) NOT NULL    -- person who is away
delegateId      UUID FK → User(id) NOT NULL    -- acting approver
scope           ApprovalScope NULLABLE          -- null = all scopes
orgNodeId       UUID FK → OrgNode(id) NULLABLE  -- null = all nodes
effectiveStart  DATE NOT NULL
effectiveEnd    DATE NOT NULL
reason          TEXT NULLABLE
createdAt       TIMESTAMPTZ NOT NULL DEFAULT now()

INDEXES:
  - delegatorId
  - delegateId
  - (effectiveStart, effectiveEnd) for active delegation lookups
```

```
AuditEvent
────────────────────────────────────────────
id              UUID PK DEFAULT gen_random_uuid()
actorId         UUID FK → User(id) NULLABLE     -- null for system events
entityType      VARCHAR(50) NOT NULL             -- 'OrgNode', 'OrgMembership', 'ApprovalPolicy', etc.
entityId        UUID NOT NULL
action          VARCHAR(50) NOT NULL             -- 'CREATE', 'UPDATE', 'DELETE', 'MOVE', 'APPROVE', 'REJECT'
payload         JSONB NOT NULL                   -- before/after diff or event-specific data
ipAddress       VARCHAR(45) NULLABLE
createdAt       TIMESTAMPTZ NOT NULL DEFAULT now()

INDEXES:
  - (entityType, entityId)
  - actorId
  - createdAt (for time-range queries)
  - (entityType, action) for filtered searches
```

### Materialized Path Strategy

- `OrgNode.path` stores the full ancestry path as a string: `"/root-uuid/div-uuid/dept-uuid/this-uuid/"`.
- **Ancestry query**: `WHERE path LIKE '/root-uuid/div-uuid/%'` — returns all descendants of `div-uuid`. Uses `text_pattern_ops` index.
- **Depth query**: `depth` column avoids parsing the path.
- **Maintenance**: On node move, update `path` and `depth` for the moved subtree (batch UPDATE using `REPLACE` on path prefix). This is an admin-only, infrequent operation.
- **Cycle prevention**: Application-level check — before moving node X under node Y, verify Y is not a descendant of X (check `Y.path LIKE '%/' || X.id || '/%'`).

### Approval Level Computation

Approval levels are **stored on `ApprovalPolicy`**, not computed dynamically. When an admin defines policies:
- They assign `level = 1` on a TEAM node, `level = 2` on a DEPARTMENT node, `level = 3` on a DIVISION node, etc.
- Levels are per-scope, so a node can be L1 for allocations and L2 for initiatives.
- When the admin changes levels or adds new approval nodes, existing policies update in place; in-flight requests retain their `snapshotChain` and are unaffected.

When resolving the approval chain for a request:
1. Walk from the employee's node up the `path` toward root.
2. At each ancestor (including the employee's own node), check for `ApprovalPolicy` with matching scope.
3. Collect policies ordered by `level` ascending.
4. Resolve each policy's `ruleType` to concrete approver user(s).
5. Freeze the resolved chain into `ApprovalRequest.snapshotChain`.

This is an O(depth) operation with depth typically 3–6. No recursive CTEs needed — the materialized path provides the ancestry in one query.

---

## C) Core Workflows

### C1: Admin Builds/Edits Tree

**Create Node**
1. Admin provides: `name`, `code`, `type`, `parentId`, `managerId` (optional).
2. Validate: parent exists, parent is active, type hierarchy is valid (ROOT > DIVISION > DEPARTMENT > TEAM; VIRTUAL anywhere).
3. Compute `path` = `parent.path + newId + "/"`, `depth` = `parent.depth + 1`.
4. Insert `OrgNode`.
5. Emit `AuditEvent(CREATE, OrgNode, ...)`.

**Move Node**
1. Admin provides: `nodeId`, `newParentId`.
2. Validate: new parent exists, new parent is not a descendant of `nodeId` (cycle check via path), `nodeId` is not ROOT.
3. Compute new path prefix.
4. In a transaction:
   a. Update `nodeId` record: set `parentId`, recompute `path`, `depth`.
   b. Batch-update all descendants: replace old path prefix with new path prefix, adjust `depth`.
5. Emit `AuditEvent(MOVE, OrgNode, {oldParentId, newParentId})`.
6. **Do NOT** invalidate in-flight approval requests — they use snapshot chains.

**Delete Node (Soft)**
1. Admin provides: `nodeId`.
2. Validate: node has no active children (must move/delete children first) and no active memberships (must reassign employees first).
3. Set `isActive = false`.
4. Deactivate any `ApprovalPolicy` records on this node.
5. Emit `AuditEvent(DELETE, OrgNode, ...)`.

### C2: Admin Assigns Employees to Nodes

**Single Assignment**
1. Admin provides: `employeeId`, `orgNodeId`.
2. If employee has a current membership (effectiveEnd IS NULL), set `effectiveEnd = today - 1` on old record.
3. Insert new `OrgMembership(employeeId, orgNodeId, effectiveStart = today)`.
4. Emit `AuditEvent(UPDATE, OrgMembership, {from: oldNodeId, to: orgNodeId})`.

**Bulk Assignment**
1. Admin uploads CSV or selects employees + target node.
2. Wrap in transaction; apply single-assignment logic for each.
3. If >100 employees, queue as BullMQ job (new `org-membership-bulk` queue) returning a job ID.
4. Emit batch `AuditEvent`.

**Coverage Enforcement**
- A nightly scheduled job (or on-demand admin trigger) checks for employees with no active membership.
- Unmatched employees are auto-assigned to the "Unassigned" sentinel node.
- Admin receives a dashboard alert showing unassigned count.

### C3: Admin Defines Approvers

**Create/Update Approval Policy**
1. Admin selects: `orgNodeId`, `scope`, `level`, `ruleType`, `ruleConfig`.
2. Validate:
   - Node exists and is active.
   - Level is a positive integer.
   - No duplicate `(orgNodeId, scope, level)` for active policies.
   - If `ruleType = SPECIFIC_PERSON`, validate `ruleConfig.userId` exists.
   - If `ruleType = COMMITTEE`, validate `ruleConfig.userIds` and `ruleConfig.quorum`.
3. Upsert `ApprovalPolicy`.
4. Emit `AuditEvent(CREATE|UPDATE, ApprovalPolicy, ...)`.
5. **No retroactive effect** on existing approval requests.

**Policy Evaluation Preview**
- Admin can invoke a "preview chain" endpoint: given an employee (or initiative/scenario), compute and return the approval chain *without* creating a request.
- This helps admins validate their configuration.

### C4: Creating Approval Requests

**Trigger Events**
- **Allocation**: When an allocation is created or modified for an initiative with status `APPROVED` or higher. (Existing `LOCKED_STATUSES` logic.)
- **Initiative**: When status transitions to `PENDING_APPROVAL` (existing flow, now enhanced with multi-level).
- **Scenario**: When a scenario is "submitted for approval" (new status or explicit action).

**Chain Resolution**
1. Determine affected employees/nodes:
   - Allocation → single employee's node.
   - Initiative → union of all allocated employees' nodes (or businessOwner's node).
   - Scenario → union of all allocated employees' nodes.
2. For each affected node, walk ancestry collecting `ApprovalPolicy` records for the matching scope, ordered by level.
3. If `crossBuStrategy = COMMON_ANCESTOR`: find the lowest common ancestor of all affected nodes that has a policy; use that single chain.
4. If `crossBuStrategy = ALL_BRANCHES`: collect chains from each branch; merge by level (de-duplicate approvers).
5. Resolve each policy rule to concrete user(s):
   - `NODE_MANAGER` → `OrgNode.managerId` for that node.
   - `SPECIFIC_PERSON` → `ruleConfig.userId`.
   - `ROLE_BASED` → query `User` where `role = ruleConfig.role` AND user is associated with that node (or its ancestry).
   - `ANCESTOR_MANAGER` → walk up from the policy's node until a node with `managerId` is found.
   - `COMMITTEE` → `ruleConfig.userIds`, require `ruleConfig.quorum` approvals.
   - `FALLBACK_ADMIN` → all users with `UserRole.ADMIN`.
6. Check for active `ApprovalDelegation` records; substitute delegates where applicable.
7. Create `ApprovalRequest` with `snapshotChain` and `currentLevel = 1`.
8. Emit `AuditEvent(CREATE, ApprovalRequest, ...)`.
9. Dispatch notification event (email, in-app) to Level 1 approvers.

**Partial Approval / Mid-Flight Changes**
- If the underlying entity changes after a request is created (e.g., allocation percentage updated):
  - The existing request is **cancelled** (`status = CANCELLED`).
  - A new request is created with fresh chain resolution.
  - Any decisions on the cancelled request are preserved for audit but have no effect.
- This is handled by a service-level hook: the allocation/initiative/scenario update service checks for active approval requests and cancels them before creating a new one.

### C5: Approving / Rejecting

**Approver Inbox**
- Query: `ApprovalRequest WHERE status = 'PENDING' AND currentLevel = ?` joined with `snapshotChain` to find requests where the querying user appears at the current level.
- Implementation: use a GIN index on `snapshotChain` JSONB, or materialize a `pending_approver_view` with `(requestId, userId, level)` rows for efficient inbox queries.
- Include delegation: also show requests where the user is an active delegate for the original approver.

**Decision Recording**
1. Approver submits: `requestId`, `decision` (APPROVED | REJECTED), `comments`.
2. Validate: user is a valid approver at the current level (check `snapshotChain[currentLevel].resolvedApprovers`).
3. Insert `ApprovalDecision`.
4. If `decision = REJECTED`:
   a. Set `ApprovalRequest.status = REJECTED`, `resolvedAt = now()`.
   b. Emit rejection event; notify requester.
   c. Revert entity if needed (e.g., initiative back to DRAFT).
5. If `decision = APPROVED`:
   a. Check if all required approvals at this level are satisfied:
      - For non-committee: 1 approval = level complete.
      - For committee: count decisions at this level >= `quorum`.
   b. If level complete and more levels remain: increment `currentLevel`, notify next-level approvers.
   c. If level complete and no more levels: set `status = APPROVED`, `resolvedAt = now()`, apply the approved action (e.g., transition initiative to APPROVED).
6. Emit `AuditEvent(APPROVE|REJECT, ApprovalRequest, ...)`.

**Notifications / Events**
- Use BullMQ `notification` queue (new queue) to send:
  - Email notifications to approvers when it's their turn.
  - In-app notifications via a `Notification` table or WebSocket event.
  - Requester notifications on approval/rejection.

### C6: Reconfiguration Safety

**Tree changes while approvals are pending**
- In-flight `ApprovalRequest` records have a frozen `snapshotChain`. Tree changes do not affect them.
- New requests created after the change use the updated tree.
- Admin dashboard shows "pending requests using outdated tree" count for awareness.

**Approver removed while approvals are pending**
- If an approver user is deactivated, the `snapshotChain` still references them.
- The system allows delegation or admin escalation to break the deadlock.
- A scheduled job flags requests that have been pending >N days at a level where the approver is inactive, and notifies admins.

**Employee moves nodes**
- The old membership is end-dated; new membership starts.
- In-flight requests for that employee use the snapshot chain from their old node. These complete normally.
- Future requests use the new node's chain.
- Historical approval records are not modified — they reflect the state at request time.

---

## D) Graceful Handling Rules (Edge Cases)

| Edge Case | Rule |
|-----------|------|
| **Employee not assigned to a node** | Auto-assign to "Unassigned" sentinel node. "Unassigned" node should have a FALLBACK_ADMIN policy for all scopes. |
| **Node has no approver for required scope/level** | Walk up to parent node. If root reached with no policy found, use FALLBACK_ADMIN (system admins). Log a warning in AuditEvent. |
| **Tree changes while approvals pending** | No effect on in-flight requests (snapshot chain). New requests use updated tree. |
| **Approver removed while approvals pending** | Request stays at current level. After configurable timeout (e.g., 7 days), escalate to next level or admin. Delegation can also resolve. |
| **Initiative spans multiple nodes** | Use `crossBuStrategy` on the highest applicable policy: `COMMON_ANCESTOR` (single chain from LCA) or `ALL_BRANCHES` (parallel chains merged). |
| **Scenario spans multiple BUs** | Same as initiative — derive affected nodes, apply cross-BU strategy. |
| **Temporary delegation** | `ApprovalDelegation` table supports date-ranged delegation per scope/node. Delegate can approve in place of delegator. |
| **Same person at multiple levels** | Allowed — they approve once at the lowest level they appear. Their approval auto-satisfies all higher levels where they also appear (skip-level optimization). |
| **Cycle in tree** | Prevented at application layer: before moving node X under Y, check `Y.path LIKE '%/' || X.id || '/%'`. Reject with `ValidationError`. |
| **Delete node with children** | Rejected — admin must move or delete children first. |
| **Delete node with active members** | Rejected — admin must reassign employees first. |
| **No approval policies defined at all** | Feature operates in "open" mode — actions proceed without approval. This is the initial migration state. |

---

## E) Permission Model

### Roles (extending existing `UserRole` enum)

| Role | Org Tree | Policies | Requests | Approve |
|------|----------|----------|----------|---------|
| ADMIN | Full CRUD | Full CRUD | View all | Can be assigned as approver |
| RESOURCE_MANAGER | View only | View only | Create for allocations | Can be assigned as approver |
| PRODUCT_OWNER | View only | View only | Create for initiatives | Can be assigned as approver |
| BUSINESS_OWNER | View only | View only | Create for initiatives/scenarios | Can be assigned as approver |
| VIEWER | View own subtree | None | View own | None |

### Access Rules

- **Tree builder / Policy editor**: `UserRole.ADMIN` only. Enforced at route level via `fastify.authenticate` + role check middleware.
- **Approval request creation**: Any authenticated user who owns or manages the entity being submitted. Validated by checking `requesterId` matches entity ownership.
- **Approval action**: Only users listed in `snapshotChain[currentLevel].resolvedApprovers` or their active delegates. Validated at decision-recording time.
- **View approval requests**: Users can see requests they created, requests they can approve, and (for admins) all requests.
- **View org tree**: All authenticated users can see the tree structure. Node details (manager, policies) are restricted to ADMIN and the node's manager.
- **Delegation management**: A user can create delegations for themselves. ADMIN can create delegations for anyone.

---

## F) API & Service Design

### New Route Files

**`routes/org-tree.ts`** — Org structure management
```
GET    /api/org/nodes                    — List all nodes (tree or flat, with filters)
GET    /api/org/nodes/:id                — Get node with children, manager, policies
POST   /api/org/nodes                    — Create node (ADMIN)
PUT    /api/org/nodes/:id                — Update node (ADMIN)
POST   /api/org/nodes/:id/move           — Move node to new parent (ADMIN)
DELETE /api/org/nodes/:id                — Soft-delete node (ADMIN)
GET    /api/org/nodes/:id/ancestors      — Get ancestry chain
GET    /api/org/nodes/:id/descendants    — Get subtree
GET    /api/org/tree                     — Full tree (for tree editor UI)
GET    /api/org/coverage                 — Coverage report: unassigned employees, missing policies
```

**`routes/org-membership.ts`** — Employee-node assignments
```
GET    /api/org/memberships              — List memberships (with filters: nodeId, employeeId, active)
POST   /api/org/memberships              — Assign employee to node (ADMIN)
POST   /api/org/memberships/bulk         — Bulk assign (ADMIN)
PUT    /api/org/memberships/:id          — Update membership (ADMIN, e.g., change dates)
DELETE /api/org/memberships/:id          — End membership (ADMIN, sets effectiveEnd)
GET    /api/org/memberships/employee/:id — Get employee's membership history
```

**`routes/approval-policies.ts`** — Approval configuration
```
GET    /api/org/nodes/:id/policies       — List policies for a node
POST   /api/org/nodes/:id/policies       — Create policy (ADMIN)
PUT    /api/approval-policies/:id        — Update policy (ADMIN)
DELETE /api/approval-policies/:id        — Deactivate policy (ADMIN)
POST   /api/approval-policies/preview    — Preview approval chain for entity
```

**`routes/approval-requests.ts`** — Approval workflow
```
GET    /api/approval-requests            — List requests (filtered by status, scope, requester, approver)
GET    /api/approval-requests/:id        — Get request with decisions
POST   /api/approval-requests            — Create request (auto-resolves chain)
POST   /api/approval-requests/:id/decide — Submit decision (APPROVE | REJECT)
POST   /api/approval-requests/:id/cancel — Cancel request
GET    /api/approval-requests/inbox      — Approver's pending queue
GET    /api/approval-requests/my         — Requester's own requests
```

**`routes/delegations.ts`** — Temporary approval delegation
```
GET    /api/delegations                  — List active delegations
POST   /api/delegations                  — Create delegation
DELETE /api/delegations/:id              — Revoke delegation
```

### New Service Files

**`services/org-tree.service.ts`**
- Tree CRUD with path/depth maintenance.
- Cycle detection on move.
- Subtree query via materialized path.
- Coverage analysis (joins `Employee` LEFT JOIN `OrgMembership`).
- Tree serialization for UI (nested JSON structure).

**`services/org-membership.service.ts`**
- Assign/reassign logic with effective dating.
- Bulk import with validation.
- Historical membership queries.

**`services/approval-policy.service.ts`**
- Policy CRUD.
- Chain resolution: given an entity + scope, compute ordered approval chain.
- Preview endpoint logic.

**`services/approval-workflow.service.ts`**
- Request creation with chain snapshot.
- Decision recording with level advancement.
- Cancellation and re-creation on entity change.
- Escalation logic for stale requests.
- Delegation resolution (check `ApprovalDelegation` when resolving approvers).

**`services/audit.service.ts`**
- Generic `log(actorId, entityType, entityId, action, payload)` method.
- Called by all services that modify org/approval data.
- Query methods for admin audit views.

### New Schema Files

**`schemas/org-tree.schema.ts`**
- Zod schemas for node create/update/move.
- Membership create/bulk schemas.
- Policy create/update schemas.

**`schemas/approval.schema.ts`**
- Request create schema.
- Decision schema.
- Delegation schema.

### Concurrency & Idempotency

- **Optimistic concurrency** on `ApprovalRequest`: include `updatedAt` in decision submission; reject if stale (prevents double-approval).
- **Idempotent node creation**: `code` is unique; creating a node with an existing code returns the existing record.
- **Transaction boundaries**:
  - Node move: single transaction for parent update + descendant path updates.
  - Approval decision: single transaction for decision insert + level advancement + (possibly) final status update + entity state change.
  - Membership reassignment: single transaction for old end-date + new insert.

### New BullMQ Queues

| Queue | Purpose | Trigger |
|-------|---------|---------|
| `org-membership-bulk` | Bulk employee assignments | Admin bulk import |
| `approval-notification` | Send approval emails/notifications | Request creation, level advancement |
| `approval-escalation` | Flag stale pending requests | Scheduled (daily) |

---

## G) UI Plan

### Admin UI — Org Tree Editor

**Tree Editor Page** (`/admin/org-tree`)
- Left panel: interactive tree view (collapsible nodes, drag-and-drop for re-parenting).
- Right panel: selected node detail form (name, code, type, manager dropdown, metadata).
- Toolbar: "Add Child Node", "Delete Node" (with validation messages), "Move Node" (drag or modal).
- Color-coding: nodes with approval policies get a badge; nodes missing policies for configured scopes get a warning icon.

**Coverage Dashboard** (`/admin/org-tree/coverage`)
- Table of employees not assigned to any node (or assigned to "Unassigned").
- Table of active nodes missing approval policies per scope.
- Quick-action buttons: "Assign to..." (opens membership modal), "Add Policy..." (opens policy form).
- Stats: total nodes, total covered employees, coverage percentage.

**Approval Policy Config** (within node detail panel)
- Tab or section per scope (Allocations, Initiatives, Scenarios).
- For each scope: ordered list of levels with rule type, config, and "add level" / "remove level" controls.
- Rule type selector with dynamic config fields:
  - `NODE_MANAGER` → no additional config (uses node's manager).
  - `SPECIFIC_PERSON` → user picker.
  - `ROLE_BASED` → role dropdown.
  - `COMMITTEE` → multi-user picker + quorum number input.
  - `FALLBACK_ADMIN` → no additional config.

**Chain Preview / Simulator** (`/admin/org-tree/simulator`)
- Input: select an employee, initiative, or scenario.
- Output: rendered approval chain showing each level, node, rule, and resolved approver names.
- Highlights missing approvers or fallback paths in warning color.

### Approver UI

**Approval Inbox** (`/approvals/inbox`)
- Table of pending requests assigned to the current user.
- Columns: type (scope icon), subject name, requester, requested date, level indicator.
- Click to open detail view.
- Badge count in top navigation bar.

**Request Detail** (`/approvals/:id`)
- Header: scope, subject, requester, status, timeline.
- Chain visualization: horizontal stepper showing each level, who approved, who is pending.
- Diff view: what changed (for modifications — show before/after from `snapshotContext`).
- Action buttons: "Approve" / "Reject" with required comment on rejection.
- Decision history: list of all decisions with timestamps and comments.

**My Requests** (`/approvals/my`)
- Table of requests the current user has created.
- Status filter, scope filter.
- Click to view detail (read-only; no action buttons).

### Frontend State Management

- New TanStack Query hooks: `useOrgTree`, `useOrgNode`, `useOrgMemberships`, `useApprovalPolicies`, `useApprovalRequests`, `useApprovalInbox`.
- New Zustand slice for org tree editor UI state (selected node, expanded nodes, drag state).
- React Router lazy-loaded routes for admin pages.

---

## H) Migration Plan (Clean Break)

### Phase 1: Schema Migration

1. **Create new tables** via Prisma migration:
   - `OrgNode`, `OrgMembership`, `ApprovalPolicy`, `ApprovalRequest`, `ApprovalDecision`, `ApprovalDelegation`, `AuditEvent`.
   - New enums: `OrgNodeType`, `ApprovalScope`, `ApprovalRuleType`, `ApprovalRequestStatus`.
2. **No changes** to existing tables (`Employee`, `Initiative`, `Scenario`, `Allocation`, `Approval`). The new system runs alongside the old `Approval` table until fully adopted.

### Phase 2: Seed Initial Org Structure

1. Create a ROOT node: `{name: "Organization", code: "ROOT", type: ROOT}`.
2. Create an "Unassigned" node: `{name: "Unassigned", code: "UNASSIGNED", type: VIRTUAL, parentId: ROOT.id}`.
3. Auto-create one default DEPARTMENT node per unique `Employee.role` value (or a single "Default Department" if roles are too granular).

### Phase 3: Backfill Memberships

1. For every active employee, create an `OrgMembership` record:
   - If the employee has a `managerId`, group employees by manager and optionally create a TEAM node per manager.
   - Otherwise, assign to the default department node.
2. Validate: every employee has exactly one active membership. Log discrepancies.

### Phase 4: Optional Policy Seeding

1. Create a basic FALLBACK_ADMIN policy on the ROOT node for all scopes.
2. Optionally, if importing from HR system, map HR org units to `OrgNode` records and approval chains to `ApprovalPolicy` records.

### Phase 5: HR Import Reconciliation (Optional)

If importing from an external HR org chart:
1. Parse HR data (CSV or API).
2. For each HR org unit: find or create `OrgNode` by `code` match.
3. For each employee in HR data: find `Employee` by email/name match, create `OrgMembership`.
4. Reconciliation report: matched, unmatched (HR-only, app-only), conflicts.
5. Admin reviews and resolves before finalizing.

### Phase 6: Feature Flag Rollout

1. **Feature flag**: `APPROVAL_V2_ENABLED` (environment variable or database flag).
2. When **disabled**: existing `Approval` table and initiative workflow continue as-is.
3. When **enabled**:
   - Initiative `PENDING_APPROVAL` transition invokes new `approval-workflow.service.ts` instead of old `scoping.service.approve()`.
   - New approval request is created with multi-level chain.
   - Old `Approval` table is still written to for backward compatibility during transition.
4. After validation period, remove old approval logic and feature flag.

### Migration Script Checklist

- [ ] Prisma migration for new tables and enums
- [ ] Seed script for ROOT + Unassigned nodes
- [ ] Backfill script for OrgMembership from existing Employee data
- [ ] Seed script for default FALLBACK_ADMIN policies
- [ ] Data validation query: every active employee has exactly one active OrgMembership
- [ ] Feature flag integration in initiative status transition route
- [ ] Rollback plan: drop new tables, revert route changes (no data loss since old tables untouched)

---

## I) Testing Strategy

### Unit Tests

- **Chain computation** (`approval-policy.service.ts`):
  - Given a tree with policies at various levels, verify correct chain for single-node, multi-node (cross-BU), and edge cases (no policies, missing levels).
  - Test each `ruleType` resolution: NODE_MANAGER, SPECIFIC_PERSON, ROLE_BASED, ANCESTOR_MANAGER, COMMITTEE, FALLBACK_ADMIN.
  - Test delegation substitution.
  - Test skip-level optimization (same person at multiple levels).

- **Tree operations** (`org-tree.service.ts`):
  - Create, move, delete nodes; verify path/depth computation.
  - Cycle detection: attempt to move ancestor under descendant.
  - Deletion constraints: node with children, node with members.

- **Decision logic** (`approval-workflow.service.ts`):
  - Single-approver level: one APPROVED advances.
  - Committee level: verify quorum logic (2 of 3, etc.).
  - Rejection at any level cancels the request.
  - Cancellation of request on entity change.

### Property-Based Tests

- **Tree invariants**:
  - For any generated tree: no cycles exist (verify by walking parent pointers).
  - Every node's `path` matches its actual ancestry.
  - Every node's `depth` matches its path segment count.
  - At most one ROOT node.
  - Every employee has exactly one active membership.

### Integration Tests

- **End-to-end approval flow**:
  - Create org tree → assign employees → define policies → create initiative → submit for approval → approve at L1 → approve at L2 → verify initiative status changes to APPROVED.
  - Same flow with rejection at L2 → verify initiative reverts to DRAFT.
  - Cross-BU initiative with `ALL_BRANCHES` strategy → verify parallel chains.

- **Reconfiguration**:
  - Create pending request → move employee to new node → verify old request unaffected → create new request → verify new chain.
  - Create pending request → deactivate approver → verify escalation behavior.

- **API integration**:
  - Test all new endpoints with authentication and role checks.
  - Test pagination, filtering, and error responses.
  - Test concurrency: two approvers submit decisions simultaneously.

### Migration Tests

- Run migration on a copy of production-like data.
- Validate: all employees have memberships, ROOT node exists, path/depth consistency.
- Verify old approval records are untouched.
- Feature flag toggle: verify both old and new approval paths work.

### Performance Tests

- **Large org**: 50,000 employees, 500 nodes, 10 levels deep.
  - Chain resolution: < 50ms per request.
  - Inbox query: < 100ms for approver with 100+ pending items.
  - Tree serialization: < 200ms for full tree.
  - Coverage report: < 500ms for full scan.
- **Bulk operations**: 5,000 employee reassignments in one batch: < 30s.
- **Path update on node move**: subtree of 1,000 nodes: < 5s.

---

## J) Acceptance Criteria

### Coverage

- [ ] Every active employee is assigned to exactly one `OrgNode` (verified by query: `SELECT COUNT(*) FROM Employee e LEFT JOIN OrgMembership m ON e.id = m.employeeId AND m.effectiveEnd IS NULL WHERE m.id IS NULL` returns 0, excluding employees in "Unassigned" node which also counts as assigned).
- [ ] The "Unassigned" sentinel node exists and has a FALLBACK_ADMIN policy for all three scopes.
- [ ] Admin UI displays coverage percentage and highlights gaps.

### Multi-Level Approvals

- [ ] An approval request with 3 levels processes sequentially: L1 approval enables L2 visibility, L2 approval enables L3 visibility, L3 approval completes the request.
- [ ] Committee approvals respect quorum: if quorum=2 and 3 approvers exist, 2 approvals advance the level.
- [ ] A rejection at any level immediately sets request status to REJECTED and notifies requester.
- [ ] All three scopes (RESOURCE_ALLOCATION, INITIATIVE, SCENARIO) support multi-level approval independently.

### Approver Changes

- [ ] When an admin changes approval policies, in-flight requests retain their original `snapshotChain` and complete normally.
- [ ] New requests created after policy changes use the updated policies.
- [ ] When an approver is deactivated, in-flight requests at their level do not break; delegation or admin escalation resolves them within the configured timeout.

### Tree Integrity

- [ ] Moving a node correctly updates `path` and `depth` for the entire subtree.
- [ ] Attempting to create a cycle (move node under its own descendant) returns a 400 error.
- [ ] Deleting a node with active children or members returns a 400 error with descriptive message.
- [ ] The tree always has exactly one active ROOT node.

### Graceful Fallback

- [ ] If no approval policy exists for a scope at any ancestor, the FALLBACK_ADMIN policy on ROOT (or "Unassigned") applies.
- [ ] If an employee is unassigned, approval requests for their allocations use the "Unassigned" node's chain.
- [ ] Cross-BU initiatives correctly apply the configured `crossBuStrategy` (COMMON_ANCESTOR or ALL_BRANCHES).
- [ ] All fallback behaviors produce `AuditEvent` records for traceability.

### Admin UI

- [ ] Admins (and only admins) can access the tree editor at `/admin/org-tree`.
- [ ] Drag-and-drop reparenting works and updates paths correctly.
- [ ] Policy editor allows defining multi-level approval rules per scope per node.
- [ ] Chain preview/simulator shows the resolved chain for a given entity and highlights issues.

### Approver UX

- [ ] Approvers see a badge count of pending items in navigation.
- [ ] Inbox lists only requests where the current user is an active approver at the current level.
- [ ] Delegation: when a delegate is active, they see the delegator's pending items in their inbox.
- [ ] Approve/Reject actions are idempotent (submitting twice returns success without double-recording).

### Audit

- [ ] Every create, update, delete, move, approve, and reject action produces an `AuditEvent` record.
- [ ] Audit events include actor, entity reference, action, and before/after payload.
- [ ] Admin can query audit history by entity, actor, action, and time range.

### Migration

- [ ] Migration is non-destructive: existing `Approval` table and initiative workflow continue to function when feature flag is disabled.
- [ ] Backfill script assigns all existing employees to org nodes.
- [ ] Feature flag toggle switches between old and new approval paths without restart.
- [ ] Rollback drops new tables without affecting existing data.

---

## Key Tradeoffs

| Tradeoff | Options Considered | Decision | Rationale |
|----------|--------------------|----------|-----------|
| Tree storage | Adjacency list only / Nested sets / Closure table / Materialized path | **Adjacency list + materialized path** | Adjacency list is Prisma-native; materialized path enables subtree queries without recursion. Nested sets are expensive to update; closure table adds a junction table. |
| Chain resolution | Dynamic (compute at approval time) / Snapshot (freeze at creation) | **Snapshot** | Prevents mid-flight corruption. Admins can change policies freely without worrying about breaking pending requests. Adds storage cost but worth the safety. |
| Cross-BU strategy | Always single chain / Always all branches / Configurable | **Configurable per policy** | Different orgs have different governance needs. Flexibility with a sensible default (COMMON_ANCESTOR). |
| Approval levels | Computed from tree depth / Explicitly assigned | **Explicitly assigned** | Gives admins full control. A shallow team node might need 3 levels while a deep one needs 1. Depth-based is too rigid. |
| Inbox query | JSONB search on snapshotChain / Materialized view / Denormalized table | **JSONB GIN index initially**, migrate to materialized view if performance requires | Simplest start; GIN index on JSONB is well-supported in Postgres. Can add a materialized view later if inbox queries >100ms at scale. |
| Delegation | Inline in policy / Separate table | **Separate table** | Clean separation of concerns. Policies define who *should* approve; delegation handles temporary substitutions. |
| Existing Approval table | Replace / Extend / Parallel | **Parallel (new system alongside old)** | Safest migration path. Feature flag controls which system is active. Old data preserved. |
