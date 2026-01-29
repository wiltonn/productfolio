import { FastifyInstance } from 'fastify';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/users
   * List all users (for owner selection dropdowns)
   */
  fastify.get<{
    Querystring: {
      role?: UserRole | UserRole[];
      search?: string;
    };
  }>(
    '/api/users',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { role, search } = request.query;

      const where: Record<string, unknown> = {
        isActive: true,
      };

      if (role) {
        where.role = Array.isArray(role) ? { in: role } : role;
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
        orderBy: { name: 'asc' },
      });

      return reply.send({ data: users });
    }
  );
}
