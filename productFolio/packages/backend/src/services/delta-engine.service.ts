import { ScenarioStatus, ScenarioType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError, WorkflowError } from '../lib/errors.js';
import { baselineService } from './baseline.service.js';
import type {
  CapacitySnapshotEntry,
  DemandSnapshotEntry,
  AllocationSnapshotEntry,
  CapacityDelta,
  DemandDelta,
  AllocationDelta,
  DeltaResult,
  SkillDemand,
  PriorityRanking,
} from '../types/index.js';

export class DeltaEngineService {
  /**
   * Compute delta between a locked baseline's snapshot and the current live state.
   */
  async computeDelta(scenarioId: string): Promise<DeltaResult> {
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      include: { period: true },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    if (scenario.status !== ScenarioStatus.LOCKED) {
      throw new WorkflowError('Delta computation requires a LOCKED scenario.', scenario.status);
    }

    if (scenario.scenarioType !== ScenarioType.BASELINE) {
      throw new WorkflowError('Delta computation requires a BASELINE scenario.', scenario.scenarioType);
    }

    const snapshot = await baselineService.getSnapshot(scenarioId);

    const capacityDeltas = await this.computeCapacityDeltas(
      snapshot.capacitySnapshot,
      scenario.periodId,
      scenario.period.label
    );

    const demandDeltas = await this.computeDemandDeltas(
      snapshot.demandSnapshot,
      (scenario.priorityRankings as PriorityRanking[] | null) ?? [],
      scenario.periodId,
      scenario.period.label
    );

    const allocationDeltas = await this.computeAllocationDeltas(
      snapshot.allocationSnapshot,
      scenarioId
    );

    const summary = this.buildSummary(
      capacityDeltas,
      demandDeltas,
      allocationDeltas,
      snapshot.summarySnapshot.totalCapacityHours,
      snapshot.summarySnapshot.totalDemandHours
    );

    return {
      scenarioId,
      baselineSnapshotId: snapshot.id,
      periodId: scenario.periodId,
      periodLabel: scenario.period.label,
      computedAt: new Date(),
      capacityDeltas,
      demandDeltas,
      allocationDeltas,
      summary,
    };
  }

  /**
   * Compute delta between a revision scenario and its baseline's snapshot.
   */
  async computeRevisionDelta(revisionScenarioId: string): Promise<DeltaResult> {
    const revision = await prisma.scenario.findUnique({
      where: { id: revisionScenarioId },
      include: { period: true },
    });

    if (!revision) {
      throw new NotFoundError('Scenario', revisionScenarioId);
    }

    if (revision.scenarioType !== ScenarioType.REVISION) {
      throw new WorkflowError('Revision delta requires a REVISION scenario.', revision.scenarioType);
    }

    if (!revision.revisionOfScenarioId) {
      throw new ValidationError('Revision scenario is missing its baseline reference.');
    }

    const snapshot = await baselineService.getSnapshot(revision.revisionOfScenarioId);

    const capacityDeltas = await this.computeCapacityDeltas(
      snapshot.capacitySnapshot,
      revision.periodId,
      revision.period.label
    );

    const demandDeltas = await this.computeDemandDeltas(
      snapshot.demandSnapshot,
      (revision.priorityRankings as PriorityRanking[] | null) ?? [],
      revision.periodId,
      revision.period.label
    );

    // For revision delta, compare revision's allocations against baseline snapshot
    const allocationDeltas = await this.computeAllocationDeltas(
      snapshot.allocationSnapshot,
      revisionScenarioId
    );

    const summary = this.buildSummary(
      capacityDeltas,
      demandDeltas,
      allocationDeltas,
      snapshot.summarySnapshot.totalCapacityHours,
      snapshot.summarySnapshot.totalDemandHours
    );

    return {
      scenarioId: revisionScenarioId,
      baselineSnapshotId: snapshot.id,
      periodId: revision.periodId,
      periodLabel: revision.period.label,
      computedAt: new Date(),
      capacityDeltas,
      demandDeltas,
      allocationDeltas,
      summary,
    };
  }

