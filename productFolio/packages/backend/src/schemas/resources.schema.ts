import { z } from 'zod';

// ============================================================================
// Employee Schemas
// ============================================================================

export const CreateEmployeeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  role: z.string().min(1, 'Role is required').max(255),
  managerId: z.string().uuid('Invalid manager ID').optional().nullable(),
  employmentType: z
    .enum(['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN'])
    .optional()
    .default('FULL_TIME'),
  hoursPerWeek: z.number().positive().optional().default(40),
  activeStart: z.coerce.date().optional(),
  activeEnd: z.coerce.date().optional().nullable(),
});

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;

export const UpdateEmployeeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: z.string().min(1).max(255).optional(),
  managerId: z.string().uuid('Invalid manager ID').optional().nullable(),
  employmentType: z
    .enum(['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN'])
    .optional(),
  hoursPerWeek: z.number().positive().optional(),
  activeStart: z.coerce.date().optional(),
  activeEnd: z.coerce.date().optional().nullable(),
});

export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;

export const EmployeeFiltersSchema = z.object({
  role: z.string().optional(),
  employmentType: z
    .enum(['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN'])
    .optional(),
  managerId: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type EmployeeFiltersInput = z.infer<typeof EmployeeFiltersSchema>;

// ============================================================================
// Skill Schemas
// ============================================================================

export const CreateSkillSchema = z.object({
  name: z.string().min(1, 'Skill name is required').max(255),
  proficiency: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .default(3),
});

export type CreateSkillInput = z.infer<typeof CreateSkillSchema>;

export const UpdateSkillSchema = z.object({
  proficiency: z
    .number()
    .int()
    .min(1, 'Proficiency must be between 1 and 5')
    .max(5, 'Proficiency must be between 1 and 5'),
});

export type UpdateSkillInput = z.infer<typeof UpdateSkillSchema>;

// ============================================================================
// Capacity Schemas
// ============================================================================

export const CapacityEntrySchema = z.object({
  periodId: z.string().uuid(),
  hoursAvailable: z.number().nonnegative('Hours available must be non-negative'),
});

export const UpdateCapacitySchema = z.object({
  entries: z.array(CapacityEntrySchema).min(1, 'At least one capacity entry is required'),
});

export type UpdateCapacityInput = z.infer<typeof UpdateCapacitySchema>;
export type CapacityEntry = z.infer<typeof CapacityEntrySchema>;

// ============================================================================
// Availability Schemas
// ============================================================================

export const AvailabilityQuerySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

export type AvailabilityQueryInput = z.infer<typeof AvailabilityQuerySchema>;

// ============================================================================
// Allocation Summary Schemas
// ============================================================================

export const AllocationSummariesQuerySchema = z.object({
  employeeIds: z.string().min(1, 'At least one employee ID is required'),
  currentQuarterStart: z.coerce.date(),
  currentQuarterEnd: z.coerce.date(),
  nextQuarterStart: z.coerce.date(),
  nextQuarterEnd: z.coerce.date(),
});

export type AllocationSummariesQueryInput = z.infer<typeof AllocationSummariesQuerySchema>;
