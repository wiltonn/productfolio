import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testUuid } from './setup.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRedis = {
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
};

vi.mock('../lib/redis.js', () => ({
  getRedisClient: () => mockRedis,
  getCachedData: vi.fn(),
  setCachedData: vi.fn(),
  deleteKey: vi.fn(),
  CACHE_KEYS: { scenarioCalculation: (id: string) => `scenario:${id}:calculations` },
  CACHE_TTL: { CALCULATION: 300 },
}));

vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    featureFlag: {
      findUnique: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import { prisma } from '../lib/prisma.js';

const mockPrisma = prisma as any;

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Set env vars before importing the service
process.env.AUTH0_DOMAIN = 'test-tenant.auth0.com';
process.env.AUTH0_MGMT_CLIENT_ID = 'test-client-id';
process.env.AUTH0_MGMT_CLIENT_SECRET = 'test-client-secret';

// Import once — singleton module is cached by ESM
import { auth0ManagementService } from '../services/auth0-management.service.js';

// Helper: set up a mock token response so each test starts fresh
function mockTokenResponse(token = 'mgmt-token') {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      access_token: token,
      expires_in: 86400,
      token_type: 'Bearer',
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Auth0ManagementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    // Clear the singleton's cached token so each test starts fresh
    auth0ManagementService.clearTokenCache();
  });

  describe('getManagementToken()', () => {
    it('fetches a new token via client_credentials grant', async () => {
      mockTokenResponse('test-mgmt-token');

      const token = await auth0ManagementService.getManagementToken();

      expect(token).toBe('test-mgmt-token');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-tenant.auth0.com/oauth/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.grant_type).toBe('client_credentials');
      expect(callBody.client_id).toBe('test-client-id');
      expect(callBody.client_secret).toBe('test-client-secret');
    });

    it('returns cached token on subsequent calls', async () => {
      mockTokenResponse('cached-token');

      const token1 = await auth0ManagementService.getManagementToken();
      const token2 = await auth0ManagementService.getManagementToken();

      expect(token1).toBe('cached-token');
      expect(token2).toBe('cached-token');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws ValidationError when token request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(
        auth0ManagementService.getManagementToken()
      ).rejects.toThrow('Auth0 token request failed (401)');
    });
  });

  describe('syncRolesToAuth0()', () => {
    it('creates roles that do not exist in Auth0', async () => {
      mockTokenResponse();

      // listRoles (page 0) — ADMIN already exists
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          roles: [{ id: 'role-1', name: 'ADMIN', description: 'Admin' }],
          total: 1,
        }),
      });

      // Create role calls — use default resolved for remaining
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'new-role', name: 'created' }),
      });

      const result = await auth0ManagementService.syncRolesToAuth0();

      expect(result.existing).toContain('ADMIN');
      expect(result.created).toContain('PRODUCT_OWNER');
      expect(result.created).toContain('BUSINESS_OWNER');
      expect(result.created).toContain('RESOURCE_MANAGER');
      expect(result.created).toContain('VIEWER');
    });
  });

  describe('assignRoleToUser()', () => {
    it('calls the correct Auth0 endpoint to assign a role', async () => {
      mockTokenResponse();

      // findRoleByName — returns array (Auth0 roles filter endpoint)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'role-abc', name: 'ADMIN', description: 'Admin' }],
      });

      // assignRole POST
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

      await auth0ManagementService.assignRoleToUser('auth0|abc123', 'ADMIN');

      // Call #2 (index 2) should be the assignment
      const assignCall = mockFetch.mock.calls[2];
      expect(assignCall[0]).toBe(
        'https://test-tenant.auth0.com/api/v2/users/auth0%7Cabc123/roles'
      );
      expect(assignCall[1].method).toBe('POST');
      const body = JSON.parse(assignCall[1].body);
      expect(body.roles).toEqual(['role-abc']);
    });

    it('throws when Auth0 role not found', async () => {
      mockTokenResponse();

      // findRoleByName returns empty array
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await expect(
        auth0ManagementService.assignRoleToUser('auth0|abc123', 'NONEXISTENT')
      ).rejects.toThrow("Auth0 role 'NONEXISTENT' not found");
    });
  });

  describe('removeRoleFromUser()', () => {
    it('calls DELETE on the user roles endpoint', async () => {
      mockTokenResponse();

      // findRoleByName
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'role-xyz', name: 'VIEWER', description: 'Viewer' }],
      });

      // removeRole DELETE
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

      await auth0ManagementService.removeRoleFromUser('auth0|def456', 'VIEWER');

      const deleteCall = mockFetch.mock.calls[2];
      expect(deleteCall[0]).toBe(
        'https://test-tenant.auth0.com/api/v2/users/auth0%7Cdef456/roles'
      );
      expect(deleteCall[1].method).toBe('DELETE');
    });

    it('silently returns when role does not exist in Auth0', async () => {
      mockTokenResponse();

      // findRoleByName returns empty
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await auth0ManagementService.removeRoleFromUser('auth0|abc', 'NONEXISTENT');
      // token + find = 2 calls, no DELETE
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getUserRoles()', () => {
    it('returns roles for a user', async () => {
      mockTokenResponse();

      // getUserRoles — Auth0 returns plain array
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'r1', name: 'ADMIN', description: 'Admin' },
          { id: 'r2', name: 'VIEWER', description: 'Viewer' },
        ],
      });

      const roles = await auth0ManagementService.getUserRoles('auth0|abc123');
      expect(roles).toHaveLength(2);
      expect(roles[0].name).toBe('ADMIN');
    });

    it('throws on API failure', async () => {
      mockTokenResponse();

      // getUserRoles fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      await expect(
        auth0ManagementService.getUserRoles('auth0|bad')
      ).rejects.toThrow('Failed to get user roles (404)');
    });
  });

  describe('syncUserToAuth0()', () => {
    it('syncs a local user role to Auth0', async () => {
      const userId = testUuid('a00');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        email: 'admin@example.com',
        role: 'ADMIN',
        auth0Sub: 'auth0|admin1',
        isActive: true,
      });

      mockTokenResponse();

      // getUserRoles — returns existing VIEWER role
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'role-viewer', name: 'VIEWER', description: 'Viewer' },
        ],
      });

      // removeRoleFromUser: findRoleByName for VIEWER
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'role-viewer', name: 'VIEWER', description: 'Viewer' }],
      });

      // removeRoleFromUser: DELETE
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

      // assignRoleToUser: findRoleByName for ADMIN
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'role-admin', name: 'ADMIN', description: 'Admin' }],
      });

      // assignRoleToUser: POST
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

      const result = await auth0ManagementService.syncUserToAuth0(userId);

      expect(result.auth0Sub).toBe('auth0|admin1');
      expect(result.role).toBe('ADMIN');
    });

    it('throws when user has no Auth0 identity', async () => {
      const userId = testUuid('b00');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        email: 'noauth@example.com',
        role: 'VIEWER',
        auth0Sub: null,
      });

      await expect(
        auth0ManagementService.syncUserToAuth0(userId)
      ).rejects.toThrow('has no Auth0 identity linked');
    });

    it('throws when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        auth0ManagementService.syncUserToAuth0(testUuid('c00'))
      ).rejects.toThrow('not found');
    });
  });
});
