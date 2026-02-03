import { z } from 'zod';

// OAuth callback query params
export const jiraCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
});

export type JiraCallbackInput = z.infer<typeof jiraCallbackSchema>;

// Connection ID param
export const connectionIdSchema = z.object({
  connectionId: z.string().uuid('Invalid connection ID'),
});

export type ConnectionIdInput = z.infer<typeof connectionIdSchema>;

// Site ID param
export const siteIdSchema = z.object({
  siteId: z.string().uuid('Invalid site ID'),
});

export type SiteIdInput = z.infer<typeof siteIdSchema>;

// Select sites body
export const selectSitesSchema = z.object({
  siteIds: z.array(z.string().uuid()).min(1, 'At least one site must be selected'),
});

export type SelectSitesInput = z.infer<typeof selectSitesSchema>;

// Select projects body
export const selectProjectsSchema = z.object({
  projects: z.array(
    z.object({
      projectId: z.string().min(1),
      projectKey: z.string().min(1),
      projectName: z.string().min(1),
    })
  ).min(1, 'At least one project must be selected'),
});

export type SelectProjectsInput = z.infer<typeof selectProjectsSchema>;

// Manual sync trigger body
export const triggerSyncSchema = z.object({
  connectionId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  fullResync: z.boolean().optional().default(false),
});

export type TriggerSyncInput = z.infer<typeof triggerSyncSchema>;

// Sync runs query
export const syncRunsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  siteId: z.string().uuid().optional(),
  status: z.enum(['RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL']).optional(),
});

export type SyncRunsQueryInput = z.infer<typeof syncRunsQuerySchema>;
