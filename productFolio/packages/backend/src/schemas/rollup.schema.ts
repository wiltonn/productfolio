import { z } from 'zod';

export const RollupParamsSchema = z.object({
  id: z.string().uuid(),
});

export type RollupParams = z.infer<typeof RollupParamsSchema>;
