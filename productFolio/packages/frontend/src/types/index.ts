// Initiative status enum (milestone-oriented)
export type InitiativeStatus =
  | 'PROPOSED'
  | 'SCOPING'
  | 'RESOURCING'
  | 'IN_EXECUTION'
  | 'COMPLETE'
  | 'ON_HOLD'
  | 'CANCELLED';

// Delivery health enum
export type DeliveryHealth = 'ON_TRACK' | 'AT_RISK' | 'DELAYED';

// User types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'PRODUCT_OWNER' | 'BUSINESS_OWNER' | 'RESOURCE_MANAGER' | 'VIEWER';
  createdAt: string;
  updatedAt: string;
}

// Scope item type
export interface ScopeItem {
  id: string;
  initiativeId: string;
  name: string;
  description: string | null;
  skillDemand: Record<string, number> | null;
  estimateP50: number | null;
  estimateP90: number | null;
  quarterDistribution: Record<string, number> | null;
  createdAt: string;
  updatedAt: string;
}

// Initiative types
export interface Initiative {
  id: string;
  title: string;
  description: string | null;
  businessOwnerId: string;
  productOwnerId: string;
  status: InitiativeStatus;
  targetQuarter: string | null;
  deliveryHealth: DeliveryHealth | null;
  customFields: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  // Relations (optional, depends on includes)
  businessOwner?: User;
  productOwner?: User;
  scopeItems?: ScopeItem[];
}

// API Response types
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Filter types
export interface InitiativeFilters {
  page?: number;
  limit?: number;
  status?: InitiativeStatus | InitiativeStatus[];
  search?: string;
  targetQuarter?: string;
  businessOwnerId?: string;
  productOwnerId?: string;
}

// Bulk operation types
export interface BulkUpdateResult {
  updated: number;
  failed: number;
  errors: Array<{
    id: string;
    message: string;
  }>;
}

// ============================================================================
// Org Structure Types
// ============================================================================

export type OrgNodeType = 'ROOT' | 'DIVISION' | 'DEPARTMENT' | 'TEAM' | 'VIRTUAL';
export type ApprovalScope = 'RESOURCE_ALLOCATION' | 'INITIATIVE' | 'SCENARIO';
export type ApprovalRuleType = 'NODE_MANAGER' | 'SPECIFIC_PERSON' | 'ROLE_BASED' | 'ANCESTOR_MANAGER' | 'COMMITTEE' | 'FALLBACK_ADMIN';
export type ApprovalRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
export type CrossBuStrategy = 'COMMON_ANCESTOR' | 'ALL_BRANCHES';

export interface OrgNode {
  id: string;
  name: string;
  code: string;
  type: OrgNodeType;
  parentId: string | null;
  path: string;
  depth: number;
  managerId: string | null;
  sortOrder: number;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  manager?: { id: string; name: string } | null;
  children?: OrgNode[];
  parent?: { id: string; name: string; code: string } | null;
  _count?: { memberships: number; approvalPolicies: number };
}

export interface OrgMembership {
  id: string;
  employeeId: string;
  orgNodeId: string;
  effectiveStart: string;
  effectiveEnd: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: { id: string; name: string; role: string; employmentType: string };
  orgNode?: { id: string; name: string; code: string; type: OrgNodeType };
}

export interface ApprovalPolicy {
  id: string;
  orgNodeId: string;
  scope: ApprovalScope;
  level: number;
  ruleType: ApprovalRuleType;
  ruleConfig: Record<string, unknown>;
  crossBuStrategy: CrossBuStrategy;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  orgNode?: { id: string; name: string; code: string };
}

export interface ResolvedApprover {
  userId: string;
  name: string;
  email: string;
}

export interface ChainStep {
  level: number;
  orgNodeId: string;
  orgNodeName: string;
  ruleType: ApprovalRuleType;
  resolvedApprovers: ResolvedApprover[];
  quorum?: number;
}

export interface ApprovalRequest {
  id: string;
  scope: ApprovalScope;
  subjectType: string;
  subjectId: string;
  requesterId: string;
  status: ApprovalRequestStatus;
  snapshotChain: ChainStep[];
  snapshotContext: Record<string, unknown>;
  currentLevel: number;
  expiresAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requester?: { id: string; name: string; email: string };
  decisions?: ApprovalDecision[];
  _count?: { decisions: number };
}

export interface ApprovalDecision {
  id: string;
  requestId: string;
  level: number;
  deciderId: string;
  decision: 'APPROVED' | 'REJECTED';
  comments: string | null;
  decidedAt: string;
  decider?: { id: string; name: string; email: string };
}

export interface ApprovalDelegation {
  id: string;
  delegatorId: string;
  delegateId: string;
  scope: ApprovalScope | null;
  orgNodeId: string | null;
  effectiveStart: string;
  effectiveEnd: string;
  reason: string | null;
  createdAt: string;
  delegator?: { id: string; name: string; email: string };
  delegate?: { id: string; name: string; email: string };
  orgNode?: { id: string; name: string; code: string } | null;
}

export interface CoverageReport {
  totalEmployees: number;
  assignedEmployees: number;
  unassignedCount: number;
  coveragePercentage: number;
  unassignedEmployees: Array<{ id: string; name: string; role: string; employmentType: string }>;
  totalActiveNodes: number;
  nodesWithoutPolicies: Array<{ id: string; name: string; code: string; type: OrgNodeType }>;
}

export interface AuditEvent {
  id: string;
  actorId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
  actor?: { id: string; name: string; email: string } | null;
}

// Quarter helpers
export function getCurrentQuarter(): string {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${quarter}`;
}

export function getQuarterOptions(yearsBack = 1, yearsForward = 2): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();

  for (let year = currentYear - yearsBack; year <= currentYear + yearsForward; year++) {
    for (let q = 1; q <= 4; q++) {
      const value = `${year}-Q${q}`;
      options.push({ value, label: value });
    }
  }

  return options;
}
