import { z } from 'zod';

export const upsertFamiliaritySchema = z.object({
  familiarityLevel: z.number().min(0).max(1),
  source: z.enum(['MANUAL', 'ALLOCATION_HISTORY', 'IMPORT']).default('MANUAL'),
});

export type UpsertFamiliarityInput = z.infer<typeof upsertFamiliaritySchema>;
