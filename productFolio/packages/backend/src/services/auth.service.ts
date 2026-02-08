import { prisma } from '../lib/prisma.js';
import { UserRole } from '@prisma/client';
import { NotFoundError } from '../lib/errors.js';
import type { UserResponse } from '../schemas/auth.schema.js';
import { permissionsForRole } from '../lib/permissions.js';

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;

// In-memory cache for Auth0 userinfo (keyed by auth0Sub)
const userinfoCache = new Map<
  string,
  { email: string; name: string; fetchedAt: number }
>();
const USERINFO_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Transform user from database to response (exclude sensitive fields)
 */
function toUserResponse(
  user: Awaited<ReturnType<typeof prisma.user.findUnique>> & object
): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Fetch email/name from Auth0 /userinfo endpoint.
 * Results are cached in memory to avoid repeated calls.
 */
async function fetchAuth0UserInfo(
  auth0Sub: string,
  accessToken: string
): Promise<{ email?: string; name?: string }> {
  // Check cache first
  const cached = userinfoCache.get(auth0Sub);
  if (cached && Date.now() - cached.fetchedAt < USERINFO_CACHE_TTL) {
    return { email: cached.email, name: cached.name };
  }

  if (!AUTH0_DOMAIN) {
    return {};
  }

  try {
    const response = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return {};
    }

    const data = (await response.json()) as {
      email?: string;
      name?: string;
      nickname?: string;
    };

    const email = data.email;
    const name = data.name || data.nickname;

    if (email && name) {
      userinfoCache.set(auth0Sub, {
        email,
        name,
        fetchedAt: Date.now(),
      });
    }

    return { email, name };
  } catch {
    return {};
  }
}

/**
 * Find or provision a local user from Auth0 identity.
 *
 * 1. Look up by auth0Sub → return if found
 * 2. Look up by email → if found, link by setting auth0Sub (migration path)
 * 3. If neither → create new user with VIEWER role
 * 4. Update lastLoginAt
 */
export async function findOrProvisionUser(
  auth0Sub: string,
  email?: string,
  name?: string,
  accessToken?: string
): Promise<{
  id: string;
  email: string;
  role: UserRole;
}> {
  // 1. Look up by auth0Sub
  const existingByAuth0 = await prisma.user.findUnique({
    where: { auth0Sub },
  });

  if (existingByAuth0) {
    // Update lastLoginAt
    await prisma.user.update({
      where: { id: existingByAuth0.id },
      data: { lastLoginAt: new Date() },
    });
    return {
      id: existingByAuth0.id,
      email: existingByAuth0.email,
      role: existingByAuth0.role,
    };
  }

  // If no email from token claims, fetch from Auth0 userinfo
  let resolvedEmail = email;
  let resolvedName = name;
  if ((!resolvedEmail || !resolvedName) && accessToken) {
    const userInfo = await fetchAuth0UserInfo(auth0Sub, accessToken);
    resolvedEmail = resolvedEmail || userInfo.email;
    resolvedName = resolvedName || userInfo.name;
  }

  // 2. Look up by email → link existing user
  if (resolvedEmail) {
    const existingByEmail = await prisma.user.findUnique({
      where: { email: resolvedEmail },
    });

    if (existingByEmail) {
      const updated = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          auth0Sub,
          lastLoginAt: new Date(),
          ...(resolvedName && !existingByEmail.name
            ? { name: resolvedName }
            : {}),
        },
      });
      return { id: updated.id, email: updated.email, role: updated.role };
    }
  }

  // 3. Create new user
  const newUser = await prisma.user.create({
    data: {
      email: resolvedEmail || `${auth0Sub}@auth0.placeholder`,
      name: resolvedName || 'Auth0 User',
      auth0Sub,
      role: UserRole.VIEWER,
      lastLoginAt: new Date(),
    },
  });

  return { id: newUser.id, email: newUser.email, role: newUser.role };
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<UserResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User', userId);
  }

  return toUserResponse(user);
}

/**
 * Get user by ID with permissions derived from role.
 * Used by /api/auth/me to return the full user profile including permissions.
 */
export async function getUserWithPermissions(userId: string): Promise<UserResponse & { permissions: string[] }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User', userId);
  }

  return {
    ...toUserResponse(user),
    permissions: permissionsForRole(user.role),
  };
}
