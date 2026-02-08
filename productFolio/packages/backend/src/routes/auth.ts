import { FastifyInstance } from 'fastify';
import * as authService from '../services/auth.service.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/auth/me
   * Get current authenticated user
   */
  fastify.get(
    '/api/auth/me',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const user = await authService.getUserById(request.user.sub);
      return reply.send({ user });
    }
  );
}
