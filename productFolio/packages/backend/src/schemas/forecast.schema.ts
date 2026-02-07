import { z } from 'zod';

// POST /api/forecast/scope-based
export const ScopeBasedForecastSchema = z.object({
  scenarioId: z.string().uuid(),
  initiativeIds: z.array(z.string().uuid()).min(1),
  simulationCount: z.number().int().min(100).max(10000).optional(),
  confidenceLevels: z.array(z.number().min(1).max(99)).optional(),
  orgNodeId: z.string().uuid().optional(),
});

export type ScopeBasedForecastInput = z.infer<typeof ScopeBasedForecastSchema>;

// POST /api/forecast/empirical
export const EmpiricalForecastSchema = z.object({
  initiativeIds: z.array(z.string().uuid()).min(1),
  simulationCount: z.number().int().min(100).max(10000).optional(),
  confidenceLevels: z.array(z.number().min(1).max(99)).optional(),
});

export type EmpiricalForecastInput = z.infer<typeof EmpiricalForecastSchema>;

// GET /api/forecast/data-quality
export const DataQualityQuerySchema = z.object({
  scenarioId: z.string().uuid().optional(),
  initiativeIds: z.string().optional(), // comma-separated UUIDs in query string
});

export type DataQualityQueryInput = z.infer<typeof DataQualityQuerySchema>;

// GET /api/forecast/runs
export const ForecastRunsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  scenarioId: z.string().uuid().optional(),
  mode: z.enum(['SCOPE_BASED', 'EMPIRICAL']).optional(),
});

export type ForecastRunsQueryInput = z.infer<typeof ForecastRunsQuerySchema>;
