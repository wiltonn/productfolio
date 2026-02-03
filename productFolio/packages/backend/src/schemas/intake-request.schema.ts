import { z } from 'zod';
import { IntakeRequestStatus } from '@prisma/client';

// Valid status transitions
const STATUS_TRANSITIONS: Record<IntakeRequestStatus, IntakeRequestStatus[]> = {
  [IntakeRequestStatus.DRAFT]: [IntakeRequestStatus.TRIAGE, IntakeRequestStatus.CLOSED],
  [IntakeRequestStatus.TRIAGE]: [
    IntakeRequestStatus.ASSESSED,
    IntakeRequestStatus.DRAFT,
    IntakeRequestStatus.CLOSED,
  ],
  [IntakeRequestStatus.ASSESSED]: [
    IntakeRequestStatus.APPROVED,
    IntakeRequestStatus.TRIAGE,
    IntakeRequestStatus.CLOSED,
  ],
  [IntakeRequestStatus.APPROVED]: [
    IntakeRequestStatus.CONVERTED,
    IntakeRequestStatus.ASSESSED,
    IntakeRequestStatus.CLOSED,
  ],
  [IntakeRequestStatus.CONVERTED]: [IntakeRequestStatus.CLOSED],
  [IntakeRequestStatus.CLOSED]: [IntakeRequestStatus.DRAFT],
};

export function isValidIntakeTransition(
  from: IntakeRequestStatus,
  to: IntakeRequestStatus
): boolean {
  if (from === to) return false;
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

const uuidSchema = z.string().uuid('Must be a valid UUID');

export const CreateIntakeRequestSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(500, 'Title must be 500 characters or less'),
  description: z.string().max(10000).optional().nullable(),
  requestedById: uuidSchema.optional().nullable(),
  sponsorId: uuidSchema.optional().nullable(),
  portfolioAreaId: uuidSchema.optional().nullable(),
  targetQuarter: z
    .string()
    .regex(/^\d{4}-Q[1-4]$/, 'Must be in format YYYY-QN')
    .optional()
    .nullable(),
  valueScore: z.number().int().min(1).max(10).optional().nullable(),
  effortEstimate: z.enum(['XS', 'S', 'M', 'L', 'XL']).optional().nullable(),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().nullable(),
  customerName: z.string().max(255).optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  strategicThemes: z.array(z.string()).optional().nullable(),
  sourceType: z.literal('JIRA').optional().nullable(),
  intakeItemId: uuidSchema.optional().nullable(),
  decisionNotes: z.string().max(10000).optional().nullable(),
});

export type CreateIntakeRequestInput = z.infer<typeof CreateIntakeRequestSchema>;

export const UpdateIntakeRequestSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional().nullable(),
  requestedById: uuidSchema.optional().nullable(),
  sponsorId: uuidSchema.optional().nullable(),
  portfolioAreaId: uuidSchema.optional().nullable(),
  targetQuarter: z
    .string()
    .regex(/^\d{4}-Q[1-4]$/, 'Must be in format YYYY-QN')
    .optional()
    .nullable(),
  valueScore: z.number().int().min(1).max(10).optional().nullable(),
  effortEstimate: z.enum(['XS', 'S', 'M', 'L', 'XL']).optional().nullable(),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().nullable(),
  customerName: z.string().max(255).optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  strategicThemes: z.array(z.string()).optional().nullable(),
  decisionNotes: z.string().max(10000).optional().nullable(),
});

export type UpdateIntakeRequestInput = z.infer<typeof UpdateIntakeRequestSchema>;

export const IntakeRequestStatusTransitionSchema = z.object({
  newStatus: z.nativeEnum(IntakeRequestStatus),
  closedReason: z
    .enum(['REJECTED', 'DEFERRED', 'DUPLICATE', 'OUT_OF_SCOPE'])
    .optional()
    .nullable(),
  decisionNotes: z.string().max(10000).optional().nullable(),
});

export type IntakeRequestStatusTransitionInput = z.infer<
  typeof IntakeRequestStatusTransitionSchema
>;

export const IntakeRequestFiltersSchema = z.object({
  status: z.nativeEnum(IntakeRequestStatus).optional(),
  portfolioAreaId: uuidSchema.optional(),
  targetQuarter: z.string().optional(),
  requestedById: uuidSchema.optional(),
  sponsorId: uuidSchema.optional(),
  sourceType: z.literal('JIRA').optional(),
  search: z.string().max(255).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type IntakeRequestFiltersInput = z.infer<typeof IntakeRequestFiltersSchema>;

export const IntakeRequestIdSchema = z.object({
  id: uuidSchema,
});

export const ConvertToInitiativeSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(4000).optional().nullable(),
  businessOwnerId: uuidSchema,
  productOwnerId: uuidSchema,
  portfolioAreaId: uuidSchema.optional().nullable(),
  productLeaderId: uuidSchema.optional().nullable(),
  targetQuarter: z
    .string()
    .regex(/^\d{4}-Q[1-4]$/, 'Must be in format YYYY-QN')
    .optional()
    .nullable(),
});

export type ConvertToInitiativeInput = z.infer<typeof ConvertToInitiativeSchema>;
