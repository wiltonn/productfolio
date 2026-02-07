# Task #1: Formalize OrgNode/OrgMembership/AuditEvent + Related Approval Models

## Problem
The runtime DB has several tables that exist but are NOT represented in `schema.prisma`. The Prisma client is generated from a schema that was manually extended outside of Prisma's migration system. The code actively uses these models (org-tree.service.ts, audit.service.ts, org-membership.service.ts, approval-policy.service.ts, approval-workflow.service.ts).

## Models to Add to schema.prisma (ADDITIVE ONLY)

### Enums (6 new enums)
1. **OrgNodeType**: `ROOT`, `DIVISION`, `DEPARTMENT`, `TEAM`, `VIRTUAL`
2. **ApprovalScope**: `RESOURCE_ALLOCATION`, `INITIATIVE`, `SCENARIO`
3. **ApprovalRuleType**: `NODE_MANAGER`, `SPECIFIC_PERSON`, `ROLE_BASED`, `ANCESTOR_MANAGER`, `COMMITTEE`, `FALLBACK_ADMIN`
4. **CrossBuStrategy**: `COMMON_ANCESTOR`, `ALL_BRANCHES`
5. **ApprovalRequestStatus**: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `EXPIRED`
6. **ApprovalDecisionType**: `APPROVED`, `REJECTED`

### Models (7 new models)

1. **OrgNode** - Org tree node (materialized path pattern)
   - id (UUID PK), name, code (unique), type (OrgNodeType), parentId (self-ref FK), path, depth, managerId (FK -> Employee), sortOrder, isActive, metadata (JSONB)
   - Relations: parent/children (self), manager (Employee), memberships (OrgMembership[]), approvalPolicies (ApprovalPolicy[])
   - Table: `OrgNode` (default Prisma naming)
   - Indexes: parentId, type, code, managerId

2. **OrgMembership** - Employee <-> OrgNode temporal assignment
   - id (UUID PK), employeeId (FK -> Employee), orgNodeId (FK -> OrgNode), effectiveStart, effectiveEnd (nullable)
   - Relations: employee, orgNode
   - Table: `OrgMembership` (default Prisma naming)
   - Indexes: employeeId, orgNodeId, effectiveEnd

3. **AuditEvent** - Audit trail
   - id (UUID PK), actorId (nullable FK -> User), entityType, entityId, action, payload (JSONB), ipAddress (nullable), createdAt
   - Relations: actor (User)
   - Table: `AuditEvent` (default Prisma naming)
   - Indexes: entityType+entityId, actorId, action, createdAt

4. **ApprovalPolicy** - Org-scoped approval rules
   - id (UUID PK), orgNodeId (FK -> OrgNode), scope (ApprovalScope), level (Int), ruleType (ApprovalRuleType), ruleConfig (JSONB), crossBuStrategy (CrossBuStrategy), isActive
   - Relations: orgNode
   - Table: `ApprovalPolicy` (default Prisma naming)
   - Indexes: orgNodeId, scope, isActive

5. **ApprovalRequest** - Approval workflow requests
   - id (UUID PK), scope (ApprovalScope), subjectType, subjectId, requesterId (FK -> User), status (ApprovalRequestStatus), snapshotChain (JSONB), snapshotContext (JSONB), currentLevel (Int), resolvedAt (nullable), expiresAt (nullable)
   - Relations: requester (User), decisions (ApprovalDecision[])
   - Table: `ApprovalRequest` (default Prisma naming)
   - Indexes: scope, status, requesterId, subjectType+subjectId

6. **ApprovalDecision** - Individual approval decisions
   - id (UUID PK), requestId (FK -> ApprovalRequest), level (Int), deciderId (FK -> User), decision (ApprovalDecisionType), comments (Text nullable), decidedAt
   - Relations: request (ApprovalRequest), decider (User)
   - Table: `ApprovalDecision` (default Prisma naming)
   - Indexes: requestId, deciderId

7. **ApprovalDelegation** - Delegate approval authority
   - id (UUID PK), delegatorId (FK -> User), delegateId (FK -> User), scope (ApprovalScope nullable), orgNodeId (FK -> OrgNode nullable), effectiveStart, effectiveEnd, reason (Text nullable)
   - Relations: delegator (User), delegate (User), orgNode (OrgNode)
   - Table: `ApprovalDelegation` (default Prisma naming)
   - Indexes: delegatorId, delegateId, effectiveStart+effectiveEnd

### Reverse Relations to Add to Existing Models

1. **Employee** model - add:
   - `orgMemberships OrgMembership[]`
   - `managedOrgNodes OrgNode[]`

2. **User** model - add:
   - `auditEvents AuditEvent[]`
   - `approvalRequests ApprovalRequest[]`
   - `approvalDecisions ApprovalDecision[]`
   - `delegationsGiven ApprovalDelegation[] @relation("Delegator")`
   - `delegationsReceived ApprovalDelegation[] @relation("Delegate")`

## Files Touched
- `packages/backend/prisma/schema.prisma` (add enums, models, reverse relations)

## Migration Strategy
Since these tables ALREADY EXIST in the runtime DB, the migration must:
1. Add the models to schema.prisma
2. Create an empty migration that marks these tables as "already applied"
3. Use `prisma migrate diff --from-empty --to-schema-datamodel` to verify alignment, then create a migration with `-- Already exists in runtime DB` comments
4. Alternatively: create the migration SQL, then `prisma migrate resolve --applied` to mark it

## Risks
- **Schema drift**: The actual runtime DB table columns may differ slightly from what the code implies. Since we cannot connect to the DB to introspect, we derive the schema from the service code usage patterns.
- **Enum values in DB**: If the DB has different enum values than what we define, the migration will fail. We derive enum values from Zod schemas and service code.
- **Approval models scope creep**: Task #1 description only mentions OrgNode/OrgMembership/AuditEvent, but the Approval models (ApprovalPolicy, ApprovalRequest, ApprovalDecision, ApprovalDelegation) are also missing from schema.prisma and are tightly coupled to OrgNode. Including them prevents a broken schema where OrgNode references `approvalPolicies` but the model doesn't exist.

## Decision Point
Should I include the 4 Approval models (ApprovalPolicy, ApprovalRequest, ApprovalDecision, ApprovalDelegation) in this task, or defer them to a separate task? The code has hard dependencies between OrgNode <-> ApprovalPolicy, so including them seems necessary.
