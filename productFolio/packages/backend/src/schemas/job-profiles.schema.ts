import { z } from 'zod';

const JobProfileSkillSchema = z.object({
  skillName: z.string().min(1, 'Skill name is required').max(100),
  expectedProficiency: z.number().int().min(1).max(5).default(3),
});

const CostBandSchema = z.object({
  annualCostMin: z.number().min(0).optional().nullable(),
  annualCostMax: z.number().min(0).optional().nullable(),
  hourlyRate: z.number().min(0).optional().nullable(),
  currency: z.string().length(3).default('USD'),
  effectiveDate: z.coerce.date(),
});

export const CreateJobProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  level: z.string().max(100).optional().nullable(),
  band: z.string().max(100).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  isActive: z.boolean().default(true),
  skills: z.array(JobProfileSkillSchema).optional().default([]),
  costBand: CostBandSchema.optional().nullable(),
});

export type CreateJobProfileInput = z.infer<typeof CreateJobProfileSchema>;

export const UpdateJobProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  level: z.string().max(100).optional().nullable(),
  band: z.string().max(100).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  isActive: z.boolean().optional(),
  skills: z.array(JobProfileSkillSchema).optional(),
  costBand: CostBandSchema.optional().nullable(),
});

export type UpdateJobProfileInput = z.infer<typeof UpdateJobProfileSchema>;

export const JobProfileFiltersSchema = z.object({
  search: z.string().max(255).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type JobProfileFiltersInput = z.infer<typeof JobProfileFiltersSchema>;
