import { InitiativeStatus, EmploymentType, UserRole } from '@prisma/client';

// Re-export Prisma enums for convenience
export { InitiativeStatus, EmploymentType, UserRole };

// Pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Initiative types
export interface InitiativeFilters {
  status?: InitiativeStatus;
  businessOwnerId?: string;
  productOwnerId?: string;
  targetQuarter?: string;
  search?: string;
}

export interface StatusTransition {
  from: InitiativeStatus;
  to: InitiativeStatus;
}

// Skill demand and quarter distribution types (JSON fields)
export interface SkillDemand {
  [skillName: string]: number;
}

export interface QuarterDistribution {
  [quarter: string]: number; // quarter format: "2024-Q1", value: percentage (0-1)
}

// Capacity types
export interface AvailabilityResult {
  employeeId: string;
  period: string;
  baseHours: number;
  allocatedHours: number;
  ptoHours: number;
  availableHours: number;
}

export interface CapacityEntry {
  period: Date;
  hoursAvailable: number;
}

// Scenario types
export interface PriorityRanking {
  initiativeId: string;
  rank: number;
}

export interface CapacityDemandResult {
  quarter: string;
  skill: string;
  demand: number;
  capacity: number;
  gap: number;
}

export interface ScenarioComparison {
  scenarioId: string;
  scenarioName: string;
  totalAllocatedHours: number;
  capacityGapsBySkill: Record<string, number>;
  priorities: PriorityRanking[];
}

// CSV Import/Export types
export interface CsvImportResult {
  success: number;
  failed: number;
  errors: Array<{
    row: number;
    message: string;
  }>;
}

export interface CsvExportOptions {
  filters?: InitiativeFilters;
  fields?: string[];
}

// Approval types
export interface ApprovalHistoryEntry {
  id: string;
  version: number;
  approverId: string;
  approverName: string;
  notes: string | null;
  approvedAt: Date;
}

// Bulk operation types
export interface BulkUpdateResult {
  updated: number;
  failed: number;
  errors: Array<{
    id: string;
    message: string;
  }>;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

// Scenario Calculator Types
export interface DemandBySkillQuarter {
  quarter: string;
  skill: string;
  totalHours: number;
  initiativeBreakdown: Array<{
    initiativeId: string;
    initiativeTitle: string;
    hours: number;
    rank: number;
  }>;
}

export interface CapacityBySkillQuarter {
  quarter: string;
  skill: string;
  totalHours: number;
  effectiveHours: number;
  employeeBreakdown: Array<{
    employeeId: string;
    employeeName: string;
    baseHours: number;
    proficiency: number;
    effectiveHours: number;
    allocationPercentage: number;
  }>;
}

export interface Shortage {
  quarter: string;
  skill: string;
  demandHours: number;
  capacityHours: number;
  shortageHours: number;
  shortagePercentage: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedInitiatives: Array<{
    initiativeId: string;
    initiativeTitle: string;
    demandHours: number;
  }>;
}

export interface Overallocation {
  employeeId: string;
  employeeName: string;
  quarter: string;
  totalAllocationPercentage: number;
  overallocationPercentage: number;
  allocations: Array<{
    initiativeId: string | null;
    initiativeTitle: string | null;
    percentage: number;
    startDate: Date;
    endDate: Date;
  }>;
}

export interface SkillMismatch {
  employeeId: string;
  employeeName: string;
  initiativeId: string;
  initiativeTitle: string;
  requiredSkills: string[];
  employeeSkills: string[];
  missingSkills: string[];
}

export interface ScenarioAssumptions {
  allocationCapPercentage?: number;
  bufferPercentage?: number;
  proficiencyWeightEnabled?: boolean;
  includeContractors?: boolean;
  hoursPerQuarter?: number;
}

export interface CalculatorResult {
  scenarioId: string;
  scenarioName: string;
  quarterRange: string;
  calculatedAt: Date;
  demandBySkillQuarter: DemandBySkillQuarter[];
  capacityBySkillQuarter: CapacityBySkillQuarter[];
  gapAnalysis: Array<{
    quarter: string;
    skill: string;
    demandHours: number;
    capacityHours: number;
    gap: number;
    utilizationPercentage: number;
  }>;
  issues: {
    shortages: Shortage[];
    overallocations: Overallocation[];
    skillMismatches: SkillMismatch[];
  };
  summary: {
    totalDemandHours: number;
    totalCapacityHours: number;
    overallGap: number;
    overallUtilization: number;
    totalShortages: number;
    totalOverallocations: number;
    totalSkillMismatches: number;
    quarterCount: number;
    skillCount: number;
    employeeCount: number;
    initiativeCount: number;
  };
  cacheHit: boolean;
  cacheExpiry?: Date;
}

export interface CalculatorOptions {
  skipCache?: boolean;
  includeBreakdown?: boolean;
}
