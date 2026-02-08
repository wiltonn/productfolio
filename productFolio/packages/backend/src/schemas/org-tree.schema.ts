import { z } from 'zod';

// ============================================================================
// OrgNode Schemas
// ============================================================================

export const CreateNodeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  code: z.string().min(1, 'Code is required').max(50),
  type: z.enum(['ROOT', 'DIVISION', 'DEPARTMENT', 'TEAM', 'VIRTUAL']),
  parentId: z.string().uuid('Invalid parent ID').optional().nullable(),
  managerId: z.string().uuid('Invalid manager ID').optional().nullable(),
  sortOrder: z.number().int().nonnegative().optional().default(0),
  isPortfolioArea: z.boolean().optional().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateNodeInput = z.infer<typeof CreateNodeSchema>;

export const UpdateNodeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(50).optional(),
  managerId: z.string().uuid('Invalid manager ID').optional().nullable(),
  sortOrder: z.number().int().nonnegative().optional(),
  isPortfolioArea: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateNodeInput = z.infer<typeof UpdateNodeSchema>;

export const MoveNodeSchema = z.object({
  newParentId: z.string().uuid('Invalid parent ID'),
});

export type MoveNodeInput = z.infer<typeof MoveNodeSchema>;

export const NodeListFiltersSchema = z.object({
  parentId: z.string().uuid().optional(),
  type: z.enum(['ROOT', 'DIVISION', 'DEPARTMENT', 'TEAM', 'VIRTUAL']).optional(),
  isActive: z.coerce.boolean().optional(),
  isPortfolioArea: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

export type NodeListFiltersInput = z.infer<typeof NodeListFiltersSchema>;

// ============================================================================
// OrgMembership Schemas
// ============================================================================

export const AssignMembershipSchema = z.object({
  employeeId: z.string().uuid('Invalid employee ID'),
  orgNodeId: z.string().uuid('Invalid org node ID'),
  effectiveStart: z.coerce.date().optional(),
});

export type AssignMembershipInput = z.infer<typeof AssignMembershipSchema>;

export const BulkAssignSchema = z.object({
  employeeIds: z.array(z.string().uuid()).min(1, 'At least one employee ID is required'),
  orgNodeId: z.string().uuid('Invalid org node ID'),
  effectiveStart: z.coerce.date().optional(),
});

export type BulkAssignInput = z.infer<typeof BulkAssignSchema>;

export const MembershipListFiltersSchema = z.object({
  orgNodeId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  activeOnly: z.coerce.boolean().optional().default(true),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

export type MembershipListFiltersInput = z.infer<typeof MembershipListFiltersSchema>;
