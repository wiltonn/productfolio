import { z } from 'zod';

const uuidSchema = z.string().uuid();

// Create Revision Schema
export const createRevisionSchema = z.object({
  reason: z.enum(['CRITICAL', 'COMPLIANCE', 'PRODUCTION_OUTAGE', 'EXEC_DIRECTIVE']),
  name: z.string().min(1).max(255).optional(),
  changeLog: z.string().max(2000).optional(),
});

export type CreateRevision = z.infer<typeof createRevisionSchema>;

// Freeze Policy Schema
export const freezePolicySchema = z.object({
  periodId: uuidSchema,
  changeFreezeDate: z.string().or(z.date()).pipe(z.coerce.date()),
});

export type CreateFreezePolicy = z.infer<typeof freezePolicySchema>;

// Update Freeze Policy Schema
export const updateFreezePolicySchema = z.object({
  changeFreezeDate: z.string().or(z.date()).pipe(z.coerce.date()),
});

export type UpdateFreezePolicy = z.infer<typeof updateFreezePolicySchema>;

// Drift Threshold Schema
export const driftThresholdSchema = z.object({
  capacityThresholdPct: z.number().min(0).max(100).default(5),
  demandThresholdPct: z.number().min(0).max(100).default(10),
});

export type UpdateDriftThreshold = z.infer<typeof driftThresholdSchema>;

// Acknowledge Drift Alerts Schema
export const acknowledgeDriftAlertSchema = z.object({
  alertIds: z.array(uuidSchema).min(1),
});

export type AcknowledgeDriftAlerts = z.infer<typeof acknowledgeDriftAlertSchema>;

// Resolve Drift Alerts Schema
export const resolveDriftAlertSchema = z.object({
  alertIds: z.array(uuidSchema).min(1),
});

export type ResolveDriftAlerts = z.infer<typeof resolveDriftAlertSchema>;

// Manual Drift Check Schema
export const driftCheckSchema = z.object({
  scenarioId: uuidSchema.optional(),
});

export type DriftCheckRequest = z.infer<typeof driftCheckSchema>;
