import { z } from 'zod';
import { InitiativeStatus, DeliveryHealth } from '@prisma/client';

// Valid status transitions (milestone flow)
const STATUS_TRANSITIONS: Record<InitiativeStatus, InitiativeStatus[]> = {
  [InitiativeStatus.PROPOSED]: [
    InitiativeStatus.SCOPING,
    InitiativeStatus.ON_HOLD,
    InitiativeStatus.CANCELLED,
  ],
  [InitiativeStatus.SCOPING]: [
    InitiativeStatus.RESOURCING,
    InitiativeStatus.ON_HOLD,
    InitiativeStatus.CANCELLED,
  ],
  [InitiativeStatus.RESOURCING]: [
    InitiativeStatus.IN_EXECUTION,
    InitiativeStatus.ON_HOLD,
    InitiativeStatus.CANCELLED,
  ],
  [InitiativeStatus.IN_EXECUTION]: [
    InitiativeStatus.COMPLETE,
    InitiativeStatus.ON_HOLD,
    InitiativeStatus.CANCELLED,
  ],
  [InitiativeStatus.ON_HOLD]: [
    InitiativeStatus.PROPOSED,
    InitiativeStatus.SCOPING,
    InitiativeStatus.RESOURCING,
    InitiativeStatus.IN_EXECUTION,
    InitiativeStatus.CANCELLED,
  ],
  [InitiativeStatus.COMPLETE]: [],
  [InitiativeStatus.CANCELLED]: [],
};

// UUID validation
const uuidSchema = z
  .string()
  .uuid('Must be a valid UUID')
  .describe('UUID');

// Custom fields schema (flexible JSON)
const customFieldsSchema = z
  .record(z.unknown())
  .nullable()
  .optional()
  .describe('Custom fields as JSON object');

// Target quarter validation (e.g., "2026-Q1")
const targetQuarterSchema = z
  .string()
  .regex(/^\d{4}-Q[1-4]$/, 'Must be in format YYYY-QN (e.g., 2026-Q1)')
  .nullable()
  .optional();

/**
 * Schema for creating a new initiative
 */
export const CreateInitiativeSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be 255 characters or less'),
  description: z
    .string()
    .max(4000, 'Description must be 4000 characters or less')
    .optional()
    .nullable(),
  businessOwnerId: uuidSchema,
  productOwnerId: uuidSchema,
  portfolioAreaId: uuidSchema.optional().nullable(),
  productLeaderId: uuidSchema.optional().nullable(),
  status: z
    .nativeEnum(InitiativeStatus)
    .default(InitiativeStatus.PROPOSED)
    .optional(),
  targetQuarter: targetQuarterSchema,
  deliveryHealth: z.nativeEnum(DeliveryHealth).nullable().optional(),
  customFields: customFieldsSchema,
});

export type CreateInitiativeInput = z.infer<typeof CreateInitiativeSchema>;

/**
 * Schema for updating an initiative
 */
export const UpdateInitiativeSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be 255 characters or less')
    .optional(),
  description: z
    .string()
    .max(4000, 'Description must be 4000 characters or less')
    .optional()
    .nullable(),
  businessOwnerId: uuidSchema.optional(),
  productOwnerId: uuidSchema.optional(),
  portfolioAreaId: uuidSchema.optional().nullable(),
  productLeaderId: uuidSchema.optional().nullable(),
  targetQuarter: targetQuarterSchema,
  deliveryHealth: z.nativeEnum(DeliveryHealth).nullable().optional(),
  customFields: customFieldsSchema,
});

export type UpdateInitiativeInput = z.infer<typeof UpdateInitiativeSchema>;

/**
 * Schema for filtering initiatives
 */
export const InitiativeFiltersSchema = z.object({
  status: z.nativeEnum(InitiativeStatus).optional(),
  businessOwnerId: uuidSchema.optional(),
  productOwnerId: uuidSchema.optional(),
  portfolioAreaId: uuidSchema.optional(),
  targetQuarter: z.string().optional(),
  deliveryHealth: z.nativeEnum(DeliveryHealth).optional(),
  search: z
    .string()
    .max(255, 'Search term must be 255 characters or less')
    .optional(),
  page: z
    .number()
    .int('Page must be an integer')
    .min(1, 'Page must be at least 1')
    .default(1),
  limit: z
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit must be 100 or less')
    .default(20),
});

export type InitiativeFiltersInput = z.infer<typeof InitiativeFiltersSchema>;

/**
 * Schema for status transitions
 */
export const StatusTransitionSchema = z.object({
  newStatus: z.nativeEnum(InitiativeStatus),
});

export type StatusTransitionInput = z.infer<typeof StatusTransitionSchema>;

/**
 * Validate if a status transition is allowed
 */
export function isValidStatusTransition(
  from: InitiativeStatus,
  to: InitiativeStatus
): boolean {
  if (from === to) {
    return false;
  }
  return STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Schema for bulk updates
 */
export const BulkUpdateSchema = z.object({
  ids: z
    .array(uuidSchema, {
      errorMap: () => ({ message: 'ids must be an array of valid UUIDs' }),
    })
    .min(1, 'At least one id is required')
    .max(100, 'Cannot update more than 100 items at once'),
  updates: z.object({
    customFields: customFieldsSchema,
  }),
});

export type BulkUpdateInput = z.infer<typeof BulkUpdateSchema>;

/**
 * Schema for bulk delete
 */
export const BulkDeleteSchema = z.object({
  ids: z
    .array(uuidSchema, {
      errorMap: () => ({ message: 'ids must be an array of valid UUIDs' }),
    })
    .min(1, 'At least one id is required')
    .max(100, 'Cannot delete more than 100 items at once'),
});

export type BulkDeleteInput = z.infer<typeof BulkDeleteSchema>;

/**
 * Schema for CSV row validation
 */
export const CsvRowSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  businessOwnerId: uuidSchema,
  productOwnerId: uuidSchema,
  portfolioAreaId: uuidSchema.optional(),
  productLeaderId: uuidSchema.optional(),
  status: z
    .nativeEnum(InitiativeStatus)
    .default(InitiativeStatus.PROPOSED)
    .optional(),
  targetQuarter: targetQuarterSchema,
  deliveryHealth: z.nativeEnum(DeliveryHealth).nullable().optional(),
});

export type CsvRowInput = z.infer<typeof CsvRowSchema>;

/**
 * Schema for CSV import request
 */
export const CsvImportSchema = z.object({
  data: z
    .array(z.record(z.string()))
    .min(1, 'CSV data cannot be empty'),
});

export type CsvImportInput = z.infer<typeof CsvImportSchema>;

/**
 * Schema for CSV export filters
 */
export const CsvExportSchema = z.object({
  status: z.nativeEnum(InitiativeStatus).optional(),
  businessOwnerId: uuidSchema.optional(),
  productOwnerId: uuidSchema.optional(),
  portfolioAreaId: uuidSchema.optional(),
  targetQuarter: z.string().optional(),
  deliveryHealth: z.nativeEnum(DeliveryHealth).optional(),
  search: z.string().optional(),
});

export type CsvExportInput = z.infer<typeof CsvExportSchema>;

/**
 * Schema for initiative allocation hours query
 */
export const InitiativeAllocationHoursQuerySchema = z.object({
  initiativeIds: z.string().min(1, 'At least one initiative ID is required'),
  currentQuarterStart: z.coerce.date(),
  currentQuarterEnd: z.coerce.date(),
  nextQuarterStart: z.coerce.date(),
  nextQuarterEnd: z.coerce.date(),
});
