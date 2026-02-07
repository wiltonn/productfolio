import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';

interface EmployeeBudgetLine {
  employeeId: string;
  employeeName: string;
  jobProfileId: string | null;
  jobProfileName: string | null;
  hourlyRate: number | null;
  allocatedHours: number;
  estimatedCost: number | null;
}

interface InitiativeBudget {
  initiativeId: string;
  initiativeTitle: string;
  totalHours: number;
  totalEstimatedCost: number;
  employees: EmployeeBudgetLine[];
}

interface BudgetReportResult {
  scenarioId: string;
  scenarioName: string;
  initiatives: InitiativeBudget[];
  unallocatedCost: {
    totalHours: number;
    totalEstimatedCost: number;
    employees: EmployeeBudgetLine[];
  };
  summary: {
    totalAllocatedHours: number;
    totalEstimatedCost: number;
    employeesWithCostBand: number;
    employeesWithoutCostBand: number;
  };
}

export async function generateBudgetReport(scenarioId: string): Promise<BudgetReportResult> {
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: {
      allocations: {
        include: {
          employee: {
            include: {
              jobProfile: {
                include: { costBand: true },
              },
            },
          },
          initiative: { select: { id: true, title: true } },
          allocationPeriods: true,
        },
      },
    },
  });

  if (!scenario) {
    throw new NotFoundError('Scenario', scenarioId);
  }

  // Group allocations by initiative
  const initiativeMap = new Map<string, {
    title: string;
    employees: EmployeeBudgetLine[];
  }>();
  const unallocatedEmployees: EmployeeBudgetLine[] = [];
  let employeesWithCostBand = new Set<string>();
  let employeesWithoutCostBand = new Set<string>();

  for (const allocation of scenario.allocations) {
    const totalHours = allocation.allocationPeriods.reduce(
      (sum, ap) => sum + ap.hoursInPeriod,
      0
    );

    const hourlyRate = allocation.employee.jobProfile?.costBand?.hourlyRate ?? null;
    const estimatedCost = hourlyRate !== null ? hourlyRate * totalHours : null;

    if (hourlyRate !== null) {
      employeesWithCostBand.add(allocation.employeeId);
    } else {
      employeesWithoutCostBand.add(allocation.employeeId);
    }

    const line: EmployeeBudgetLine = {
      employeeId: allocation.employeeId,
      employeeName: allocation.employee.name,
      jobProfileId: allocation.employee.jobProfile?.id ?? null,
      jobProfileName: allocation.employee.jobProfile?.name ?? null,
      hourlyRate,
      allocatedHours: totalHours,
      estimatedCost,
    };

    if (allocation.initiativeId && allocation.initiative) {
      if (!initiativeMap.has(allocation.initiativeId)) {
        initiativeMap.set(allocation.initiativeId, {
          title: allocation.initiative.title,
          employees: [],
        });
      }
      initiativeMap.get(allocation.initiativeId)!.employees.push(line);
    } else {
      unallocatedEmployees.push(line);
    }
  }

  const initiatives: InitiativeBudget[] = [];
  for (const [initiativeId, data] of initiativeMap) {
    const totalHours = data.employees.reduce((s, e) => s + e.allocatedHours, 0);
    const totalEstimatedCost = data.employees.reduce(
      (s, e) => s + (e.estimatedCost ?? 0),
      0
    );
    initiatives.push({
      initiativeId,
      initiativeTitle: data.title,
      totalHours,
      totalEstimatedCost,
      employees: data.employees,
    });
  }

  // Sort by cost descending
  initiatives.sort((a, b) => b.totalEstimatedCost - a.totalEstimatedCost);

  const unallocatedTotalHours = unallocatedEmployees.reduce(
    (s, e) => s + e.allocatedHours, 0
  );
  const unallocatedTotalCost = unallocatedEmployees.reduce(
    (s, e) => s + (e.estimatedCost ?? 0), 0
  );

  const totalAllocatedHours = initiatives.reduce((s, i) => s + i.totalHours, 0) + unallocatedTotalHours;
  const totalEstimatedCost = initiatives.reduce((s, i) => s + i.totalEstimatedCost, 0) + unallocatedTotalCost;

  return {
    scenarioId,
    scenarioName: scenario.name,
    initiatives,
    unallocatedCost: {
      totalHours: unallocatedTotalHours,
      totalEstimatedCost: unallocatedTotalCost,
      employees: unallocatedEmployees,
    },
    summary: {
      totalAllocatedHours,
      totalEstimatedCost,
      employeesWithCostBand: employeesWithCostBand.size,
      employeesWithoutCostBand: employeesWithoutCostBand.size,
    },
  };
}
