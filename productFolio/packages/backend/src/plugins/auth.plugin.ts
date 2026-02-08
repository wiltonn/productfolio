import fp from 'fastify-plugin';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@prisma/client';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';
import { findOrProvisionUser } from '../services/auth.service.js';

export interface JwtPayload {
  sub: string; // local user id
  email: string;
  role: UserRole;
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
  interface FastifyRequest {
    user: JwtPayload;
  }
}

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

async function authPlugin(fastify: FastifyInstance): Promise<void> {
  if (!AUTH0_DOMAIN) {
    throw new Error('AUTH0_DOMAIN environment variable is required');
  }
  if (!AUTH0_AUDIENCE) {
    throw new Error('AUTH0_AUDIENCE environment variable is required');
  }

  const JWKS = createRemoteJWKSet(
    new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
  );

  const issuer = `https://${AUTH0_DOMAIN}/`;

  /**
   * Decorator to authenticate requests.
   * Verifies Auth0 RS256 JWT from Authorization: Bearer header.
   */
  fastify.decorate(
    'authenticate',
    async function (request: FastifyRequest, _reply: FastifyReply) {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          throw new UnauthorizedError('Access token required');
        }

        const token = authHeader.slice(7);

        const { payload } = await jwtVerify(token, JWKS, {
          issuer,
          audience: AUTH0_AUDIENCE,
        });

        const auth0Sub = payload.sub;
        if (!auth0Sub) {
          throw new UnauthorizedError('Invalid token: missing sub claim');
        }

        // Extract email/name from custom claims if present, otherwise fetch from userinfo
        const email =
          (payload['https://productfolio.local/email'] as string) ||
          (payload.email as string) ||
          undefined;
        const name =
          (payload['https://productfolio.local/name'] as string) ||
          (payload.name as string) ||
          undefined;

        // Look up or provision local user
        const localUser = await findOrProvisionUser(
          auth0Sub,
          email,
          name,
          token
        );

        request.user = {
          sub: localUser.id,
          email: localUser.email,
          role: localUser.role,
        };
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
});
