import { z } from 'zod';

const uuidSchema = z
  .string()
  .uuid('Must be a valid UUID')
  .describe('UUID');

export const CreatePortfolioAreaSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be 255 characters or less'),
});

export type CreatePortfolioAreaInput = z.infer<typeof CreatePortfolioAreaSchema>;

export const UpdatePortfolioAreaSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be 255 characters or less')
    .optional(),
});

export type UpdatePortfolioAreaInput = z.infer<typeof UpdatePortfolioAreaSchema>;

export const PortfolioAreaFiltersSchema = z.object({
  search: z.string().max(255).optional(),
  page: z
    .number()
    .int()
    .min(1)
    .default(1),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50),
});

export type PortfolioAreaFiltersInput = z.infer<typeof PortfolioAreaFiltersSchema>;
