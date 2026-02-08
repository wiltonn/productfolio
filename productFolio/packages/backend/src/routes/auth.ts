import { FastifyInstance } from 'fastify';
import * as authService from '../services/auth.service.js';
import { prisma } from '../lib/prisma.js';
import { deriveSeatType } from '../lib/permissions.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/auth/me
   * Get current authenticated user with permissions and entitlement info.
   * Permissions come from the JWT claim if present, otherwise derived from role.
   */
  fastify.get(
    '/api/auth/me',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const userResponse = await authService.getUserWithPermissions(request.user.sub);

      // If the JWT had real permissions, prefer those over role-derived
      const permissions =
        request.user.permissions.length > 0
          ? request.user.permissions
          : userResponse.permissions;

      const seatType = deriveSeatType(permissions);
      let tier = 'starter';
      try {
        const tenantConfig = await prisma.tenantConfig.findFirst();
        tier = tenantConfig?.tier ?? 'starter';
      } catch {
        // tenant_config table may not exist yet
      }

      return reply.send({
        user: {
          ...userResponse,
          permissions,
          seatType,
          licensed: seatType === 'decision',
          tier,
        },
      });
    }
  );
}
