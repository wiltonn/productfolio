import { prisma } from '../lib/prisma.js';
import { NotFoundError, WorkflowError } from '../lib/errors.js';
import type { UpsertTokenDemandInput } from '../schemas/token-demand.schema.js';

class TokenDemandService {
  private async validateScenarioToken(scenarioId: string) {
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      select: { id: true, planningMode: true },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    if (scenario.planningMode !== 'TOKEN') {
      throw new WorkflowError('Scenario must be in TOKEN planning mode');
    }

    return scenario;
  }

  async list(scenarioId: string) {
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      select: { id: true },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    return prisma.tokenDemand.findMany({
      where: { scenarioId },
      include: { skillPool: true },
      orderBy: [
        { initiativeId: 'asc' },
        { skillPool: { name: 'asc' } },
      ],
    });
  }

  async upsert(scenarioId: string, data: UpsertTokenDemandInput) {
    await this.validateScenarioToken(scenarioId);

    const [pool, initiative] = await Promise.all([
      prisma.skillPool.findUnique({ where: { id: data.skillPoolId } }),
      prisma.initiative.findUnique({ where: { id: data.initiativeId } }),
    ]);

    if (!pool) {
      throw new NotFoundError('SkillPool', data.skillPoolId);
    }

    if (!initiative) {
      throw new NotFoundError('Initiative', data.initiativeId);
    }

    return prisma.tokenDemand.upsert({
      where: {
        scenarioId_initiativeId_skillPoolId: {
          scenarioId,
          initiativeId: data.initiativeId,
          skillPoolId: data.skillPoolId,
        },
      },
      create: {
        scenarioId,
        initiativeId: data.initiativeId,
        skillPoolId: data.skillPoolId,
        tokensP50: data.tokensP50,
        tokensP90: data.tokensP90,
        notes: data.notes,
      },
      update: {
        tokensP50: data.tokensP50,
        tokensP90: data.tokensP90,
        notes: data.notes,
      },
      include: { skillPool: true },
    });
  }

  async delete(id: string) {
    const demand = await prisma.tokenDemand.findUnique({ where: { id } });

    if (!demand) {
      throw new NotFoundError('TokenDemand', id);
    }

    await prisma.tokenDemand.delete({ where: { id } });
  }

  async bulkUpsert(scenarioId: string, items: UpsertTokenDemandInput[]) {
    await this.validateScenarioToken(scenarioId);

    return prisma.$transaction(
      items.map((item) =>
        prisma.tokenDemand.upsert({
          where: {
            scenarioId_initiativeId_skillPoolId: {
              scenarioId,
              initiativeId: item.initiativeId,
              skillPoolId: item.skillPoolId,
            },
          },
          create: {
            scenarioId,
            initiativeId: item.initiativeId,
            skillPoolId: item.skillPoolId,
            tokensP50: item.tokensP50,
            tokensP90: item.tokensP90,
            notes: item.notes,
          },
          update: {
            tokensP50: item.tokensP50,
            tokensP90: item.tokensP90,
            notes: item.notes,
          },
          include: { skillPool: true },
        })
      )
    );
  }
}

export const tokenDemandService = new TokenDemandService();
