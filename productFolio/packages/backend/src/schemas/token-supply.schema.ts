import { z } from 'zod';

export const upsertTokenSupplySchema = z.object({
  skillPoolId: z.string().uuid(),
  tokens: z.number().min(0),
  notes: z.string().max(1000).optional(),
});

export type UpsertTokenSupplyInput = z.infer<typeof upsertTokenSupplySchema>;