  /**
   * Compare snapshot capacity entries against current live capacity data.
   */
  private async computeCapacityDeltas(
    snapshotCapacity: CapacitySnapshotEntry[],
    periodId: string,
    periodLabel: string
  ): Promise<CapacityDelta[]> {
    const deltas: CapacityDelta[] = [];

    // Get all employee IDs from snapshot
    const snapshotEmployeeIds = snapshotCapacity.map((c) => c.employeeId);

    // Fetch current live data for these employees
    const employees = await prisma.employee.findMany({
      where: { id: { in: snapshotEmployeeIds } },
      include: {
        skills: true,
        capacityCalendar: {
          where: { periodId },
        },
      },
    });

    const liveEmployeeMap = new Map(employees.map((e) => [e.id, e]));

    for (const snapEntry of snapshotCapacity) {
      const liveEmployee = liveEmployeeMap.get(snapEntry.employeeId);

      // Compute snapshot hours: hoursPerWeek * 13 weeks - hoursAvailable (PTO)
      const snapshotHours = snapEntry.hoursPerWeek * 13 - snapEntry.hoursAvailable;

      if (!liveEmployee) {
        // Employee departed
        for (const skill of snapEntry.skills) {
          deltas.push({
            employeeId: snapEntry.employeeId,
            employeeName: snapEntry.employeeName,
            periodId,
            periodLabel,
            skill,
            snapshotHours,
            liveHours: 0,
            deltaHours: -snapshotHours,
            deltaPct: snapshotHours > 0 ? -100 : 0,
          });
        }
        continue;
      }

      const liveCalendar = liveEmployee.capacityCalendar[0];
      const liveHours = liveEmployee.hoursPerWeek * 13 - (liveCalendar?.hoursAvailable ?? 0);

      const liveSkills = liveEmployee.skills.map((s) => s.name);
      const allSkills = new Set([...snapEntry.skills, ...liveSkills]);

      for (const skill of allSkills) {
        const wasInSnapshot = snapEntry.skills.includes(skill);
        const isLive = liveSkills.includes(skill);

        const skillSnapshotHours = wasInSnapshot ? snapshotHours : 0;
        const skillLiveHours = isLive ? liveHours : 0;
        const deltaHours = skillLiveHours - skillSnapshotHours;
        const deltaPct = skillSnapshotHours > 0
          ? (deltaHours / skillSnapshotHours) * 100
          : skillLiveHours > 0 ? 100 : 0;

        if (deltaHours !== 0) {
          deltas.push({
            employeeId: snapEntry.employeeId,
            employeeName: snapEntry.employeeName,
            periodId,
            periodLabel,
            skill,
            snapshotHours: skillSnapshotHours,
            liveHours: skillLiveHours,
            deltaHours,
            deltaPct: Math.round(deltaPct * 100) / 100,
          });
        }
      }
    }

    return deltas;
  }

  /**
   * Compare snapshot demand entries against current live demand data.
   */
  private async computeDemandDeltas(
    snapshotDemand: DemandSnapshotEntry[],
    liveRankings: PriorityRanking[],
    periodId: string,
    periodLabel: string
  ): Promise<DemandDelta[]> {
    const deltas: DemandDelta[] = [];

    // Build live demand map: initiativeId-skill → hours
    const liveDemandMap = new Map<string, { hours: number; title: string }>();
    const liveInitiativeIds = liveRankings.map((r) => r.initiativeId);

    if (liveInitiativeIds.length > 0) {
      const initiatives = await prisma.initiative.findMany({
        where: { id: { in: liveInitiativeIds } },
        include: {
          scopeItems: {
            include: { periodDistributions: true },
          },
        },
      });

      for (const initiative of initiatives) {
        for (const scopeItem of initiative.scopeItems) {
          const skillDemand = (scopeItem.skillDemand as SkillDemand | null) ?? {};
          const dist = scopeItem.periodDistributions.find((pd) => pd.periodId === periodId);
          const distFactor = dist?.distribution ?? 1.0;

          for (const [skill, hours] of Object.entries(skillDemand)) {
            const demandHours = hours * distFactor;
            if (demandHours > 0) {
              const key = `${initiative.id}-${skill}`;
              const existing = liveDemandMap.get(key);
              liveDemandMap.set(key, {
                hours: (existing?.hours ?? 0) + demandHours,
                title: initiative.title,
              });
            }
          }
        }
      }
    }

    // Build snapshot demand map
    const snapshotDemandMap = new Map<string, { hours: number; title: string; initiativeId: string }>();
    for (const entry of snapshotDemand) {
      const key = `${entry.initiativeId}-${entry.skill}`;
      const existing = snapshotDemandMap.get(key);
      snapshotDemandMap.set(key, {
        hours: (existing?.hours ?? 0) + entry.demandHours,
        title: entry.initiativeTitle,
        initiativeId: entry.initiativeId,
      });
    }

    // Compare: snapshot vs live
    const allKeys = new Set([...snapshotDemandMap.keys(), ...liveDemandMap.keys()]);

    for (const key of allKeys) {
      const [initiativeId, skill] = key.split('-');
      const snapshotEntry = snapshotDemandMap.get(key);
      const liveEntry = liveDemandMap.get(key);

      const snapshotHours = snapshotEntry?.hours ?? 0;
      const liveHours = liveEntry?.hours ?? 0;
      const deltaHours = liveHours - snapshotHours;

      if (deltaHours !== 0) {
        const deltaPct = snapshotHours > 0
          ? (deltaHours / snapshotHours) * 100
          : liveHours > 0 ? 100 : 0;

        deltas.push({
          initiativeId,
          initiativeTitle: liveEntry?.title ?? snapshotEntry?.title ?? 'Unknown',
          periodId,
          periodLabel,
          skill,
          snapshotHours,
          liveHours,
          deltaHours,
          deltaPct: Math.round(deltaPct * 100) / 100,
        });
      }
    }

    return deltas;
  }

