import { z } from 'zod';

// ============================================================================
// Approval Policy Schemas
// ============================================================================

export const CreatePolicySchema = z.object({
  orgNodeId: z.string().uuid('Invalid org node ID').optional(),
  scope: z.enum(['RESOURCE_ALLOCATION', 'INITIATIVE', 'SCENARIO']),
  level: z.number().int().min(1, 'Level must be >= 1'),
  ruleType: z.enum([
    'NODE_MANAGER',
    'SPECIFIC_PERSON',
    'ROLE_BASED',
    'ANCESTOR_MANAGER',
    'COMMITTEE',
    'FALLBACK_ADMIN',
  ]),
  ruleConfig: z.record(z.string(), z.unknown()).optional().default({}),
  crossBuStrategy: z.enum(['COMMON_ANCESTOR', 'ALL_BRANCHES']).optional(),
  enforcement: z.enum(['BLOCKING', 'ADVISORY']).optional(),
});

export type CreatePolicyInput = z.infer<typeof CreatePolicySchema>;

export const UpdatePolicySchema = z.object({
  ruleType: z.enum([
    'NODE_MANAGER',
    'SPECIFIC_PERSON',
    'ROLE_BASED',
    'ANCESTOR_MANAGER',
    'COMMITTEE',
    'FALLBACK_ADMIN',
  ]).optional(),
  ruleConfig: z.record(z.string(), z.unknown()).optional(),
  crossBuStrategy: z.enum(['COMMON_ANCESTOR', 'ALL_BRANCHES']).optional(),
  enforcement: z.enum(['BLOCKING', 'ADVISORY']).optional(),
  isActive: z.boolean().optional(),
});

export type UpdatePolicyInput = z.infer<typeof UpdatePolicySchema>;

// ============================================================================
// Approval Request Schemas
// ============================================================================

export const CreateRequestSchema = z.object({
  scope: z.enum(['RESOURCE_ALLOCATION', 'INITIATIVE', 'SCENARIO']),
  subjectType: z.enum(['allocation', 'initiative', 'scenario']),
  subjectId: z.string().uuid('Invalid subject ID'),
  snapshotContext: z.record(z.string(), z.unknown()).optional(),
  expiresAt: z.coerce.date().optional(),
});

export type CreateRequestInput = z.infer<typeof CreateRequestSchema>;

export const DecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comments: z.string().max(2000).optional(),
});

export type DecisionInput = z.infer<typeof DecisionSchema>;

export const RequestListFiltersSchema = z.object({
  scope: z.enum(['RESOURCE_ALLOCATION', 'INITIATIVE', 'SCENARIO']).optional(),
  subjectType: z.string().optional(),
  subjectId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type RequestListFiltersInput = z.infer<typeof RequestListFiltersSchema>;

export const InboxFiltersSchema = z.object({
  scope: z.enum(['RESOURCE_ALLOCATION', 'INITIATIVE', 'SCENARIO']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type InboxFiltersInput = z.infer<typeof InboxFiltersSchema>;

// ============================================================================
// Preview Chain Schema
// ============================================================================

export const PreviewChainSchema = z.object({
  scope: z.enum(['RESOURCE_ALLOCATION', 'INITIATIVE', 'SCENARIO']),
  subjectType: z.enum(['allocation', 'initiative', 'scenario']),
  subjectId: z.string().uuid('Invalid subject ID'),
});

export type PreviewChainInput = z.infer<typeof PreviewChainSchema>;

// ============================================================================
// Delegation Schemas
// ============================================================================

export const CreateDelegationSchema = z.object({
  delegatorId: z.string().uuid('Invalid delegator ID'),
  delegateId: z.string().uuid('Invalid delegate ID'),
  scope: z.enum(['RESOURCE_ALLOCATION', 'INITIATIVE', 'SCENARIO']).optional(),
  orgNodeId: z.string().uuid('Invalid org node ID').optional(),
  effectiveStart: z.coerce.date(),
  effectiveEnd: z.coerce.date(),
  reason: z.string().max(1000).optional(),
});

export type CreateDelegationInput = z.infer<typeof CreateDelegationSchema>;

// ============================================================================
// Audit Query Schema
// ============================================================================

export const AuditQuerySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

export type AuditQueryInput = z.infer<typeof AuditQuerySchema>;
