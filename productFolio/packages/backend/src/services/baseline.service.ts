import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import type {
  CapacitySnapshotEntry,
  DemandSnapshotEntry,
  AllocationSnapshotEntry,
  SnapshotSummary,
  SkillDemand,
  PriorityRanking,
} from '../types/index.js';

export class BaselineService {
  /**
   * Capture an immutable snapshot of a scenario's capacity, demand, and allocations.
   * Called when a BASELINE scenario transitions to LOCKED.
   */
  async captureSnapshot(scenarioId: string) {
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      include: {
        period: true,
        allocations: {
          include: {
            employee: {
              include: {
                skills: true,
                capacityCalendar: true,
              },
            },
            initiative: true,
            allocationPeriods: {
              include: { period: true },
            },
          },
        },
      },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    // Build capacity snapshot from employees with allocations in this scenario
    const employeeMap = new Map<string, typeof scenario.allocations[0]['employee']>();
    for (const alloc of scenario.allocations) {
      if (!employeeMap.has(alloc.employeeId)) {
        employeeMap.set(alloc.employeeId, alloc.employee);
      }
    }

    const capacitySnapshot: CapacitySnapshotEntry[] = [];
    for (const [, employee] of employeeMap) {
      const capacityEntry = employee.capacityCalendar.find(
        (cc) => cc.periodId === scenario.periodId
      );
      capacitySnapshot.push({
        employeeId: employee.id,
        employeeName: employee.name,
        periodId: scenario.periodId,
        periodLabel: scenario.period.label,
        hoursAvailable: capacityEntry?.hoursAvailable ?? 0,
        hoursPerWeek: employee.hoursPerWeek,
        skills: employee.skills.map((s) => s.name),
      });
    }

    // Build demand snapshot from priority rankings
    const rankings = (scenario.priorityRankings as PriorityRanking[] | null) ?? [];
    const initiativeIds = rankings.map((r) => r.initiativeId);

    const demandSnapshot: DemandSnapshotEntry[] = [];
    if (initiativeIds.length > 0) {
      const initiatives = await prisma.initiative.findMany({
        where: { id: { in: initiativeIds } },
        include: {
          scopeItems: {
            include: { periodDistributions: true },
          },
        },
      });

      for (const initiative of initiatives) {
        for (const scopeItem of initiative.scopeItems) {
          const skillDemand = (scopeItem.skillDemand as SkillDemand | null) ?? {};
          const distribution = scopeItem.periodDistributions.find(
            (pd) => pd.periodId === scenario.periodId
          );
          const distFactor = distribution?.distribution ?? 1.0;

          for (const [skill, hours] of Object.entries(skillDemand)) {
            const demandHours = hours * distFactor;
            if (demandHours > 0) {
              demandSnapshot.push({
                initiativeId: initiative.id,
                initiativeTitle: initiative.title,
                periodId: scenario.periodId,
                periodLabel: scenario.period.label,
                skill,
                demandHours,
              });
            }
          }
        }
      }
    }

    // Build allocation snapshot
    const allocationSnapshot: AllocationSnapshotEntry[] = scenario.allocations.map((alloc) => {
      const totalHoursInPeriod = alloc.allocationPeriods.reduce(
        (sum, ap) => sum + ap.hoursInPeriod,
        0
      );
      const avgRampModifier = alloc.allocationPeriods.length > 0
        ? alloc.allocationPeriods.reduce((sum, ap) => sum + (ap.rampModifier ?? 1.0), 0) / alloc.allocationPeriods.length
        : 1.0;
      return {
        allocationId: alloc.id,
        employeeId: alloc.employeeId,
        employeeName: alloc.employee.name,
        initiativeId: alloc.initiativeId,
        initiativeTitle: alloc.initiative?.title ?? null,
        allocationType: alloc.allocationType,
        startDate: alloc.startDate.toISOString(),
        endDate: alloc.endDate.toISOString(),
        percentage: alloc.percentage,
        hoursInPeriod: totalHoursInPeriod,
        rampModifier: avgRampModifier,
      };
    });

    // Build summary
    const totalCapacityHours = capacitySnapshot.reduce(
      (sum, c) => sum + (c.hoursPerWeek * 13 - c.hoursAvailable),
      0
    );
    const totalDemandHours = demandSnapshot.reduce((sum, d) => sum + d.demandHours, 0);
    const uniqueEmployees = new Set(capacitySnapshot.map((c) => c.employeeId));
    const uniqueInitiatives = new Set(
      allocationSnapshot.filter((a) => a.initiativeId).map((a) => a.initiativeId)
    );

    const summarySnapshot: SnapshotSummary = {
      totalCapacityHours,
      totalDemandHours,
      overallGap: totalCapacityHours - totalDemandHours,
      totalAllocations: allocationSnapshot.length,
      employeeCount: uniqueEmployees.size,
      initiativeCount: uniqueInitiatives.size,
    };

    // Create the snapshot in a transaction
    const snapshot = await prisma.baselineSnapshot.create({
      data: {
        scenarioId,
        capacitySnapshot: capacitySnapshot as unknown as Prisma.InputJsonValue,
        demandSnapshot: demandSnapshot as unknown as Prisma.InputJsonValue,
        allocationSnapshot: allocationSnapshot as unknown as Prisma.InputJsonValue,
        summarySnapshot: summarySnapshot as unknown as Prisma.InputJsonValue,
      },
    });

    return snapshot;
  }

  /**
   * Get the baseline snapshot for a scenario.
   */
  async getSnapshot(scenarioId: string) {
    const snapshot = await prisma.baselineSnapshot.findUnique({
      where: { scenarioId },
    });

    if (!snapshot) {
      throw new NotFoundError('BaselineSnapshot', scenarioId);
    }

    return {
      id: snapshot.id,
      scenarioId: snapshot.scenarioId,
      snapshotDate: snapshot.snapshotDate,
      capacitySnapshot: snapshot.capacitySnapshot as unknown as CapacitySnapshotEntry[],
      demandSnapshot: snapshot.demandSnapshot as unknown as DemandSnapshotEntry[],
      allocationSnapshot: snapshot.allocationSnapshot as unknown as AllocationSnapshotEntry[],
      summarySnapshot: snapshot.summarySnapshot as unknown as SnapshotSummary,
      createdAt: snapshot.createdAt,
    };
  }
}

export const baselineService = new BaselineService();
