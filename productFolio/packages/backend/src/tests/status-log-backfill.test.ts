import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InitiativeStatus } from '@prisma/client';
import { processStatusLogBackfill } from '../jobs/processors/status-log-backfill.processor.js';
import { testUuid } from './setup.js';
import { prisma } from '../lib/prisma.js';

// Mock Prisma client
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    auditEvent: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    initiativeStatusLog: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const mockedPrisma = vi.mocked(prisma);

// Mock BullMQ Job
function createMockJob(data: { batchSize?: number } = {}) {
  return {
    data: { batchSize: data.batchSize ?? 500, triggeredBy: 'manual' as const },
    log: vi.fn(),
    updateProgress: vi.fn(),
  } as any;
}

describe('Status Log Backfill Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return early when no audit events exist', async () => {
    mockedPrisma.auditEvent.count.mockResolvedValue(0);

    const job = createMockJob();
    const result = await processStatusLogBackfill(job);

    expect(result.processed).toBe(0);
    expect(result.inserted).toBe(0);
    expect(job.log).toHaveBeenCalledWith(expect.stringContaining('No audit events'));
  });

  it('should backfill status logs from audit events', async () => {
    const initId = testUuid('1');
    const actorId = testUuid('user1');

    mockedPrisma.auditEvent.count.mockResolvedValue(2);
    mockedPrisma.initiativeStatusLog.findMany.mockResolvedValue([]);
    mockedPrisma.auditEvent.findMany.mockResolvedValueOnce([
      {
        id: testUuid('evt1'),
        actorId,
        entityType: 'Initiative',
        entityId: initId,
        action: 'status_transition',
        payload: {
          fromStatus: InitiativeStatus.PROPOSED,
          toStatus: InitiativeStatus.SCOPING,
        },
        ipAddress: null,
        createdAt: new Date('2026-01-15T10:00:00Z'),
      },
      {
        id: testUuid('evt2'),
        actorId,
        entityType: 'Initiative',
        entityId: initId,
        action: 'status_transition',
        payload: {
          fromStatus: InitiativeStatus.SCOPING,
          toStatus: InitiativeStatus.RESOURCING,
        },
        ipAddress: null,
        createdAt: new Date('2026-01-20T10:00:00Z'),
      },
    ]).mockResolvedValueOnce([]); // Second batch returns empty

    mockedPrisma.initiativeStatusLog.createMany.mockResolvedValue({ count: 2 });

    const job = createMockJob();
    const result = await processStatusLogBackfill(job);

    expect(result.processed).toBe(2);
    expect(result.inserted).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    expect(mockedPrisma.initiativeStatusLog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          initiativeId: initId,
          fromStatus: InitiativeStatus.PROPOSED,
          toStatus: InitiativeStatus.SCOPING,
          actorId,
        }),
        expect.objectContaining({
          initiativeId: initId,
          fromStatus: InitiativeStatus.SCOPING,
          toStatus: InitiativeStatus.RESOURCING,
          actorId,
        }),
      ]),
      skipDuplicates: true,
    });
  });

  it('should skip events that already exist in InitiativeStatusLog', async () => {
    const initId = testUuid('1');
    const eventDate = new Date('2026-01-15T10:00:00Z');

    mockedPrisma.auditEvent.count.mockResolvedValue(1);
    mockedPrisma.initiativeStatusLog.findMany.mockResolvedValue([
      {
        initiativeId: initId,
        transitionedAt: eventDate,
      } as any,
    ]);
    mockedPrisma.auditEvent.findMany.mockResolvedValueOnce([
      {
        id: testUuid('evt1'),
        actorId: null,
        entityType: 'Initiative',
        entityId: initId,
        action: 'status_transition',
        payload: {
          fromStatus: InitiativeStatus.PROPOSED,
          toStatus: InitiativeStatus.SCOPING,
        },
        ipAddress: null,
        createdAt: eventDate,
      },
    ]).mockResolvedValueOnce([]);

    const job = createMockJob();
    const result = await processStatusLogBackfill(job);

    expect(result.processed).toBe(1);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockedPrisma.initiativeStatusLog.createMany).not.toHaveBeenCalled();
  });

  it('should skip events with missing fromStatus or toStatus in payload', async () => {
    mockedPrisma.auditEvent.count.mockResolvedValue(1);
    mockedPrisma.initiativeStatusLog.findMany.mockResolvedValue([]);
    mockedPrisma.auditEvent.findMany.mockResolvedValueOnce([
      {
        id: testUuid('evt1'),
        actorId: null,
        entityType: 'Initiative',
        entityId: testUuid('1'),
        action: 'status_transition',
        payload: { someOtherField: 'value' },
        ipAddress: null,
        createdAt: new Date('2026-01-15T10:00:00Z'),
      },
    ]).mockResolvedValueOnce([]);

    const job = createMockJob();
    const result = await processStatusLogBackfill(job);

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.inserted).toBe(0);
  });

  it('should fall back to individual inserts when createMany fails', async () => {
    const initId = testUuid('1');

    mockedPrisma.auditEvent.count.mockResolvedValue(1);
    mockedPrisma.initiativeStatusLog.findMany.mockResolvedValue([]);
    mockedPrisma.auditEvent.findMany.mockResolvedValueOnce([
      {
        id: testUuid('evt1'),
        actorId: null,
        entityType: 'Initiative',
        entityId: initId,
        action: 'status_transition',
        payload: {
          fromStatus: InitiativeStatus.PROPOSED,
          toStatus: InitiativeStatus.SCOPING,
        },
        ipAddress: null,
        createdAt: new Date('2026-01-15T10:00:00Z'),
      },
    ]).mockResolvedValueOnce([]);

    mockedPrisma.initiativeStatusLog.createMany.mockRejectedValue(new Error('createMany failed'));
    mockedPrisma.initiativeStatusLog.create.mockResolvedValue({} as any);

    const job = createMockJob();
    const result = await processStatusLogBackfill(job);

    expect(result.inserted).toBe(1);
    expect(mockedPrisma.initiativeStatusLog.create).toHaveBeenCalledTimes(1);
  });

  it('should report progress during processing', async () => {
    mockedPrisma.auditEvent.count.mockResolvedValue(1);
    mockedPrisma.initiativeStatusLog.findMany.mockResolvedValue([]);
    mockedPrisma.auditEvent.findMany.mockResolvedValueOnce([
      {
        id: testUuid('evt1'),
        actorId: null,
        entityType: 'Initiative',
        entityId: testUuid('1'),
        action: 'status_transition',
        payload: {
          fromStatus: InitiativeStatus.PROPOSED,
          toStatus: InitiativeStatus.SCOPING,
        },
        ipAddress: null,
        createdAt: new Date('2026-01-15T10:00:00Z'),
      },
    ]).mockResolvedValueOnce([]);

    mockedPrisma.initiativeStatusLog.createMany.mockResolvedValue({ count: 1 });

    const job = createMockJob();
    await processStatusLogBackfill(job);

    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });
});
