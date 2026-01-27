import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { scenarioCalculatorService } from './scenario-calculator.service.js';
import { enqueueScenarioRecompute, enqueueViewRefresh } from '../jobs/index.js';
import type { CreateScenario, UpdateScenario, UpdatePriorities, Pagination, PriorityRanking } from '../schemas/scenarios.schema.js';
import type { PaginatedResponse } from '../types/index.js';

interface ScenarioWithMetadata {
  id: string;
  name: string;
  quarterRange: string;
  assumptions: Record<string, unknown> | null;
  priorityRankings: PriorityRanking[] | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  allocationsCount: number;
}

export class ScenariosService {
  async list(pagination: Pagination): Promise<PaginatedResponse<ScenarioWithMetadata>> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 10;
    const skip = (page - 1) * limit;

    const [scenarios, total] = await Promise.all([
      prisma.scenario.findMany({
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              allocations: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.scenario.count(),
    ]);

    const data: ScenarioWithMetadata[] = scenarios.map((scenario) => ({
      ...scenario,
      priorityRankings: scenario.priorityRankings as PriorityRanking[] | null,
      assumptions: scenario.assumptions as Record<string, unknown> | null,
      allocationsCount: scenario._count.allocations,
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id: string): Promise<ScenarioWithMetadata> {
    const scenario = await prisma.scenario.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            allocations: true,
          },
        },
      },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', id);
    }

    return {
      ...scenario,
      priorityRankings: scenario.priorityRankings as PriorityRanking[] | null,
      assumptions: scenario.assumptions as Record<string, unknown> | null,
      allocationsCount: scenario._count.allocations,
    };
  }

  async create(data: CreateScenario): Promise<ScenarioWithMetadata> {
    const scenario = await prisma.scenario.create({
      data: {
        name: data.name,
        quarterRange: data.quarterRange,
        assumptions: data.assumptions || null,
        priorityRankings: data.priorityRankings || null,
      },
      include: {
        _count: {
          select: {
            allocations: true,
          },
        },
      },
    });

    return {
      ...scenario,
      priorityRankings: scenario.priorityRankings as PriorityRanking[] | null,
      assumptions: scenario.assumptions as Record<string, unknown> | null,
      allocationsCount: scenario._count.allocations,
    };
  }

  async update(id: string, data: UpdateScenario): Promise<ScenarioWithMetadata> {
    // Check if scenario exists
    await this.getById(id);

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.quarterRange !== undefined) updateData.quarterRange = data.quarterRange;
    if (data.assumptions !== undefined) updateData.assumptions = data.assumptions;
    if (data.priorityRankings !== undefined) updateData.priorityRankings = data.priorityRankings;

    const scenario = await prisma.scenario.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: {
            allocations: true,
          },
        },
      },
    });

    // Invalidate calculator cache and enqueue background recomputation
    await scenarioCalculatorService.invalidateCache(id);
    await enqueueScenarioRecompute(id, 'priority_change');
    await enqueueViewRefresh('all', 'allocation_change', [id]);

    return {
      ...scenario,
      priorityRankings: scenario.priorityRankings as PriorityRanking[] | null,
      assumptions: scenario.assumptions as Record<string, unknown> | null,
      allocationsCount: scenario._count.allocations,
    };
  }

  async delete(id: string): Promise<void> {
    // Check if scenario exists
    await this.getById(id);

    await prisma.scenario.delete({
      where: { id },
    });
  }

  async updatePriorities(id: string, data: UpdatePriorities): Promise<ScenarioWithMetadata> {
    // Check if scenario exists
    await this.getById(id);

    const scenario = await prisma.scenario.update({
      where: { id },
      data: {
        priorityRankings: data.priorities,
      },
      include: {
        _count: {
          select: {
            allocations: true,
          },
        },
      },
    });

    // Invalidate calculator cache and enqueue background recomputation
    await scenarioCalculatorService.invalidateCache(id);
    await enqueueScenarioRecompute(id, 'priority_change');
    await enqueueViewRefresh('all', 'allocation_change', [id]);

    return {
      ...scenario,
      priorityRankings: scenario.priorityRankings as PriorityRanking[] | null,
      assumptions: scenario.assumptions as Record<string, unknown> | null,
      allocationsCount: scenario._count.allocations,
    };
  }
}

export const scenariosService = new ScenariosService();
