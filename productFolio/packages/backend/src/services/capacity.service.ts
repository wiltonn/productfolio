import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { periodService } from './period.service.js';
import type { CapacityEntry } from '../schemas/resources.schema.js';
import { PeriodType } from '@prisma/client';

// ============================================================================
// Type Definitions
// ============================================================================

export interface AvailabilityPeriod {
  periodId: string;
  periodLabel: string;
  baseHours: number;
  allocatedHours: number;
  ptoHours: number;
  availableHours: number;
}

// ============================================================================
// Capacity Service Methods
// ============================================================================

export async function getCapacityCalendar(employeeId: string) {
  // Verify employee exists
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee) {
    throw new NotFoundError('Employee', employeeId);
  }

  const capacityEntries = await prisma.capacityCalendar.findMany({
    where: { employeeId },
    include: {
      period: true,
    },
    orderBy: {
      period: {
        startDate: 'asc',
      },
    },
  });

  return capacityEntries.map((entry) => ({
    employeeId: entry.employeeId,
    periodId: entry.periodId,
    periodLabel: entry.period.label,
    periodType: entry.period.type,
    startDate: entry.period.startDate,
    endDate: entry.period.endDate,
    hoursAvailable: entry.hoursAvailable,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }));
}

export async function updateCapacity(
  employeeId: string,
  entries: CapacityEntry[]
) {
  // Verify employee exists
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee) {
    throw new NotFoundError('Employee', employeeId);
  }

  // Validate entries
  if (!entries || entries.length === 0) {
    throw new ValidationError('At least one capacity entry is required');
  }

  // Verify all period IDs exist
  const periodIds = entries.map((e) => e.periodId);
  const periods = await prisma.period.findMany({
    where: { id: { in: periodIds } },
  });

  const foundIds = new Set(periods.map((p) => p.id));
  const missingIds = periodIds.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    throw new ValidationError(`Periods not found: ${missingIds.join(', ')}`);
  }

  // Upsert capacity entries
  const updated = await Promise.all(
    entries.map((entry) =>
      prisma.capacityCalendar.upsert({
        where: {
          employeeId_periodId: {
            employeeId,
            periodId: entry.periodId,
          },
        },
        update: {
          hoursAvailable: entry.hoursAvailable,
        },
        create: {
          employeeId,
          periodId: entry.periodId,
          hoursAvailable: entry.hoursAvailable,
        },
        include: {
          period: true,
        },
      })
    )
  );

  return updated.map((entry) => ({
    employeeId: entry.employeeId,
    periodId: entry.periodId,
    periodLabel: entry.period.label,
    hoursAvailable: entry.hoursAvailable,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }));
}

export async function calculateAvailability(
  employeeId: string,
  startDate: Date,
  endDate: Date
): Promise<AvailabilityPeriod[]> {
  if (startDate > endDate) {
    throw new ValidationError('Start date must be before or equal to end date');
  }

  // Verify employee exists
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee) {
    throw new NotFoundError('Employee', employeeId);
  }

  // Find week periods in the date range
  const weekPeriods = await periodService.findPeriodsInRange(
    startDate,
    endDate,
    PeriodType.WEEK
  );

  // Get capacity calendar entries for these periods
  const periodIds = weekPeriods.map((p) => p.id);
  const capacityEntries = await prisma.capacityCalendar.findMany({
    where: {
      employeeId,
      periodId: { in: periodIds },
    },
  });

  const capacityMap = new Map(
    capacityEntries.map((e) => [e.periodId, e.hoursAvailable])
  );

  // Get allocations for the employee that overlap this date range
  const allocations = await prisma.allocation.findMany({
    where: {
      employeeId,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    include: {
      allocationPeriods: true,
    },
  });

  // Build result for each week period
  const periods: AvailabilityPeriod[] = [];

  for (const period of weekPeriods) {
    const baseHours = employee.hoursPerWeek;

    // Sum allocation hours for this period from AllocationPeriod junction
    let allocatedHours = 0;
    for (const allocation of allocations) {
      const ap = allocation.allocationPeriods.find((a) => a.periodId === period.id);
      if (ap) {
        allocatedHours += ap.hoursInPeriod;
      }
    }

    // PTO hours from capacity calendar
    const ptoHours = capacityMap.get(period.id) || 0;

    const availableHours = Math.max(0, baseHours - allocatedHours - ptoHours);

    periods.push({
      periodId: period.id,
      periodLabel: period.label,
      baseHours,
      allocatedHours: Math.min(allocatedHours, baseHours),
      ptoHours: Math.min(ptoHours, baseHours),
      availableHours,
    });
  }

  return periods;
}
