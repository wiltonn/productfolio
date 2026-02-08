import { prisma } from '../lib/prisma.js';
import { NotFoundError, WorkflowError } from '../lib/errors.js';
import type { UpsertTokenSupplyInput } from '../schemas/token-supply.schema.js';

class TokenSupplyService {
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

    return prisma.tokenSupply.findMany({
      where: { scenarioId },
      include: { skillPool: true },
      orderBy: { skillPool: { name: 'asc' } },
    });
  }

  async upsert(scenarioId: string, data: UpsertTokenSupplyInput) {
    await this.validateScenarioToken(scenarioId);

    const pool = await prisma.skillPool.findUnique({
      where: { id: data.skillPoolId },
    });

    if (!pool) {
      throw new NotFoundError('SkillPool', data.skillPoolId);
    }

    return prisma.tokenSupply.upsert({
      where: {
        scenarioId_skillPoolId: {
          scenarioId,
          skillPoolId: data.skillPoolId,
        },
      },
      create: {
        scenarioId,
        skillPoolId: data.skillPoolId,
        tokens: data.tokens,
        notes: data.notes,
      },
      update: {
        tokens: data.tokens,
        notes: data.notes,
      },
      include: { skillPool: true },
    });
  }

  async delete(scenarioId: string, skillPoolId: string) {
    await this.validateScenarioToken(scenarioId);

    const supply = await prisma.tokenSupply.findUnique({
      where: {
        scenarioId_skillPoolId: {
          scenarioId,
          skillPoolId,
        },
      },
    });

    if (!supply) {
      throw new NotFoundError('TokenSupply');
    }

    await prisma.tokenSupply.delete({
      where: {
        scenarioId_skillPoolId: {
          scenarioId,
          skillPoolId,
        },
      },
    });
  }
}

export const tokenSupplyService = new TokenSupplyService();
