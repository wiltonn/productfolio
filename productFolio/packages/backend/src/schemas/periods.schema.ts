import { z } from 'zod';

export const PeriodTypeEnum = z.enum(['WEEK', 'MONTH', 'QUARTER']);

export const periodFiltersSchema = z.object({
  type: PeriodTypeEnum.optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type PeriodFilters = z.infer<typeof periodFiltersSchema>;

export const seedPeriodsSchema = z.object({
  startYear: z.number().int().min(2000).max(2100),
  endYear: z.number().int().min(2000).max(2100),
}).refine(
  (data) => data.startYear <= data.endYear,
  { message: 'startYear must be <= endYear', path: ['endYear'] }
);

export type SeedPeriodsInput = z.infer<typeof seedPeriodsSchema>;

export const periodDistributionEntrySchema = z.object({
  periodId: z.string().uuid(),
  distribution: z.number().min(0).max(1),
});

export type PeriodDistributionEntry = z.infer<typeof periodDistributionEntrySchema>;
