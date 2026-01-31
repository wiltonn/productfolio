import { prisma } from '../lib/prisma.js';
import { NotFoundError, ConflictError } from '../lib/errors.js';
import type {
  CreatePortfolioAreaInput,
  UpdatePortfolioAreaInput,
  PortfolioAreaFiltersInput,
} from '../schemas/portfolio-areas.schema.js';
import type { PaginatedResponse } from '../types/index.js';

export async function list(
  filters: Partial<PortfolioAreaFiltersInput> = {}
): Promise<PaginatedResponse<any>> {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;

  const where: any = {};

  if (filters.search) {
    where.name = {
      contains: filters.search,
      mode: 'insensitive',
    };
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.portfolioArea.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: { _count: { select: { initiatives: true } } },
    }),
    prisma.portfolioArea.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

export async function getById(id: string) {
  const area = await prisma.portfolioArea.findUnique({
    where: { id },
  });

  if (!area) {
    throw new NotFoundError('PortfolioArea', id);
  }

  return area;
}

export async function create(data: CreatePortfolioAreaInput) {
  const existing = await prisma.portfolioArea.findUnique({
    where: { name: data.name },
  });

  if (existing) {
    throw new ConflictError(`Portfolio area with name '${data.name}' already exists`);
  }

  return prisma.portfolioArea.create({
    data: {
      name: data.name,
    },
  });
}

export async function update(id: string, data: UpdatePortfolioAreaInput) {
  const area = await prisma.portfolioArea.findUnique({
    where: { id },
  });

  if (!area) {
    throw new NotFoundError('PortfolioArea', id);
  }

  if (data.name) {
    const existing = await prisma.portfolioArea.findUnique({
      where: { name: data.name },
    });

    if (existing && existing.id !== id) {
      throw new ConflictError(`Portfolio area with name '${data.name}' already exists`);
    }
  }

  return prisma.portfolioArea.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
    },
  });
}

export async function deleteArea(id: string) {
  const area = await prisma.portfolioArea.findUnique({
    where: { id },
    include: { _count: { select: { initiatives: true } } },
  });

  if (!area) {
    throw new NotFoundError('PortfolioArea', id);
  }

  if (area._count.initiatives > 0) {
    throw new ConflictError(
      `Cannot delete portfolio area '${area.name}' because it has ${area._count.initiatives} initiative(s) referencing it`
    );
  }

  await prisma.portfolioArea.delete({
    where: { id },
  });

  return { success: true };
}
