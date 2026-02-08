import { z } from 'zod';

// ============================================================================
// Enums (mirror Prisma)
// ============================================================================

export const EmployeeOrgRelationshipTypeEnum = z.enum([
  'PRIMARY_REPORTING',
  'DELIVERY_ASSIGNMENT',
  'FUNCTIONAL_ALIGNMENT',
  'CAPABILITY_POOL',
  'TEMPORARY_ROTATION',
]);

// Relationship types that consume capacity by default
const CAPACITY_CONSUMING_TYPES = new Set([
  'DELIVERY_ASSIGNMENT',
  'TEMPORARY_ROTATION',
]);

// ============================================================================
// Create
// ============================================================================

export const CreateEmployeeOrgLinkSchema = z
  .object({
    employeeId: z.string().uuid(),
    orgNodeId: z.string().uuid(),
    relationshipType: EmployeeOrgRelationshipTypeEnum,
    allocationPct: z.number().min(0).max(100).optional(),
    consumeCapacity: z.boolean().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional().nullable(),
  })
  .refine(
    (data) => {
      // DELIVERY_ASSIGNMENT and TEMPORARY_ROTATION with consume require allocationPct
      const effectiveConsume =
        data.consumeCapacity ?? CAPACITY_CONSUMING_TYPES.has(data.relationshipType);
      if (effectiveConsume && data.allocationPct === undefined) {
        return false;
      }
      return true;
    },
    {
      message: 'allocationPct is required for capacity-consuming links',
      path: ['allocationPct'],
    },
  )
  .refine(
    (data) => {
      if (data.endDate && data.startDate && data.endDate <= data.startDate) {
        return false;
      }
      return true;
    },
    { message: 'endDate must be after startDate', path: ['endDate'] },
  );

export type CreateEmployeeOrgLink = z.infer<typeof CreateEmployeeOrgLinkSchema>;

// ============================================================================
// Update
// ============================================================================

export const UpdateEmployeeOrgLinkSchema = z.object({
  allocationPct: z.number().min(0).max(100).optional().nullable(),
  consumeCapacity: z.boolean().optional(),
  endDate: z.coerce.date().optional().nullable(),
});

export type UpdateEmployeeOrgLink = z.infer<typeof UpdateEmployeeOrgLinkSchema>;

// ============================================================================
// Query Filters
// ============================================================================

export const LinkListFiltersSchema = z.object({
  employeeId: z.string().uuid().optional(),
  orgNodeId: z.string().uuid().optional(),
  relationshipType: EmployeeOrgRelationshipTypeEnum.optional(),
  activeOnly: z.coerce.boolean().optional().default(true),
  consumeCapacityOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export type LinkListFilters = z.infer<typeof LinkListFiltersSchema>;

// ============================================================================
// Migration Input
// ============================================================================

export const MigrateFromMembershipsSchema = z.object({
  dryRun: z.coerce.boolean().optional().default(true),
});
