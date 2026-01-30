import { InitiativeStatus, EmploymentType, UserRole, PeriodType, AllocationType } from '@prisma/client';

// Re-export Prisma enums for convenience
export { InitiativeStatus, EmploymentType, UserRole, PeriodType, AllocationType };

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

// Period types
export interface PeriodInfo {
  periodId: string;
  periodLabel: string;
  periodType: PeriodType;
  startDate: Date;
  endDate: Date;
}

// Initiative types
export interface InitiativeFilters {
  status?: InitiativeStatus;
  businessOwnerId?: string;
  productOwnerId?: string;
  targetPeriodId?: string;
  search?: string;
}

export interface StatusTransition {
  from: InitiativeStatus;
  to: InitiativeStatus;
}

// Skill demand types (JSON fields)
export interface SkillDemand {
  [skillName: string]: number;
}

// Capacity types
export interface AvailabilityResult {
  employeeId: string;
  periodId: string;
  periodLabel: string;
  baseHours: number;
  allocatedHours: number;
  ptoHours: number;
  availableHours: number;
}

export interface CapacityEntry {
  periodId: string;
  hoursAvailable: number;
}

// Scenario types
export interface PriorityRanking {
  initiativeId: string;
  rank: number;
}

export interface CapacityDemandResult {
  periodId: string;
  periodLabel: string;
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
export interface DemandBySkillPeriod {
  periodId: string;
  periodLabel: string;
  skill: string;
  totalHours: number;
  initiativeBreakdown: Array<{
    initiativeId: string;
    initiativeTitle: string;
    hours: number;
    rank: number;
  }>;
}

export interface CapacityBySkillPeriod {
  periodId: string;
  periodLabel: string;
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
  periodId: string;
  periodLabel: string;
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
  periodId: string;
  periodLabel: string;
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
  hoursPerPeriod?: number;
}

export interface CalculatorResult {
  scenarioId: string;
  scenarioName: string;
  periods: PeriodInfo[];
  calculatedAt: Date;
  demandBySkillPeriod: DemandBySkillPeriod[];
  capacityBySkillPeriod: CapacityBySkillPeriod[];
  gapAnalysis: Array<{
    periodId: string;
    periodLabel: string;
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
    periodCount: number;
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

// Auto-Allocate Types
export interface ProposedAllocation {
  employeeId: string;
  employeeName: string;
  initiativeId: string;
  initiativeTitle: string;
  skill: string;
  percentage: number;
  hours: number;
  startDate: Date;
  endDate: Date;
}

export interface InitiativeCoverage {
  initiativeId: string;
  initiativeTitle: string;
  rank: number;
  skills: Array<{
    skill: string;
    demandHours: number;
    allocatedHours: number;
    coveragePercent: number;
  }>;
  overallCoveragePercent: number;
}

export interface AutoAllocateResult {
  proposedAllocations: ProposedAllocation[];
  coverage: InitiativeCoverage[];
  warnings: string[];
  summary: {
    totalAllocations: number;
    employeesUsed: number;
    initiativesCovered: number;
    totalHoursAllocated: number;
  };
}

export interface AutoAllocateOptions {
  maxAllocationPercentage?: number;
}
