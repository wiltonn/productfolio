import fp from 'fastify-plugin';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@prisma/client';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';
import { findOrProvisionUser } from '../services/auth.service.js';
import { permissionsForRole, deriveSeatType, SeatType } from '../lib/permissions.js';

const PERMISSIONS_CLAIM = 'https://productfolio.local/permissions';

export interface JwtPayload {
  sub: string; // local user id
  email: string;
  role: UserRole;
  permissions: string[];
  seatType: SeatType;
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
    requirePermission: (
      permission: string
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAnyPermission: (
      permissions: string[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireSeat: (
      seatType: SeatType
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
   * Extracts permissions from the namespaced claim, falling back to
   * role-derived permissions when the claim is absent.
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

        // Merge JWT claim permissions with role-derived permissions.
        // Role-derived permissions are always included so that local role
        // changes (e.g. authority:admin) take effect without updating Auth0.
        const claimPermissions = payload[PERMISSIONS_CLAIM];
        const rolePermissions = permissionsForRole(localUser.role);
        let permissions: string[];
        if (Array.isArray(claimPermissions) && claimPermissions.length > 0) {
          permissions = [...new Set([...claimPermissions as string[], ...rolePermissions])];
        } else {
          permissions = rolePermissions;
        }

        const seatType = deriveSeatType(permissions);

        request.user = {
          sub: localUser.id,
          email: localUser.email,
          role: localUser.role,
          permissions,
          seatType,
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
   * Decorator factory to authorize specific roles (legacy — kept for backward compat)
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

  /**
   * Decorator factory that requires a single permission string.
   * Checks request.user.permissions (populated by authenticate).
   */
  fastify.decorate('requirePermission', function (permission: string) {
    return async function (request: FastifyRequest, _reply: FastifyReply) {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }

      if (!request.user.permissions.includes(permission)) {
        throw new ForbiddenError(
          `Access denied. Required permission: ${permission}`
        );
      }
    };
  });

  /**
   * Decorator factory that requires at least one of the given permissions.
   */
  fastify.decorate('requireAnyPermission', function (permissions: string[]) {
    return async function (request: FastifyRequest, _reply: FastifyReply) {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }

      if (!permissions.some((p) => request.user.permissions.includes(p))) {
        throw new ForbiddenError(
          `Access denied. Required one of: ${permissions.join(', ')}`
        );
      }
    };
  });

  /**
   * Decorator factory that requires a specific seat type (entitlement check).
   * Records a RevOps event on blocked attempts for expansion signal tracking.
   */
  fastify.decorate('requireSeat', function (requiredSeat: SeatType) {
    return async function (request: FastifyRequest, _reply: FastifyReply) {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }
      if (request.user.seatType !== requiredSeat) {
        // Fire-and-forget RevOps telemetry for expansion signal tracking
        import('../services/entitlement.service.js').then(({ entitlementService }) => {
          entitlementService.recordEvent({
            eventName: 'decision_seat_blocked',
            userId: request.user.sub,
            seatType: request.user.seatType,
            metadata: { requiredSeat, route: request.url, method: request.method },
          }).catch(() => {}); // non-blocking
        });
        throw new ForbiddenError('Decision seat license required for this action');
      }
    };
  });
}

export default fp(authPlugin, {
  name: 'auth',
});
