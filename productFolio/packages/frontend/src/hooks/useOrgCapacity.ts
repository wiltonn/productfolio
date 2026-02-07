import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

// ============================================================================
// Types
// ============================================================================

export interface PeriodInfo {
  periodId: string;
  periodLabel: string;
  periodType: string;
  startDate: string;
  endDate: string;
}

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
    rampModifier?: number;
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

export interface GapAnalysisEntry {
  periodId: string;
  periodLabel: string;
  skill: string;
  demandHours: number;
  capacityHours: number;
  gap: number;
  utilizationPercentage: number;
}

export interface OrgCapacityResult {
  scenarioId: string;
  scenarioName: string;
  periods: PeriodInfo[];
  calculatedAt: string;
  demandBySkillPeriod: DemandBySkillPeriod[];
  capacityBySkillPeriod: CapacityBySkillPeriod[];
  gapAnalysis: GapAnalysisEntry[];
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
    rampCostHours: number;
  };
  cacheHit: boolean;
  cacheExpiry?: string;
}

export interface OrgNodeEmployee {
  id: string;
  name: string;
  email: string;
  role: string;
  skills: Array<{ name: string; proficiency: number }>;
  jobProfile: { id: string; name: string; level: string } | null;
  allocations: Array<{
    id: string;
    scenarioId: string;
    initiativeId: string;
    percentage: number;
    startDate: string;
    endDate: string;
  }>;
}

export interface OrgNodeEmployeesResponse {
  orgNodeId: string;
  employeeCount: number;
  employees: OrgNodeEmployee[];
}

// ============================================================================
// Query Keys
// ============================================================================

export const orgCapacityKeys = {
  all: ['orgCapacity'] as const,
  capacity: (nodeId: string, scenarioId: string) =>
    [...orgCapacityKeys.all, 'capacity', nodeId, scenarioId] as const,
  employees: (nodeId: string) =>
    [...orgCapacityKeys.all, 'employees', nodeId] as const,
};

// ============================================================================
// Queries
// ============================================================================

export function useOrgCapacity(nodeId: string, scenarioId: string) {
  return useQuery({
    queryKey: orgCapacityKeys.capacity(nodeId, scenarioId),
    queryFn: () =>
      api.get<OrgCapacityResult>(
        `/org/nodes/${nodeId}/capacity?scenarioId=${scenarioId}`,
      ),
    enabled: !!nodeId && !!scenarioId,
    staleTime: 30_000,
  });
}

export function useOrgNodeEmployees(nodeId: string) {
  return useQuery({
    queryKey: orgCapacityKeys.employees(nodeId),
    queryFn: () =>
      api.get<OrgNodeEmployeesResponse>(`/org/nodes/${nodeId}/employees`),
    enabled: !!nodeId,
    staleTime: 30_000,
  });
}
