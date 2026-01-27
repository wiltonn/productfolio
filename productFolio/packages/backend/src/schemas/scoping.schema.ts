import { z } from 'zod';

// Skill Demand: { skillName: number }
const skillDemandSchema = z.record(z.string(), z.number()).optional();

// Quarter Distribution: { quarter: number (0-1) }
const quarterDistributionSchema = z.record(z.string(), z.number().min(0).max(1)).optional();

export const CreateScopeItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  skillDemand: skillDemandSchema,
  estimateP50: z.number().positive('Estimate P50 must be positive').optional(),
  estimateP90: z.number().positive('Estimate P90 must be positive').optional(),
  quarterDistribution: quarterDistributionSchema,
});

export type CreateScopeItemInput = z.infer<typeof CreateScopeItemSchema>;

export const UpdateScopeItemSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  skillDemand: skillDemandSchema,
  estimateP50: z.number().positive().optional(),
  estimateP90: z.number().positive().optional(),
  quarterDistribution: quarterDistributionSchema,
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
