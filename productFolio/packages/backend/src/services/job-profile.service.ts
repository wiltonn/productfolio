import { prisma } from '../lib/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../lib/errors.js';
import type {
  CreateJobProfileInput,
  UpdateJobProfileInput,
  JobProfileFiltersInput,
} from '../schemas/job-profiles.schema.js';
import type { PaginatedResponse } from '../types/index.js';

const INCLUDE_FULL = {
  skills: { orderBy: { skillName: 'asc' as const } },
  costBand: true,
  _count: { select: { employees: true } },
};

export async function list(
  filters: Partial<JobProfileFiltersInput> = {}
): Promise<PaginatedResponse<unknown>> {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const where: Record<string, unknown> = {};

  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { level: { contains: filters.search, mode: 'insensitive' } },
      { band: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.jobProfile.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: INCLUDE_FULL,
    }),
    prisma.jobProfile.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getById(id: string) {
  const profile = await prisma.jobProfile.findUnique({
    where: { id },
    include: INCLUDE_FULL,
  });

  if (!profile) {
    throw new NotFoundError('JobProfile', id);
  }

  return profile;
}

export async function create(data: CreateJobProfileInput) {
  const existing = await prisma.jobProfile.findUnique({
    where: { name: data.name },
  });

  if (existing) {
    throw new ConflictError(`Job profile with name '${data.name}' already exists`);
  }

  return prisma.jobProfile.create({
    data: {
      name: data.name,
      level: data.level ?? null,
      band: data.band ?? null,
      description: data.description ?? null,
      isActive: data.isActive,
      skills: data.skills.length > 0
        ? {
            create: data.skills.map((s) => ({
              skillName: s.skillName,
              expectedProficiency: s.expectedProficiency,
            })),
          }
        : undefined,
      costBand: data.costBand
        ? {
            create: {
              annualCostMin: data.costBand.annualCostMin ?? null,
              annualCostMax: data.costBand.annualCostMax ?? null,
              hourlyRate: data.costBand.hourlyRate ?? null,
              currency: data.costBand.currency,
              effectiveDate: data.costBand.effectiveDate,
            },
          }
        : undefined,
    },
    include: INCLUDE_FULL,
  });
}

export async function update(id: string, data: UpdateJobProfileInput) {
  const profile = await prisma.jobProfile.findUnique({
    where: { id },
  });

  if (!profile) {
    throw new NotFoundError('JobProfile', id);
  }

  if (data.name && data.name !== profile.name) {
    const existing = await prisma.jobProfile.findUnique({
      where: { name: data.name },
    });
    if (existing) {
      throw new ConflictError(`Job profile with name '${data.name}' already exists`);
    }
  }

  return prisma.$transaction(async (tx) => {
    // Replace skills if provided
    if (data.skills !== undefined) {
      await tx.jobProfileSkill.deleteMany({ where: { jobProfileId: id } });
      if (data.skills.length > 0) {
        await tx.jobProfileSkill.createMany({
          data: data.skills.map((s) => ({
            jobProfileId: id,
            skillName: s.skillName,
            expectedProficiency: s.expectedProficiency,
          })),
        });
      }
    }

    // Upsert cost band if provided
    if (data.costBand !== undefined) {
      if (data.costBand === null) {
        await tx.costBand.deleteMany({ where: { jobProfileId: id } });
      } else {
        await tx.costBand.upsert({
          where: { jobProfileId: id },
          create: {
            jobProfileId: id,
            annualCostMin: data.costBand.annualCostMin ?? null,
            annualCostMax: data.costBand.annualCostMax ?? null,
            hourlyRate: data.costBand.hourlyRate ?? null,
            currency: data.costBand.currency,
            effectiveDate: data.costBand.effectiveDate,
          },
          update: {
            annualCostMin: data.costBand.annualCostMin ?? null,
            annualCostMax: data.costBand.annualCostMax ?? null,
            hourlyRate: data.costBand.hourlyRate ?? null,
            currency: data.costBand.currency,
            effectiveDate: data.costBand.effectiveDate,
          },
        });
      }
    }

    return tx.jobProfile.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.level !== undefined && { level: data.level }),
        ...(data.band !== undefined && { band: data.band }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      include: INCLUDE_FULL,
    });
  });
}

export async function deleteProfile(id: string) {
  const profile = await prisma.jobProfile.findUnique({
    where: { id },
    include: { _count: { select: { employees: true } } },
  });

  if (!profile) {
    throw new NotFoundError('JobProfile', id);
  }

  if (profile._count.employees > 0) {
    throw new ConflictError(
      `Cannot delete job profile '${profile.name}' because ${profile._count.employees} employee(s) are assigned to it. Reassign them first.`
    );
  }

  await prisma.jobProfile.update({
    where: { id },
    data: { isActive: false },
  });

  return { success: true };
}
