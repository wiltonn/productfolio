import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import type { CapacityEntry } from '../schemas/resources.schema.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface AvailabilityPeriod {
  period: Date;
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
    orderBy: { period: 'asc' },
  });

  return capacityEntries;
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

  // Upsert capacity entries
  const updated = await Promise.all(
    entries.map((entry) =>
      prisma.capacityCalendar.upsert({
        where: {
          employeeId_period: {
            employeeId,
            period: normalizeDate(entry.period),
          },
        },
        update: {
          hoursAvailable: entry.hoursAvailable,
        },
        create: {
          employeeId,
          period: normalizeDate(entry.period),
          hoursAvailable: entry.hoursAvailable,
        },
      })
    )
  );

  return updated;
}

export async function calculateAvailability(
  employeeId: string,
  startDate: Date,
  endDate: Date
): Promise<AvailabilityPeriod[]> {
  // Validate dates
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);

  if (start > end) {
    throw new ValidationError('Start date must be before or equal to end date');
  }

  // Verify employee exists
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee) {
    throw new NotFoundError('Employee', employeeId);
  }

  // Get capacity calendar entries for the period
  const capacityEntries = await prisma.capacityCalendar.findMany({
    where: {
      employeeId,
      period: {
        gte: start,
        lte: end,
      },
    },
  });

  // Create a map for quick lookup
  const capacityMap = new Map<string, number>();
  capacityEntries.forEach((entry) => {
    const key = dateToString(entry.period);
    capacityMap.set(key, entry.hoursAvailable);
  });

  // Get allocations for the period
  const allocations = await prisma.allocation.findMany({
    where: {
      employeeId,
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });

  // Generate weekly periods and calculate availability
  const periods: AvailabilityPeriod[] = [];
  let currentPeriodStart = new Date(start);

  while (currentPeriodStart <= end) {
    const periodStart = new Date(currentPeriodStart);
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 7); // Add 7 days for a week

    const periodKey = dateToString(periodStart);

    // Calculate weeks in period (for base hours calculation)
    const weeksInPeriod = calculateWeeksInPeriod(periodStart, periodEnd, end);

    // Base hours = hoursPerWeek * weeksInPeriod
    const baseHours = employee.hoursPerWeek * weeksInPeriod;

    // Allocated hours = sum of allocation percentages for this period
    const allocatedHours = allocations.reduce((sum, allocation) => {
      const allocationInPeriod = calculateAllocationInPeriod(
        allocation.startDate,
        allocation.endDate,
        periodStart,
        periodEnd
      );

      if (allocationInPeriod > 0) {
        return sum + (allocation.percentage / 100) * baseHours * allocationInPeriod;
      }

      return sum;
    }, 0);

    // PTO hours = capacity calendar reductions
    const ptoHours = capacityMap.get(periodKey) || 0;

    // Available hours
    const availableHours = Math.max(0, baseHours - allocatedHours - ptoHours);

    periods.push({
      period: periodStart,
      baseHours,
      allocatedHours: Math.min(allocatedHours, baseHours),
      ptoHours: Math.min(ptoHours, baseHours),
      availableHours,
    });

    // Move to next period
    currentPeriodStart.setDate(currentPeriodStart.getDate() + 7);

    // Ensure we don't go past end
    if (currentPeriodStart > end) {
      break;
    }
  }

  return periods;
}

// ============================================================================
// Helper Functions
// ============================================================================

function normalizeDate(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function dateToString(date: Date): string {
  const normalized = normalizeDate(date);
  return normalized.toISOString().split('T')[0];
}

function calculateWeeksInPeriod(
  periodStart: Date,
  periodEnd: Date,
  maxEnd: Date
): number {
  const actualEnd = periodEnd > maxEnd ? maxEnd : periodEnd;
  const diffMs = actualEnd.getTime() - periodStart.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(diffDays / 7, 1);
}

function calculateAllocationInPeriod(
  allocationStart: Date,
  allocationEnd: Date,
  periodStart: Date,
  periodEnd: Date
): number {
  // Find overlap between allocation and period
  const overlapStart = new Date(
    Math.max(allocationStart.getTime(), periodStart.getTime())
  );
  const overlapEnd = new Date(
    Math.min(allocationEnd.getTime(), periodEnd.getTime())
  );

  if (overlapStart > overlapEnd) {
    return 0; // No overlap
  }

  const overlapMs = overlapEnd.getTime() - overlapStart.getTime();
  const periodMs = periodEnd.getTime() - periodStart.getTime();

  return overlapMs / periodMs;
}
