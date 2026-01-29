import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { InitiativeStatus, UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { registerErrorHandler } from '../lib/error-handler.js';
import authPlugin from '../plugins/auth.plugin.js';
import { authRoutes } from '../routes/auth.js';
import { initiativesRoutes } from '../routes/initiatives.js';
import { scopingRoutes } from '../routes/scoping.js';
import { resourcesRoutes } from '../routes/resources.js';
import { scenariosRoutes } from '../routes/scenarios.js';
import cookie from '@fastify/cookie';

describe('API Integration Tests', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let plannerToken: string;
  let viewerToken: string;
  let testUserId: string;
  let testInitiativeId: string;
  let testEmployeeId: string;
  let testScenarioId: string;

  beforeAll(async () => {
    // Build test app with all routes
    app = Fastify({ logger: false });

    await app.register(cookie);
    await app.register(authPlugin);
    registerErrorHandler(app);

    await app.register(authRoutes);
    await app.register(initiativesRoutes);
    await app.register(scopingRoutes);
    await app.register(resourcesRoutes);
    await app.register(scenariosRoutes);

    await app.ready();

    // Create test users
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin-api-test@test.com',
        name: 'Admin Test User',
        passwordHash: await import('argon2').then((m) =>
          m.default.hash('password123')
        ),
        role: UserRole.ADMIN,
      },
    });
    testUserId = adminUser.id;

    const plannerUser = await prisma.user.create({
      data: {
        email: 'planner-api-test@test.com',
        name: 'Planner Test User',
        passwordHash: await import('argon2').then((m) =>
          m.default.hash('password123')
        ),
        role: UserRole.PLANNER,
      },
    });

    const viewerUser = await prisma.user.create({
      data: {
        email: 'viewer-api-test@test.com',
        name: 'Viewer Test User',
        passwordHash: await import('argon2').then((m) =>
          m.default.hash('password123')
        ),
        role: UserRole.VIEWER,
      },
    });

    // Get tokens
    adminToken = app.jwt.sign({
      sub: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
    });

    plannerToken = app.jwt.sign({
      sub: plannerUser.id,
      email: plannerUser.email,
      role: plannerUser.role,
    });

    viewerToken = app.jwt.sign({
      sub: viewerUser.id,
      email: viewerUser.email,
      role: viewerUser.role,
    });

    // Create test data
    testEmployeeId = (
      await prisma.employee.create({
        data: {
          name: 'Test Employee',
          email: 'employee@test.com',
          role: 'Developer',
          employmentType: 'FULL_TIME',
          hoursPerWeek: 40,
          skills: { frontend: 3, backend: 4 },
        },
      })
    ).id;

    testInitiativeId = (
      await prisma.initiative.create({
        data: {
          title: 'Test Initiative',
          description: 'Test Description',
          status: InitiativeStatus.PROPOSED,
          businessOwnerId: adminUser.id,
          productOwnerId: adminUser.id,
          targetQuarter: null,
        },
      })
    ).id;

    testScenarioId = (
      await prisma.scenario.create({
        data: {
          name: 'Test Scenario',
          periodIds: [],
        },
      })
    ).id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.allocation.deleteMany({
      where: { scenarioId: testScenarioId },
    });
    await prisma.scopeItem.deleteMany({
      where: { initiativeId: testInitiativeId },
    });
    await prisma.scenario.deleteMany({
      where: { id: testScenarioId },
    });
    await prisma.initiative.deleteMany({
      where: { id: testInitiativeId },
    });
    await prisma.employee.deleteMany({
      where: { id: testEmployeeId },
    });
    await prisma.refreshToken.deleteMany({
      where: {
        userId: { in: [testUserId] },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'admin-api-test@test.com',
            'planner-api-test@test.com',
            'viewer-api-test@test.com',
          ],
        },
      },
    });

    await app.close();
  });

  describe('Authentication API', () => {
    it('POST /api/auth/login - should login with valid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'admin-api-test@test.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe('admin-api-test@test.com');

      // Should set cookies
      const cookies = response.cookies;
      expect(cookies.some((c) => c.name === 'access_token')).toBe(true);
      expect(cookies.some((c) => c.name === 'refresh_token')).toBe(true);
    });

    it('POST /api/auth/login - should reject invalid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'admin-api-test@test.com',
          password: 'wrongpassword',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('POST /api/auth/login - should validate email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'invalid-email',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('GET /api/auth/me - should return current user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { access_token: adminToken },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user.email).toBe('admin-api-test@test.com');
    });

    it('GET /api/auth/me - should reject without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Initiatives API', () => {
    it('GET /api/initiatives - should list initiatives with pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/initiatives?page=1&limit=20',
        cookies: { access_token: adminToken },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(20);
      expect(body.pagination.total).toBeGreaterThanOrEqual(0);
    });

    it('GET /api/initiatives - should filter by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/initiatives?status=PROPOSED',
        cookies: { access_token: adminToken },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      body.data.forEach((initiative: any) => {
        expect(initiative.status).toBe('PROPOSED');
      });
    });

    it('GET /api/initiatives - should search by title', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/initiatives?search=Test',
        cookies: { access_token: adminToken },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
    });

    it('GET /api/initiatives/:id - should get initiative by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/initiatives/${testInitiativeId}`,
        cookies: { access_token: adminToken },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(testInitiativeId);
      expect(body.title).toBe('Test Initiative');
    });

    it('GET /api/initiatives/:id - should return 404 for non-existent id', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000999';
      const response = await app.inject({
        method: 'GET',
        url: `/api/initiatives/${fakeId}`,
        cookies: { access_token: adminToken },
      });

      expect(response.statusCode).toBe(404);
    });

    it('POST /api/initiatives - should create initiative', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/initiatives',
        cookies: { access_token: adminToken },
        payload: {
          title: 'New API Test Initiative',
          description: 'Created via API test',
          businessOwnerId: testUserId,
          productOwnerId: testUserId,
          targetPeriodId: null,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('New API Test Initiative');
      expect(body.status).toBe(InitiativeStatus.PROPOSED);

      // Clean up
      await prisma.initiative.delete({ where: { id: body.id } });
    });

    it('POST /api/initiatives - should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/initiatives',
        cookies: { access_token: adminToken },
        payload: {
          // Missing required fields
          description: 'Missing title',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('PUT /api/initiatives/:id - should update initiative', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/initiatives/${testInitiativeId}`,
        cookies: { access_token: adminToken },
        payload: {
          title: 'Updated Title',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Updated Title');
    });

    it('POST /api/initiatives/:id/transition - should transition status', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/initiatives/${testInitiativeId}/transition`,
        cookies: { access_token: adminToken },
        payload: {
          newStatus: InitiativeStatus.SCOPING,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe(InitiativeStatus.SCOPING);
    });

    it('POST /api/initiatives/:id/transition - should reject invalid transition', async () => {
      // Reset to PROPOSED first
      await prisma.initiative.update({
        where: { id: testInitiativeId },
        data: { status: InitiativeStatus.PROPOSED },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/initiatives/${testInitiativeId}/transition`,
        cookies: { access_token: adminToken },
        payload: {
          newStatus: InitiativeStatus.IN_EXECUTION, // Invalid from PROPOSED
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('GET /api/initiatives/export - should export CSV', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/initiatives/export',
        cookies: { access_token: adminToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.body).toContain('id,title,description');
    });
  });

  describe('Scoping API', () => {
    it('GET /api/initiatives/:id/scope-items - should list scope items', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/initiatives/${testInitiativeId}/scope-items`,
        cookies: { access_token: adminToken },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it('POST /api/initiatives/:id/scope-items - should create scope item', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/initiatives/${testInitiativeId}/scope-items`,
        cookies: { access_token: adminToken },
        payload: {
          name: 'Test Scope Item',
          description: 'API Test Scope',
          skillDemand: { frontend: 2, backend: 3 },
          estimateP50: 100,
          estimateP90: 150,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('Test Scope Item');
      expect(body.skillDemand).toEqual({ frontend: 2, backend: 3 });

      // Clean up
      await prisma.scopeItem.delete({ where: { id: body.id } });
    });

    it('POST /api/initiatives/:id/scope-items - should validate estimates', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/initiatives/${testInitiativeId}/scope-items`,
        cookies: { access_token: adminToken },
        payload: {
          name: 'Invalid Estimates',
          estimateP50: 150,
          estimateP90: 100, // P90 should be >= P50
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Resources API', () => {
    it('GET /api/employees - should list employees', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/employees',
        cookies: { access_token: adminToken },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination).toBeDefined();
    });

    it('GET /api/employees/:id - should get employee by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/employees/${testEmployeeId}`,
        cookies: { access_token: adminToken },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(testEmployeeId);
      expect(body.name).toBe('Test Employee');
    });

    it('POST /api/employees - should create employee', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/employees',
        cookies: { access_token: adminToken },
        payload: {
          name: 'New Test Employee',
          email: 'newemployee@test.com',
          role: 'Designer',
          employmentType: 'FULL_TIME',
          hoursPerWeek: 40,
          skills: { design: 5, frontend: 3 },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('New Test Employee');

      // Clean up
      await prisma.employee.delete({ where: { id: body.id } });
    });

    it('POST /api/employees - should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/employees',
        cookies: { access_token: adminToken },
        payload: {
          name: 'Incomplete Employee',
          // Missing required fields
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Scenarios API', () => {
    it('GET /api/scenarios - should list scenarios', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/scenarios',
        cookies: { access_token: plannerToken },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('GET /api/scenarios/:id - should get scenario by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/scenarios/${testScenarioId}`,
        cookies: { access_token: plannerToken },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(testScenarioId);
      expect(body.name).toBe('Test Scenario');
    });

    it('POST /api/scenarios - should create scenario', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/scenarios',
        cookies: { access_token: plannerToken },
        payload: {
          name: 'API Test Scenario',
          periodIds: [],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('API Test Scenario');

      // Clean up
      await prisma.scenario.delete({ where: { id: body.id } });
    });

    it('POST /api/scenarios/:id/allocations - should create allocation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/scenarios/${testScenarioId}/allocations`,
        cookies: { access_token: plannerToken },
        payload: {
          employeeId: testEmployeeId,
          initiativeId: testInitiativeId,
          startDate: '2024-01-01',
          endDate: '2024-03-31',
          percentage: 50,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.percentage).toBe(50);

      // Clean up
      await prisma.allocation.delete({ where: { id: body.id } });
    });

    it('POST /api/scenarios/:id/allocations - should validate percentage', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/scenarios/${testScenarioId}/allocations`,
        cookies: { access_token: plannerToken },
        payload: {
          employeeId: testEmployeeId,
          initiativeId: testInitiativeId,
          startDate: '2024-01-01',
          endDate: '2024-03-31',
          percentage: 150, // Invalid percentage
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Authorization', () => {
    it('should allow VIEWER to read initiatives', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/initiatives',
        cookies: { access_token: viewerToken },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should prevent VIEWER from creating initiatives', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/initiatives',
        cookies: { access_token: viewerToken },
        payload: {
          title: 'Unauthorized Initiative',
          businessOwnerId: testUserId,
          productOwnerId: testUserId,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should allow PLANNER to create scenarios', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/scenarios',
        cookies: { access_token: plannerToken },
        payload: {
          name: 'Planner Scenario',
          periodIds: [],
        },
      });

      expect(response.statusCode).toBe(201);

      // Clean up
      const body = JSON.parse(response.body);
      await prisma.scenario.delete({ where: { id: body.id } });
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for malformed JSON', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/initiatives',
        cookies: { access_token: adminToken },
        payload: '{invalid json}',
        headers: {
          'content-type': 'application/json',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/initiatives/not-a-uuid',
        cookies: { access_token: adminToken },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle concurrent updates gracefully', async () => {
      // Create multiple concurrent update requests
      const updates = Array.from({ length: 5 }, (_, i) =>
        app.inject({
          method: 'PUT',
          url: `/api/initiatives/${testInitiativeId}`,
          cookies: { access_token: adminToken },
          payload: {
            title: `Concurrent Update ${i}`,
          },
        })
      );

      const responses = await Promise.all(updates);

      // All should succeed
      responses.forEach((response) => {
        expect(response.statusCode).toBe(200);
      });
    });
  });

  describe('Pagination and Filtering', () => {
    it('should respect pagination limits', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/initiatives?page=1&limit=5',
        cookies: { access_token: adminToken },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBeLessThanOrEqual(5);
    });

    it('should validate pagination parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/initiatives?page=0&limit=-5',
        cookies: { access_token: adminToken },
      });

      // Should either reject or normalize parameters
      expect([200, 400]).toContain(response.statusCode);
    });

    it('should handle large page numbers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/initiatives?page=9999&limit=20',
        cookies: { access_token: adminToken },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual([]);
    });
  });
});
