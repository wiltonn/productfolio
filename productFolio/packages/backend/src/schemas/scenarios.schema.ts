import { z } from 'zod';

// Quarter range format: "YYYY-QN:YYYY-QN" (e.g., "2024-Q1:2024-Q4")
const quarterRangeRegex = /^\d{4}-Q[1-4]:\d{4}-Q[1-4]$/;

// UUID validation
const uuidSchema = z.string().uuid();

// Priority ranking schema
export const priorityRankingSchema = z.object({
  initiativeId: uuidSchema,
  rank: z.number().int().positive(),
});

export type PriorityRanking = z.infer<typeof priorityRankingSchema>;

// Create Scenario Schema
export const createScenarioSchema = z.object({
  name: z.string().min(1).max(255),
  quarterRange: z.string().regex(quarterRangeRegex, 'Invalid quarter range format. Expected YYYY-QN:YYYY-QN'),
  assumptions: z.record(z.unknown()).optional(),
  priorityRankings: z.array(priorityRankingSchema).optional(),
});

export type CreateScenario = z.infer<typeof createScenarioSchema>;

// Update Scenario Schema
export const updateScenarioSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  quarterRange: z.string().regex(quarterRangeRegex, 'Invalid quarter range format. Expected YYYY-QN:YYYY-QN').optional(),
  assumptions: z.record(z.unknown()).optional(),
  priorityRankings: z.array(priorityRankingSchema).optional(),
});

export type UpdateScenario = z.infer<typeof updateScenarioSchema>;

// Update Priorities Schema
export const updatePrioritiesSchema = z.object({
  priorities: z.array(priorityRankingSchema).min(1),
});

export type UpdatePriorities = z.infer<typeof updatePrioritiesSchema>;

// Create Allocation Schema
export const createAllocationSchema = z.object({
  employeeId: uuidSchema,
  initiativeId: uuidSchema.optional().nullable(),
  startDate: z.string().or(z.date()).pipe(z.coerce.date()),
  endDate: z.string().or(z.date()).pipe(z.coerce.date()),
  percentage: z.number().min(0).max(100).default(100),
}).refine(
  (data) => data.startDate <= data.endDate,
  {
    message: 'startDate must be before or equal to endDate',
    path: ['endDate'],
  }
);

export type CreateAllocation = z.infer<typeof createAllocationSchema>;

// Update Allocation Schema
export const updateAllocationSchema = z.object({
  initiativeId: uuidSchema.optional().nullable(),
  startDate: z.string().or(z.date()).pipe(z.coerce.date()).optional(),
  endDate: z.string().or(z.date()).pipe(z.coerce.date()).optional(),
  percentage: z.number().min(0).max(100).optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  {
    message: 'startDate must be before or equal to endDate',
    path: ['endDate'],
  }
);

export type UpdateAllocation = z.infer<typeof updateAllocationSchema>;

// Compare Query Schema
export const compareQuerySchema = z.object({
  scenarioIds: z.array(uuidSchema).min(2),
});

export type CompareQuery = z.infer<typeof compareQuerySchema>;

// Pagination Schema
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export type Pagination = z.infer<typeof paginationSchema>;
