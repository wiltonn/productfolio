import { InitiativeOrigin, IntakeRequestStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';

export type PlanningState = 'PLANNED' | 'UNPLANNED' | 'PRIMARY_PLANNED';

export type IntakePipelineState =
  | 'APPROVED_UNCONVERTED'
  | 'CONVERTED_UNPLANNED'
  | 'CONVERTED_PLANNED';

export interface PipelineStats {
  period: { id: string; label: string } | null;
  pipeline: {
    approvedUnconverted: number;
    convertedUnplanned: number;
    convertedPlanned: number;
    nonIntakePlanned: number;
    totalPlanned: number;
  };
  coverage: {
    intakeCoveragePct: number;
    intakeLeakagePct: number;
    conversionRatePct: number;
    planningCoveragePct: number;
  };
}

/**
 * Determine if an initiative is planned for a given period.
 * An initiative is "Planned" if it has at least one Allocation
 * in any Scenario for that period.
 */
export async function getInitiativePlanningState(
  initiativeId: string,
  periodId: string
): Promise<PlanningState> {
  // Check if any allocation exists in any scenario for this period
  const allocation = await prisma.allocation.findFirst({
    where: {
      initiativeId,
      scenario: { periodId },
    },
    include: {
      scenario: { select: { isPrimary: true } },
    },
  });

  if (!allocation) {
    return 'UNPLANNED';
  }

  // Check if allocated in the primary scenario
  if (allocation.scenario.isPrimary) {
    return 'PRIMARY_PLANNED';
  }

  // Check if there's an allocation in the primary scenario specifically
  const primaryAllocation = await prisma.allocation.findFirst({
    where: {
      initiativeId,
      scenario: { periodId, isPrimary: true },
    },
  });

  return primaryAllocation ? 'PRIMARY_PLANNED' : 'PLANNED';
}

/**
 * Determine the pipeline state of an intake request for a given period.
 */
export async function getIntakePipelineState(
  intakeRequestId: string,
  periodId: string
): Promise<IntakePipelineState> {
  const intakeRequest = await prisma.intakeRequest.findUnique({
    where: { id: intakeRequestId },
    select: {
      status: true,
      initiativeId: true,
    },
  });

  if (!intakeRequest) {
    throw new NotFoundError('IntakeRequest', intakeRequestId);
  }

  if (intakeRequest.status === IntakeRequestStatus.APPROVED && !intakeRequest.initiativeId) {
    return 'APPROVED_UNCONVERTED';
  }

  if (intakeRequest.initiativeId) {
    const state = await getInitiativePlanningState(intakeRequest.initiativeId, periodId);
    return state === 'UNPLANNED' ? 'CONVERTED_UNPLANNED' : 'CONVERTED_PLANNED';
  }

  return 'APPROVED_UNCONVERTED';
}

/**
 * Get comprehensive pipeline statistics for a given period.
 */
export async function getPipelineStats(periodId?: string): Promise<PipelineStats> {
  let period: { id: string; label: string } | null = null;

  if (periodId) {
    const p = await prisma.period.findUnique({
      where: { id: periodId },
      select: { id: true, label: true },
    });
    if (!p) {
      throw new NotFoundError('Period', periodId);
    }
    period = p;
  }

  // 1. Approved but unconverted
  const approvedUnconverted = await prisma.intakeRequest.count({
    where: {
      status: IntakeRequestStatus.APPROVED,
      initiativeId: null,
    },
  });

  // 2. Get all converted intake requests with their initiative IDs
  const convertedRequests = await prisma.intakeRequest.findMany({
    where: {
      status: IntakeRequestStatus.CONVERTED,
      initiativeId: { not: null },
    },
    select: { initiativeId: true },
  });

  let convertedPlanned = 0;
  let convertedUnplanned = 0;

  if (periodId && convertedRequests.length > 0) {
    const initiativeIds = convertedRequests
      .map((r) => r.initiativeId)
      .filter((id): id is string => id !== null);

    // Find which of these initiatives have allocations in scenarios for this period
    const plannedInitiativeIds = await prisma.allocation.findMany({
      where: {
        initiativeId: { in: initiativeIds },
        scenario: { periodId },
      },
      select: { initiativeId: true },
      distinct: ['initiativeId'],
    });

    const plannedSet = new Set(
      plannedInitiativeIds.map((a) => a.initiativeId).filter(Boolean)
    );

    convertedPlanned = plannedSet.size;
    convertedUnplanned = initiativeIds.length - convertedPlanned;
  } else {
    // Without period filter, just count converted
    convertedUnplanned = convertedRequests.length;
  }

  // 3. Non-intake planned work (DIRECT_PM initiatives with allocations)
  let nonIntakePlanned = 0;

  if (periodId) {
    const directPmPlanned = await prisma.allocation.findMany({
      where: {
        scenario: { periodId },
        initiative: { origin: InitiativeOrigin.DIRECT_PM },
      },
      select: { initiativeId: true },
      distinct: ['initiativeId'],
    });
    nonIntakePlanned = directPmPlanned.length;
  } else {
    // Count all DIRECT_PM initiatives that have any allocation
    const directPmWithAllocations = await prisma.initiative.count({
      where: {
        origin: InitiativeOrigin.DIRECT_PM,
        allocations: { some: {} },
      },
    });
    nonIntakePlanned = directPmWithAllocations;
  }

  const totalPlanned = convertedPlanned + nonIntakePlanned;

  // 4. Compute coverage metrics
  const intakeCoveragePct =
    totalPlanned > 0 ? (convertedPlanned / totalPlanned) * 100 : 0;
  const intakeLeakagePct =
    totalPlanned > 0 ? (nonIntakePlanned / totalPlanned) * 100 : 0;

  // Total approved intake = approved unconverted + all converted
  const totalApprovedIntake =
    approvedUnconverted + convertedPlanned + convertedUnplanned;
  const conversionRatePct =
    totalApprovedIntake > 0
      ? ((convertedPlanned + convertedUnplanned) / totalApprovedIntake) * 100
      : 0;
  const planningCoveragePct =
    totalApprovedIntake > 0
      ? (convertedPlanned / totalApprovedIntake) * 100
      : 0;

  return {
    period,
    pipeline: {
      approvedUnconverted,
      convertedUnplanned,
      convertedPlanned,
      nonIntakePlanned,
      totalPlanned,
    },
    coverage: {
      intakeCoveragePct: Math.round(intakeCoveragePct * 10) / 10,
      intakeLeakagePct: Math.round(intakeLeakagePct * 10) / 10,
      conversionRatePct: Math.round(conversionRatePct * 10) / 10,
      planningCoveragePct: Math.round(planningCoveragePct * 10) / 10,
    },
  };
}
