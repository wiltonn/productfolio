import { z } from 'zod';
import { InitiativeStatus } from '@prisma/client';

// Valid status transitions
const STATUS_TRANSITIONS: Record<InitiativeStatus, InitiativeStatus[]> = {
  [InitiativeStatus.DRAFT]: [InitiativeStatus.PENDING_APPROVAL],
  [InitiativeStatus.PENDING_APPROVAL]: [
    InitiativeStatus.APPROVED,
    InitiativeStatus.CANCELLED,
  ],
  [InitiativeStatus.APPROVED]: [
    InitiativeStatus.IN_PROGRESS,
    InitiativeStatus.ON_HOLD,
    InitiativeStatus.CANCELLED,
  ],
  [InitiativeStatus.IN_PROGRESS]: [
    InitiativeStatus.COMPLETED,
    InitiativeStatus.ON_HOLD,
    InitiativeStatus.CANCELLED,
  ],
  [InitiativeStatus.ON_HOLD]: [
    InitiativeStatus.IN_PROGRESS,
    InitiativeStatus.CANCELLED,
  ],
  [InitiativeStatus.COMPLETED]: [],
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

// Quarter format validation (e.g., "2024-Q1")
const quarterSchema = z
  .string()
  .regex(/^\d{4}-Q[1-4]$/, 'Must be in format YYYY-Qn (e.g., 2024-Q1)')
  .optional()
  .nullable()
  .describe('Target quarter in format YYYY-Qn');

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
  status: z
    .nativeEnum(InitiativeStatus)
    .default(InitiativeStatus.DRAFT)
    .optional(),
  targetQuarter: quarterSchema,
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
  targetQuarter: quarterSchema,
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
  targetQuarter: quarterSchema,
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
  newStatus: z
    .nativeEnum(InitiativeStatus)
    .refine(
      (status) => status !== InitiativeStatus.DRAFT,
      'Cannot transition to DRAFT status'
    ),
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
  status: z
    .nativeEnum(InitiativeStatus)
    .default(InitiativeStatus.DRAFT)
    .optional(),
  targetQuarter: quarterSchema,
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
  targetQuarter: quarterSchema,
  search: z.string().optional(),
});

export type CsvExportInput = z.infer<typeof CsvExportSchema>;
