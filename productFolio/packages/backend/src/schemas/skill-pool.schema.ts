import { z } from 'zod';

export const createSkillPoolSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
});

export type CreateSkillPoolInput = z.infer<typeof createSkillPoolSchema>;

export const updateSkillPoolSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateSkillPoolInput = z.infer<typeof updateSkillPoolSchema>;

export const skillPoolFiltersSchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type SkillPoolFiltersInput = z.infer<typeof skillPoolFiltersSchema>;
