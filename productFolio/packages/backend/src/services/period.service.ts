import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import { PeriodType } from '@prisma/client';

// ISO week helpers

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getISOWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return d.getUTCFullYear();
}

function getISOWeekStart(year: number, week: number): Date {
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7; // 1=Mon .. 7=Sun
  // Monday of week 1
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
  // Add (week - 1) * 7 days
  const result = new Date(week1Monday);
  result.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return result;
}

function getISOWeeksInYear(year: number): number {
  // Dec 28 is always in the last ISO week of the year
  const dec28 = new Date(Date.UTC(year, 11, 28));
  return getISOWeekNumber(dec28);
}

export interface PeriodOverlap {
  periodId: string;
  overlapRatio: number;
}

export class PeriodService {
  /**
   * Seed all periods (quarters, months, ISO weeks) for a range of years.
   * Idempotent - skips already-existing periods.
   */
  async seedPeriods(startYear: number, endYear: number): Promise<{ created: number }> {
    let created = 0;

    for (let year = startYear; year <= endYear; year++) {
      // Create quarters
      for (let q = 1; q <= 4; q++) {
        const startMonth = (q - 1) * 3;
        const endMonth = startMonth + 2;
        const startDate = new Date(Date.UTC(year, startMonth, 1));
        const endDate = new Date(Date.UTC(year, endMonth + 1, 0)); // last day of end month
        const label = `${year}-Q${q}`;

        const existing = await prisma.period.findUnique({
          where: { type_year_ordinal: { type: PeriodType.QUARTER, year, ordinal: q } },
        });
        if (!existing) {
          await prisma.period.create({
            data: {
              type: PeriodType.QUARTER,
              startDate,
              endDate,
              label,
              year,
              ordinal: q,
            },
          });
          created++;
        }
      }

      // Create months
      for (let m = 1; m <= 12; m++) {
        const startDate = new Date(Date.UTC(year, m - 1, 1));
        const endDate = new Date(Date.UTC(year, m, 0)); // last day of month
        const label = `${year}-${String(m).padStart(2, '0')}`;
        const parentQuarter = Math.ceil(m / 3);

        const existing = await prisma.period.findUnique({
          where: { type_year_ordinal: { type: PeriodType.MONTH, year, ordinal: m } },
        });
        if (!existing) {
          // Find parent quarter
          const parentPeriod = await prisma.period.findUnique({
            where: { type_year_ordinal: { type: PeriodType.QUARTER, year, ordinal: parentQuarter } },
          });

          await prisma.period.create({
            data: {
              type: PeriodType.MONTH,
              startDate,
              endDate,
              label,
              year,
              ordinal: m,
              parentId: parentPeriod?.id || null,
            },
          });
          created++;
        }
      }

      // Create ISO weeks
      const totalWeeks = getISOWeeksInYear(year);
      for (let w = 1; w <= totalWeeks; w++) {
        const weekStart = getISOWeekStart(year, w);
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
        const label = `${year}-W${String(w).padStart(2, '0')}`;

        // Assign to month based on start date
        const parentMonth = weekStart.getUTCMonth() + 1;
        const parentMonthYear = weekStart.getUTCFullYear();

        const existing = await prisma.period.findUnique({
          where: { type_year_ordinal: { type: PeriodType.WEEK, year, ordinal: w } },
        });
        if (!existing) {
          const parentPeriod = await prisma.period.findUnique({
            where: { type_year_ordinal: { type: PeriodType.MONTH, year: parentMonthYear, ordinal: parentMonth } },
          });

          await prisma.period.create({
            data: {
              type: PeriodType.WEEK,
              startDate: weekStart,
              endDate: weekEnd,
              label,
              year,
              ordinal: w,
              parentId: parentPeriod?.id || null,
            },
          });
          created++;
        }
      }
    }

    return { created };
  }

  /**
   * Look up a period by its human-readable label (e.g. "2024-Q1", "2024-01", "2024-W01")
   */
  async findByLabel(label: string) {
    const period = await prisma.period.findFirst({
      where: { label },
      include: { parent: true, children: true },
    });

    if (!period) {
      throw new NotFoundError('Period', label);
    }

    return period;
  }

  /**
   * Get a period by ID
   */
  async getById(id: string) {
    const period = await prisma.period.findUnique({
      where: { id },
      include: { parent: true, children: true },
    });

    if (!period) {
      throw new NotFoundError('Period', id);
    }

    return period;
  }

  /**
   * Find periods overlapping a date range, optionally filtered by type.
   */
  async findPeriodsInRange(startDate: Date, endDate: Date, type?: PeriodType) {
    const where: Record<string, unknown> = {
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    };
    if (type) {
      where.type = type;
    }

    return prisma.period.findMany({
      where,
      orderBy: [{ year: 'asc' }, { ordinal: 'asc' }],
    });
  }

