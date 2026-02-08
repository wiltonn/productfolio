import { z } from 'zod';

export const UpdateAuthoritySchema = z.object({
  description: z.string().min(1).optional(),
  deprecated: z.boolean().optional(),
});

export type UpdateAuthorityInput = z.infer<typeof UpdateAuthoritySchema>;

export const AuditLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  authorityCode: z.string().optional(),
});

export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
