import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@prisma/client';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    authorize: (
      roles: UserRole[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

async function authPlugin(fastify: FastifyInstance): Promise<void> {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  await fastify.register(fastifyJwt, {
    secret,
    cookie: {
      cookieName: 'access_token',
      signed: false,
    },
    sign: {
      expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
    },
  });

  /**
   * Decorator to authenticate requests
   * Verifies JWT from cookie or Authorization header
   */
  fastify.decorate(
    'authenticate',
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        // Try cookie first, then Authorization header
        const token =
          request.cookies['access_token'] ||
          request.headers.authorization?.replace('Bearer ', '');

        if (!token) {
          throw new UnauthorizedError('Access token required');
        }

        // Verify and decode the token
        const decoded = fastify.jwt.verify<JwtPayload>(token);
        request.user = decoded;
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          throw err;
        }
        throw new UnauthorizedError('Invalid or expired access token');
      }
    }
  );

  /**
   * Decorator factory to authorize specific roles
   */
  fastify.decorate('authorize', function (roles: UserRole[]) {
    return async function (request: FastifyRequest, _reply: FastifyReply) {
      // authenticate must be called first
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }

      if (!roles.includes(request.user.role)) {
        throw new ForbiddenError(
          `Access denied. Required roles: ${roles.join(', ')}`
        );
      }
    };
  });
}

export default fp(authPlugin, {
  name: 'auth',
  dependencies: ['@fastify/cookie'],
});
