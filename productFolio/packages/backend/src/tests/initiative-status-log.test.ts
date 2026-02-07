import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InitiativeStatus } from '@prisma/client';
import * as statusLogService from '../services/initiative-status-log.service.js';
import { NotFoundError } from '../lib/errors.js';
import { testUuid } from './setup.js';
import { prisma } from '../lib/prisma.js';

// Mock Prisma client
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    initiativeStatusLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    initiative: {
      findUnique: vi.fn(),
    },
  },
}));

const mockedPrisma = vi.mocked(prisma);

describe('Initiative Status Log Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logTransition', () => {
    it('should create a status log entry', async () => {
      const logEntry = {
        id: testUuid('log1'),
        initiativeId: testUuid('1'),
        fromStatus: InitiativeStatus.PROPOSED,
        toStatus: InitiativeStatus.SCOPING,
        transitionedAt: new Date('2026-02-07T10:00:00Z'),
        actorId: testUuid('user1'),
      };

      mockedPrisma.initiativeStatusLog.create.mockResolvedValue(logEntry);

      const result = await statusLogService.logTransition(
        testUuid('1'),
        InitiativeStatus.PROPOSED,
        InitiativeStatus.SCOPING,
        testUuid('user1')
      );

      expect(mockedPrisma.initiativeStatusLog.create).toHaveBeenCalledWith({
        data: {
          initiativeId: testUuid('1'),
          fromStatus: InitiativeStatus.PROPOSED,
          toStatus: InitiativeStatus.SCOPING,
          actorId: testUuid('user1'),
        },
      });
      expect(result).toEqual(logEntry);
    });

    it('should set actorId to null when not provided', async () => {
      const logEntry = {
        id: testUuid('log1'),
        initiativeId: testUuid('1'),
        fromStatus: InitiativeStatus.PROPOSED,
        toStatus: InitiativeStatus.SCOPING,
        transitionedAt: new Date(),
        actorId: null,
      };

      mockedPrisma.initiativeStatusLog.create.mockResolvedValue(logEntry);

      await statusLogService.logTransition(
        testUuid('1'),
        InitiativeStatus.PROPOSED,
        InitiativeStatus.SCOPING
      );

      expect(mockedPrisma.initiativeStatusLog.create).toHaveBeenCalledWith({
        data: {
          initiativeId: testUuid('1'),
          fromStatus: InitiativeStatus.PROPOSED,
          toStatus: InitiativeStatus.SCOPING,
          actorId: null,
        },
      });
    });
  });

  describe('getHistory', () => {
    it('should return status history for an initiative', async () => {
      const initId = testUuid('1');
      mockedPrisma.initiative.findUnique.mockResolvedValue({ id: initId } as any);

      const logs = [
        {
          id: testUuid('log2'),
          initiativeId: initId,
          fromStatus: InitiativeStatus.SCOPING,
          toStatus: InitiativeStatus.RESOURCING,
          transitionedAt: new Date('2026-02-07T12:00:00Z'),
          actorId: testUuid('user1'),
        },
        {
          id: testUuid('log1'),
          initiativeId: initId,
          fromStatus: InitiativeStatus.PROPOSED,
          toStatus: InitiativeStatus.SCOPING,
          transitionedAt: new Date('2026-02-07T10:00:00Z'),
          actorId: testUuid('user1'),
        },
      ];

      mockedPrisma.initiativeStatusLog.findMany.mockResolvedValue(logs);

      const result = await statusLogService.getHistory(initId);

      expect(mockedPrisma.initiative.findUnique).toHaveBeenCalledWith({
        where: { id: initId },
        select: { id: true },
      });
      expect(mockedPrisma.initiativeStatusLog.findMany).toHaveBeenCalledWith({
        where: { initiativeId: initId },
        orderBy: { transitionedAt: 'desc' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].toStatus).toBe(InitiativeStatus.RESOURCING);
    });

    it('should throw NotFoundError for non-existent initiative', async () => {
      mockedPrisma.initiative.findUnique.mockResolvedValue(null);

      await expect(
        statusLogService.getHistory(testUuid('999'))
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getCycleTimes', () => {
    it('should compute average days per status from transition logs', async () => {
      const initId = testUuid('1');

      // Simulate: PROPOSED -> SCOPING (2 days) -> RESOURCING (5 days) -> IN_EXECUTION
      const logs = [
        {
          id: testUuid('log1'),
          initiativeId: initId,
          fromStatus: InitiativeStatus.PROPOSED,
          toStatus: InitiativeStatus.SCOPING,
          transitionedAt: new Date('2026-01-01T00:00:00Z'),
          actorId: null,
        },
        {
          id: testUuid('log2'),
          initiativeId: initId,
          fromStatus: InitiativeStatus.SCOPING,
          toStatus: InitiativeStatus.RESOURCING,
          transitionedAt: new Date('2026-01-03T00:00:00Z'),
          actorId: null,
        },
        {
          id: testUuid('log3'),
          initiativeId: initId,
          fromStatus: InitiativeStatus.RESOURCING,
          toStatus: InitiativeStatus.IN_EXECUTION,
          transitionedAt: new Date('2026-01-08T00:00:00Z'),
          actorId: null,
        },
      ];

      mockedPrisma.initiativeStatusLog.findMany.mockResolvedValue(logs);

      const result = await statusLogService.getCycleTimes();

      expect(mockedPrisma.initiativeStatusLog.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ initiativeId: 'asc' }, { transitionedAt: 'asc' }],
      });

      // SCOPING: 2 days (from log1 to log2)
      const scoping = result.find((r) => r.status === InitiativeStatus.SCOPING);
      expect(scoping).toBeDefined();
      expect(scoping!.avgDays).toBe(2);
      expect(scoping!.count).toBe(1);

      // RESOURCING: 5 days (from log2 to log3)
      const resourcing = result.find((r) => r.status === InitiativeStatus.RESOURCING);
      expect(resourcing).toBeDefined();
      expect(resourcing!.avgDays).toBe(5);
      expect(resourcing!.count).toBe(1);
    });

    it('should average across multiple initiatives', async () => {
      const init1 = testUuid('1');
      const init2 = testUuid('2');

      // Init1: SCOPING for 2 days, Init2: SCOPING for 4 days
      const logs = [
        {
          id: testUuid('log1'),
          initiativeId: init1,
          fromStatus: InitiativeStatus.PROPOSED,
          toStatus: InitiativeStatus.SCOPING,
          transitionedAt: new Date('2026-01-01T00:00:00Z'),
          actorId: null,
        },
        {
          id: testUuid('log2'),
          initiativeId: init1,
          fromStatus: InitiativeStatus.SCOPING,
          toStatus: InitiativeStatus.RESOURCING,
          transitionedAt: new Date('2026-01-03T00:00:00Z'),
          actorId: null,
        },
        {
          id: testUuid('log3'),
          initiativeId: init2,
          fromStatus: InitiativeStatus.PROPOSED,
          toStatus: InitiativeStatus.SCOPING,
          transitionedAt: new Date('2026-01-01T00:00:00Z'),
          actorId: null,
        },
        {
          id: testUuid('log4'),
          initiativeId: init2,
          fromStatus: InitiativeStatus.SCOPING,
          toStatus: InitiativeStatus.RESOURCING,
          transitionedAt: new Date('2026-01-05T00:00:00Z'),
          actorId: null,
        },
      ];

      mockedPrisma.initiativeStatusLog.findMany.mockResolvedValue(logs);

      const result = await statusLogService.getCycleTimes();

      const scoping = result.find((r) => r.status === InitiativeStatus.SCOPING);
      expect(scoping).toBeDefined();
      expect(scoping!.avgDays).toBe(3); // (2 + 4) / 2
      expect(scoping!.count).toBe(2);
    });

    it('should filter by initiativeIds', async () => {
      mockedPrisma.initiativeStatusLog.findMany.mockResolvedValue([]);

      await statusLogService.getCycleTimes({ initiativeIds: [testUuid('1')] });

      expect(mockedPrisma.initiativeStatusLog.findMany).toHaveBeenCalledWith({
        where: { initiativeId: { in: [testUuid('1')] } },
        orderBy: [{ initiativeId: 'asc' }, { transitionedAt: 'asc' }],
      });
    });

    it('should filter by date range', async () => {
      const fromDate = new Date('2026-01-01');
      const toDate = new Date('2026-02-01');

      mockedPrisma.initiativeStatusLog.findMany.mockResolvedValue([]);

      await statusLogService.getCycleTimes({ fromDate, toDate });

      expect(mockedPrisma.initiativeStatusLog.findMany).toHaveBeenCalledWith({
        where: {
          transitionedAt: { gte: fromDate, lte: toDate },
        },
        orderBy: [{ initiativeId: 'asc' }, { transitionedAt: 'asc' }],
      });
    });

    it('should return empty array when no logs exist', async () => {
      mockedPrisma.initiativeStatusLog.findMany.mockResolvedValue([]);

      const result = await statusLogService.getCycleTimes();

      expect(result).toEqual([]);
    });
  });
});
