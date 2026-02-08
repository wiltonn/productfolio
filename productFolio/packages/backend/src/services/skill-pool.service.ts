import { prisma } from '../lib/prisma.js';
import { NotFoundError, ConflictError } from '../lib/errors.js';
import type { CreateSkillPoolInput, UpdateSkillPoolInput } from '../schemas/skill-pool.schema.js';

class SkillPoolService {
  async list(includeInactive?: boolean) {
    const where = includeInactive ? {} : { isActive: true };
    return prisma.skillPool.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string) {
    const pool = await prisma.skillPool.findUnique({
      where: { id },
      include: { tokenCalibrations: { orderBy: { effectiveDate: 'desc' } } },
    });

    if (!pool) {
      throw new NotFoundError('SkillPool', id);
    }

    return pool;
  }

  async create(data: CreateSkillPoolInput) {
    const existing = await prisma.skillPool.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new ConflictError(`Skill pool with name '${data.name}' already exists`);
    }

    return prisma.skillPool.create({ data });
  }

  async update(id: string, data: UpdateSkillPoolInput) {
    const pool = await prisma.skillPool.findUnique({ where: { id } });

    if (!pool) {
      throw new NotFoundError('SkillPool', id);
    }

    if (data.name && data.name !== pool.name) {
      const conflict = await prisma.skillPool.findUnique({
        where: { name: data.name },
      });
      if (conflict) {
        throw new ConflictError(`Skill pool with name '${data.name}' already exists`);
      }
    }

    return prisma.skillPool.update({ where: { id }, data });
  }

  async delete(id: string) {
    const pool = await prisma.skillPool.findUnique({ where: { id } });

    if (!pool) {
      throw new NotFoundError('SkillPool', id);
    }

    return prisma.skillPool.update({
      where: { id },
      data: { isActive: false },
    });
  }
}

export const skillPoolService = new SkillPoolService();
