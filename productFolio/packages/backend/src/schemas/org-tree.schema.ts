import { z } from 'zod';

// All OrgNodeType values from the Prisma schema
const OrgNodeTypeEnum = z.enum([
  'ROOT',
  'DIVISION',
  'DEPARTMENT',
  'TEAM',
  'VIRTUAL',
  'PRODUCT',
  'PLATFORM',
  'FUNCTIONAL',
  'CHAPTER',
]);

// ============================================================================
// OrgNode Schemas
// ============================================================================

export const CreateNodeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  code: z.string().min(1, 'Code is required').max(50),
  type: OrgNodeTypeEnum,
  parentId: z.uuid('Invalid parent ID').optional().nullable(),
  managerId: z.uuid('Invalid manager ID').optional().nullable(),
  sortOrder: z.number().int().nonnegative().optional().default(0),
  isPortfolioArea: z.boolean().optional().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateNodeInput = z.input<typeof CreateNodeSchema>;

export const UpdateNodeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(50).optional(),
  managerId: z.uuid('Invalid manager ID').optional().nullable(),
  sortOrder: z.number().int().nonnegative().optional(),
  isPortfolioArea: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateNodeInput = z.infer<typeof UpdateNodeSchema>;

export const MoveNodeSchema = z.object({
  newParentId: z.uuid('Invalid parent ID'),
});

export type MoveNodeInput = z.infer<typeof MoveNodeSchema>;

export const NodeListFiltersSchema = z.object({
  parentId: z.uuid().optional(),
  type: OrgNodeTypeEnum.optional(),
  isActive: z.coerce.boolean().optional(),
  isPortfolioArea: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

export type NodeListFiltersInput = z.infer<typeof NodeListFiltersSchema>;

// ============================================================================
// OrgMembership Schemas
// ============================================================================

export const AssignMembershipSchema = z.object({
  employeeId: z.uuid('Invalid employee ID'),
  orgNodeId: z.uuid('Invalid org node ID'),
  effectiveStart: z.coerce.date().optional(),
});

export type AssignMembershipInput = z.infer<typeof AssignMembershipSchema>;

export const BulkAssignSchema = z.object({
  employeeIds: z.array(z.uuid()).min(1, 'At least one employee ID is required'),
  orgNodeId: z.uuid('Invalid org node ID'),
  effectiveStart: z.coerce.date().optional(),
});

export type BulkAssignInput = z.infer<typeof BulkAssignSchema>;

export const MembershipListFiltersSchema = z.object({
  orgNodeId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  activeOnly: z.coerce.boolean().optional().default(true),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

export type MembershipListFiltersInput = z.infer<typeof MembershipListFiltersSchema>;
