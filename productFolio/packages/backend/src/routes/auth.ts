import { FastifyInstance } from 'fastify';
import { UserRole } from '@prisma/client';
import {
  LoginSchema,
  RegisterSchema,
  ChangePasswordSchema,
} from '../schemas/auth.schema.js';
import * as authService from '../services/auth.service.js';
import type { JwtPayload } from '../plugins/auth.plugin.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/auth/login
   * Login with email and password
   */
  fastify.post<{
    Body: { email: string; password: string };
  }>('/api/auth/login', async (request, reply) => {
    const input = LoginSchema.parse(request.body);
    const { user, refreshToken } = await authService.login(input);

    // Generate access token
    const accessToken = fastify.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    } as JwtPayload);

    // Set cookies
    reply.setCookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });

    reply.setCookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    return reply.send({ user });
  });

  /**
   * POST /api/auth/register
   * Register a new user (admin only)
   */
  fastify.post<{
    Body: {
      email: string;
      name: string;
      password: string;
      role?: UserRole;
    };
  }>(
    '/api/auth/register',
    {
      onRequest: [
        fastify.authenticate,
        fastify.authorize([UserRole.ADMIN]),
      ],
    },
    async (request, reply) => {
      const input = RegisterSchema.parse(request.body);
      const user = await authService.register(input);
      return reply.status(201).send({ user });
    }
  );

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token
   */
  fastify.post('/api/auth/refresh', async (request, reply) => {
    const refreshTokenFromCookie = request.cookies['refresh_token'];

    if (!refreshTokenFromCookie) {
      return reply.status(401).send({ message: 'Refresh token required' });
    }

    const { user, refreshToken } = await authService.refresh(
      refreshTokenFromCookie
    );

    // Generate new access token
    const accessToken = fastify.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    } as JwtPayload);

    // Set new cookies
    reply.setCookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });

    reply.setCookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    return reply.send({ user });
  });

  /**
   * POST /api/auth/logout
   * Logout and revoke refresh token
   */
  fastify.post(
    '/api/auth/logout',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const refreshToken = request.cookies['refresh_token'];

      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      // Clear cookies
      reply.clearCookie('access_token', COOKIE_OPTIONS);
      reply.clearCookie('refresh_token', COOKIE_OPTIONS);

      return reply.send({ message: 'Logged out successfully' });
    }
  );

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

  /**
   * PUT /api/auth/password
   * Change password for current user
   */
  fastify.put<{
    Body: { currentPassword: string; newPassword: string };
  }>(
    '/api/auth/password',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const input = ChangePasswordSchema.parse(request.body);
      await authService.changePassword(request.user.sub, input);

      // Clear cookies to force re-login
      reply.clearCookie('access_token', COOKIE_OPTIONS);
      reply.clearCookie('refresh_token', COOKIE_OPTIONS);

      return reply.send({ message: 'Password changed successfully' });
    }
  );
}
