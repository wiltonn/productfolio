import { z } from 'zod';
import { PlanningMode } from '@prisma/client';

export const updatePlanningModeSchema = z.object({
  mode: z.nativeEnum(PlanningMode),
});

export type UpdatePlanningMode = z.infer<typeof updatePlanningModeSchema>;
