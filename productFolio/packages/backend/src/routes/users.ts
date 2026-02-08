import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../lib/errors.js';
import { permissionsForRole, deriveSeatType } from '../lib/permissions.js';
import {
  CreateUserSchema,
  UpdateUserSchema,
  UserListQuerySchema,
} from '../schemas/user.schema.js';

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/users
   * List users with pagination, search, role filter.
   * Authenticated users see active users only.
   * Admin callers with ?includeInactive=true see all users.
   */
  fastify.get(
    '/api/users',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const query = UserListQuerySchema.parse(request.query);
      const { role, search, includeInactive, page, limit } = query;

      const isAdmin = request.user.permissions.includes('authority:admin');

      const where: Record<string, unknown> = {};

      // Only admin can see inactive users
      if (!isAdmin || !includeInactive) {
        where.isActive = true;
      }

      if (role) {
        where.role = role;
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            auth0Sub: true,
            lastLoginAt: true,
            createdAt: true,
          },
          orderBy: { name: 'asc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.user.count({ where }),
      ]);

      const data = users.map((u) => {
        const perms = permissionsForRole(u.role);
        return {
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          isActive: u.isActive,
          auth0Linked: !!u.auth0Sub,
          seatType: deriveSeatType(perms),
          lastLoginAt: u.lastLoginAt,
          createdAt: u.createdAt,
        };
      });

      return reply.send({
        data,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      });
    }
  );

  /**
   * GET /api/users/:id
   * Single user detail (admin only)
   */
  fastify.get<{ Params: { id: string } }>(
    '/api/users/:id',
    {
      onRequest: [fastify.authenticate],
      preHandler: [fastify.requirePermission('authority:admin')],
    },
    async (request, reply) => {
      const { id } = request.params;

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          auth0Sub: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new NotFoundError('User', id);
      }

      const permissions = permissionsForRole(user.role);
      const seatType = deriveSeatType(permissions);

      return reply.send({
        ...user,
        auth0Linked: !!user.auth0Sub,
        auth0Sub: undefined,
        permissions,
        seatType,
      });
    }
  );

  /**
   * POST /api/users
   * Create a new user (admin + decision seat)
   */
  fastify.post(
    '/api/users',
    {
      onRequest: [fastify.authenticate],
      preHandler: [
        fastify.requirePermission('authority:admin'),
        fastify.requireSeat('decision'),
      ],
    },
    async (request, reply) => {
      const body = CreateUserSchema.parse(request.body);

      // Check email uniqueness
      const existing = await prisma.user.findUnique({
        where: { email: body.email },
      });
      if (existing) {
        throw new ConflictError(`A user with email '${body.email}' already exists`);
      }

      const user = await prisma.user.create({
        data: {
          email: body.email,
          name: body.name,
          role: body.role,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      const permissions = permissionsForRole(user.role);

      return reply.status(201).send({
        ...user,
        auth0Linked: false,
        seatType: deriveSeatType(permissions),
      });
    }
  );

  /**
   * PUT /api/users/:id
   * Update user name/role/isActive (admin + decision seat)
   */
  fastify.put<{ Params: { id: string } }>(
    '/api/users/:id',
    {
      onRequest: [fastify.authenticate],
      preHandler: [
        fastify.requirePermission('authority:admin'),
        fastify.requireSeat('decision'),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = UpdateUserSchema.parse(request.body);

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError('User', id);
      }

      // Self-protection guards
      if (id === request.user.sub) {
        if (body.role !== undefined && body.role !== existing.role) {
          throw new ValidationError('Cannot change your own role');
        }
        if (body.isActive === false) {
          throw new ValidationError('Cannot deactivate your own account');
        }
      }

      const user = await prisma.user.update({
        where: { id },
        data: body,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          auth0Sub: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });

      const permissions = permissionsForRole(user.role);

      return reply.send({
        ...user,
        auth0Linked: !!user.auth0Sub,
        auth0Sub: undefined,
        seatType: deriveSeatType(permissions),
      });
    }
  );

  /**
   * DELETE /api/users/:id
   * Soft-delete: sets isActive=false (admin + decision seat)
   */
  fastify.delete<{ Params: { id: string } }>(
    '/api/users/:id',
    {
      onRequest: [fastify.authenticate],
      preHandler: [
        fastify.requirePermission('authority:admin'),
        fastify.requireSeat('decision'),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError('User', id);
      }

      // Self-deactivation guard
      if (id === request.user.sub) {
        throw new ValidationError('Cannot deactivate your own account');
      }

      await prisma.user.update({
        where: { id },
        data: { isActive: false },
      });

      return reply.status(204).send();
    }
  );
}
