import { z } from 'zod';
import { periodDistributionEntrySchema } from './periods.schema.js';

// Skill Demand: { skillName: number }
const skillDemandSchema = z.record(z.string(), z.number()).optional();

export const CreateScopeItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  skillDemand: skillDemandSchema,
  estimateP50: z.number().positive('Estimate P50 must be positive').optional(),
  estimateP90: z.number().positive('Estimate P90 must be positive').optional(),
  periodDistributions: z.array(periodDistributionEntrySchema).optional(),
});

export type CreateScopeItemInput = z.infer<typeof CreateScopeItemSchema>;

export const UpdateScopeItemSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  skillDemand: skillDemandSchema,
  estimateP50: z.number().positive().optional(),
  estimateP90: z.number().positive().optional(),
  periodDistributions: z.array(periodDistributionEntrySchema).optional(),
});

export type UpdateScopeItemInput = z.infer<typeof UpdateScopeItemSchema>;

export const SubmitApprovalSchema = z.object({
  notes: z.string().optional(),
});

export type SubmitApprovalInput = z.infer<typeof SubmitApprovalSchema>;

export const ApproveRejectSchema = z.object({
  notes: z.string().optional(),
});

export type ApproveRejectInput = z.infer<typeof ApproveRejectSchema>;

export const ApproveWithApproverSchema = ApproveRejectSchema.extend({
  approverId: z.string().uuid('Approver ID must be a valid UUID'),
});

export type ApproveWithApproverInput = z.infer<typeof ApproveWithApproverSchema>;
