import { z } from 'zod';

export const calculatorQuerySchema = z.object({
  skipCache: z.coerce.boolean().optional().default(false),
  includeBreakdown: z.coerce.boolean().optional().default(true),
});

export type CalculatorQuery = z.infer<typeof calculatorQuerySchema>;
