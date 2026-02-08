import { z } from 'zod';

export const updateTenantConfigSchema = z.object({
  tier: z.enum(['starter', 'growth', 'enterprise']).optional(),
  seatLimit: z.number().int().min(1).optional(),
});

export const entitlementEventQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  eventName: z.string().optional(),
  userId: z.string().uuid().optional(),
});

export type UpdateTenantConfigInput = z.infer<typeof updateTenantConfigSchema>;
export type EntitlementEventQuery = z.infer<typeof entitlementEventQuerySchema>;
