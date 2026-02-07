import { z } from 'zod';

export const UpdateFeatureFlagSchema = z.object({
  enabled: z.boolean().optional(),
  description: z.string().max(1000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type UpdateFeatureFlagInput = z.infer<typeof UpdateFeatureFlagSchema>;
