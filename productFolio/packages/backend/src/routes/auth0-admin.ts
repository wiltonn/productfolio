import { FastifyInstance } from 'fastify';
import { auth0ManagementService } from '../services/auth0-management.service.js';

export async function auth0AdminRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication + ADMIN role
  fastify.addHook('onRequest', fastify.authenticate);

  /**
   * POST /api/admin/auth0/sync-roles
   * One-time setup: create Auth0 roles matching local ROLE_PERMISSIONS.
   */
  fastify.post(
    '/api/admin/auth0/sync-roles',
    { preHandler: [fastify.authorize(['ADMIN'])] },
    async (_request, reply) => {
      const result = await auth0ManagementService.syncRolesToAuth0();
      return reply.send(result);
    }
  );

  /**
   * POST /api/admin/auth0/sync-user/:userId
   * Sync a single user's local role to Auth0.
   */
  fastify.post<{ Params: { userId: string } }>(
    '/api/admin/auth0/sync-user/:userId',
    { preHandler: [fastify.authorize(['ADMIN'])] },
    async (request, reply) => {
      const result = await auth0ManagementService.syncUserToAuth0(
        request.params.userId
      );
      return reply.send(result);
    }
  );

  /**
   * POST /api/admin/auth0/sync-all-users
   * Bulk sync all active users with Auth0 identities.
   */
  fastify.post(
    '/api/admin/auth0/sync-all-users',
    { preHandler: [fastify.authorize(['ADMIN'])] },
    async (_request, reply) => {
      const result = await auth0ManagementService.syncAllUsersToAuth0();
      return reply.send(result);
    }
  );
}
