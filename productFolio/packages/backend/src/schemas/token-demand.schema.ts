import { z } from 'zod';

export const upsertTokenDemandSchema = z.object({
  initiativeId: z.string().uuid(),
  skillPoolId: z.string().uuid(),
  tokensP50: z.number().min(0),
  tokensP90: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
});

export type UpsertTokenDemandInput = z.infer<typeof upsertTokenDemandSchema>;

export const bulkUpsertTokenDemandSchema = z.object({
  items: z.array(upsertTokenDemandSchema).min(1).max(500),
});

export type BulkUpsertTokenDemandInput = z.infer<typeof bulkUpsertTokenDemandSchema>;
