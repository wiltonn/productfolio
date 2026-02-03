import { z } from 'zod';

// Intake list query params
export const intakeListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  statusCategory: z.string().optional(),
  priorityName: z.string().optional(),
  siteId: z.string().uuid().optional(),
  projectKey: z.string().optional(),
  linked: z.enum(['true', 'false']).optional(),
  itemStatus: z.enum(['ACTIVE', 'ARCHIVED', 'DELETED']).optional().default('ACTIVE'),
  sortBy: z.enum(['jiraUpdatedAt', 'jiraCreatedAt', 'summary', 'priorityName']).optional().default('jiraUpdatedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type IntakeListInput = z.infer<typeof intakeListSchema>;

// Intake item ID param
export const intakeItemIdSchema = z.object({
  id: z.string().uuid('Invalid intake item ID'),
});

export type IntakeItemIdInput = z.infer<typeof intakeItemIdSchema>;