  /**
   * Map a date range to periods with overlap ratios.
   * Returns array of { periodId, overlapRatio } where overlapRatio is 0.0-1.0
   * representing what fraction of the period is covered by the date range.
   */
  async mapDateRangeToPeriods(
    startDate: Date,
    endDate: Date,
    type: PeriodType = PeriodType.QUARTER,
  ): Promise<PeriodOverlap[]> {
    const periods = await this.findPeriodsInRange(startDate, endDate, type);
    const result: PeriodOverlap[] = [];

    for (const period of periods) {
      const overlapStart = new Date(
        Math.max(startDate.getTime(), period.startDate.getTime())
      );
      const overlapEnd = new Date(
        Math.min(endDate.getTime(), period.endDate.getTime())
      );

      if (overlapStart > overlapEnd) continue;

      const overlapDays =
        (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24) + 1;
      const periodDays =
        (period.endDate.getTime() - period.startDate.getTime()) / (1000 * 60 * 60 * 24) + 1;

      const overlapRatio = Math.min(overlapDays / periodDays, 1.0);

      result.push({
        periodId: period.id,
        overlapRatio,
      });
    }

    return result;
  }

  /**
   * Get child periods of a given period
   */
  async getChildren(periodId: string) {
    return prisma.period.findMany({
      where: { parentId: periodId },
      orderBy: [{ year: 'asc' }, { ordinal: 'asc' }],
    });
  }

  /**
   * Get parent period
   */
  async getParent(periodId: string) {
    const period = await prisma.period.findUnique({
      where: { id: periodId },
      include: { parent: true },
    });

    if (!period) {
      throw new NotFoundError('Period', periodId);
    }

    return period.parent;
  }

  /**
   * Find which period a date falls in for a given type
   */
  async derivePeriodForDate(date: Date, type: PeriodType) {
    return prisma.period.findFirst({
      where: {
        type,
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });
  }

  /**
   * Get the last, current, and next quarter periods relative to today.
   */
  async getAdjacentQuarters(): Promise<{
    lastQuarter: { id: string; label: string; startDate: Date; endDate: Date; year: number; ordinal: number } | null;
    currentQuarter: { id: string; label: string; startDate: Date; endDate: Date; year: number; ordinal: number } | null;
    nextQuarter: { id: string; label: string; startDate: Date; endDate: Date; year: number; ordinal: number } | null;
  }> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    const currentQ = Math.ceil((currentMonth + 1) / 3);

    // Derive last and next quarter year/ordinal
    let lastQ = currentQ - 1;
    let lastYear = currentYear;
    if (lastQ < 1) {
      lastQ = 4;
      lastYear = currentYear - 1;
    }

    let nextQ = currentQ + 1;
    let nextYear = currentYear;
    if (nextQ > 4) {
      nextQ = 1;
      nextYear = currentYear + 1;
    }

    const [lastQuarter, currentQuarter, nextQuarter] = await Promise.all([
      prisma.period.findUnique({
        where: { type_year_ordinal: { type: PeriodType.QUARTER, year: lastYear, ordinal: lastQ } },
      }),
      prisma.period.findUnique({
        where: { type_year_ordinal: { type: PeriodType.QUARTER, year: currentYear, ordinal: currentQ } },
      }),
      prisma.period.findUnique({
        where: { type_year_ordinal: { type: PeriodType.QUARTER, year: nextYear, ordinal: nextQ } },
      }),
    ]);

    return {
      lastQuarter: lastQuarter ? {
        id: lastQuarter.id,
        label: lastQuarter.label,
        startDate: lastQuarter.startDate,
        endDate: lastQuarter.endDate,
        year: lastQuarter.year,
        ordinal: lastQuarter.ordinal,
      } : null,
      currentQuarter: currentQuarter ? {
        id: currentQuarter.id,
        label: currentQuarter.label,
        startDate: currentQuarter.startDate,
        endDate: currentQuarter.endDate,
        year: currentQuarter.year,
        ordinal: currentQuarter.ordinal,
      } : null,
      nextQuarter: nextQuarter ? {
        id: nextQuarter.id,
        label: nextQuarter.label,
        startDate: nextQuarter.startDate,
        endDate: nextQuarter.endDate,
        year: nextQuarter.year,
        ordinal: nextQuarter.ordinal,
      } : null,
    };
  }

  /**
   * List periods with optional filters
   */
  async list(filters: {
    type?: PeriodType;
    year?: number;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  } = {}) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filters.type) where.type = filters.type;
    if (filters.year) where.year = filters.year;
    if (filters.startDate || filters.endDate) {
      if (filters.startDate) where.endDate = { gte: filters.startDate };
      if (filters.endDate) where.startDate = { lte: filters.endDate };
    }

    const [periods, total] = await Promise.all([
      prisma.period.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ year: 'asc' }, { ordinal: 'asc' }],
      }),
      prisma.period.count({ where }),
    ]);

    return {
      data: periods,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const periodService = new PeriodService();