  /**
   * Compare snapshot allocations against live allocations for a scenario.
   */
  private async computeAllocationDeltas(
    snapshotAllocations: AllocationSnapshotEntry[],
    liveScenarioId: string
  ): Promise<AllocationDelta[]> {
    const deltas: AllocationDelta[] = [];

    // Load live allocations
    const liveAllocations = await prisma.allocation.findMany({
      where: { scenarioId: liveScenarioId },
      include: {
        employee: true,
        initiative: true,
        allocationPeriods: true,
      },
    });

    // Build composite key maps: employeeId|initiativeId
    const makeKey = (employeeId: string, initiativeId: string | null) =>
      `${employeeId}|${initiativeId ?? 'null'}`;

    const snapshotMap = new Map<string, AllocationSnapshotEntry>();
    for (const entry of snapshotAllocations) {
      snapshotMap.set(makeKey(entry.employeeId, entry.initiativeId), entry);
    }

    const liveMap = new Map<string, typeof liveAllocations[0]>();
    for (const alloc of liveAllocations) {
      liveMap.set(makeKey(alloc.employeeId, alloc.initiativeId), alloc);
    }

    const allKeys = new Set([...snapshotMap.keys(), ...liveMap.keys()]);

    for (const key of allKeys) {
      const snapAlloc = snapshotMap.get(key);
      const liveAlloc = liveMap.get(key);

      if (snapAlloc && !liveAlloc) {
        // Removed
        deltas.push({
          type: 'removed',
          employeeId: snapAlloc.employeeId,
          employeeName: snapAlloc.employeeName,
          initiativeId: snapAlloc.initiativeId,
          initiativeTitle: snapAlloc.initiativeTitle,
          snapshotPercentage: snapAlloc.percentage,
          livePercentage: null,
          snapshotHours: snapAlloc.hoursInPeriod,
          liveHours: null,
          deltaHours: -snapAlloc.hoursInPeriod,
        });
      } else if (!snapAlloc && liveAlloc) {
        // Added
        const liveHours = liveAlloc.allocationPeriods.reduce(
          (sum, ap) => sum + ap.hoursInPeriod, 0
        );
        deltas.push({
          type: 'added',
          employeeId: liveAlloc.employeeId,
          employeeName: liveAlloc.employee.name,
          initiativeId: liveAlloc.initiativeId,
          initiativeTitle: liveAlloc.initiative?.title ?? null,
          snapshotPercentage: null,
          livePercentage: liveAlloc.percentage,
          snapshotHours: null,
          liveHours,
          deltaHours: liveHours,
        });
      } else if (snapAlloc && liveAlloc) {
        // Check for modifications
        const liveHours = liveAlloc.allocationPeriods.reduce(
          (sum, ap) => sum + ap.hoursInPeriod, 0
        );
        const deltaHours = liveHours - snapAlloc.hoursInPeriod;
        const percentageChanged = snapAlloc.percentage !== liveAlloc.percentage;

        if (deltaHours !== 0 || percentageChanged) {
          deltas.push({
            type: 'modified',
            employeeId: snapAlloc.employeeId,
            employeeName: snapAlloc.employeeName,
            initiativeId: snapAlloc.initiativeId,
            initiativeTitle: liveAlloc.initiative?.title ?? snapAlloc.initiativeTitle,
            snapshotPercentage: snapAlloc.percentage,
            livePercentage: liveAlloc.percentage,
            snapshotHours: snapAlloc.hoursInPeriod,
            liveHours,
            deltaHours,
          });
        }
      }
    }

    return deltas;
  }

  private buildSummary(
    capacityDeltas: CapacityDelta[],
    demandDeltas: DemandDelta[],
    allocationDeltas: AllocationDelta[],
    totalSnapshotCapacity: number,
    totalSnapshotDemand: number
  ) {
    const totalCapacityDriftHours = capacityDeltas.reduce((sum, d) => sum + d.deltaHours, 0);
    const totalDemandDriftHours = demandDeltas.reduce((sum, d) => sum + d.deltaHours, 0);

    const totalCapacityDriftPct = totalSnapshotCapacity > 0
      ? Math.round((totalCapacityDriftHours / totalSnapshotCapacity) * 10000) / 100
      : 0;
    const totalDemandDriftPct = totalSnapshotDemand > 0
      ? Math.round((totalDemandDriftHours / totalSnapshotDemand) * 10000) / 100
      : 0;

    return {
      totalCapacityDriftHours,
      totalCapacityDriftPct,
      totalDemandDriftHours,
      totalDemandDriftPct,
      netGapDrift: totalCapacityDriftHours - totalDemandDriftHours,
      allocationsAdded: allocationDeltas.filter((d) => d.type === 'added').length,
      allocationsRemoved: allocationDeltas.filter((d) => d.type === 'removed').length,
      allocationsModified: allocationDeltas.filter((d) => d.type === 'modified').length,
    };
  }
}

export const deltaEngineService = new DeltaEngineService();
