import { prisma } from '../lib/prisma.js';
import {
  hashPassword,
  verifyPassword,
  generateRefreshToken,
  getTokenExpiry,
} from '../lib/auth.js';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../lib/errors.js';
import type {
  LoginInput,
  RegisterInput,
  ChangePasswordInput,
  UserResponse,
} from '../schemas/auth.schema.js';

const REFRESH_TOKEN_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

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
 * Login user and create refresh token
 */
export async function login(
  input: LoginInput
): Promise<{ user: UserResponse; refreshToken: string }> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isActive) {
    throw new ForbiddenError('Account is disabled');
  }

  const isValidPassword = await verifyPassword(input.password, user.passwordHash);
  if (!isValidPassword) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Generate refresh token
  const token = generateRefreshToken();
  const expiresAt = getTokenExpiry(REFRESH_TOKEN_EXPIRY);

  // Store refresh token in database
  await prisma.refreshToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt,
    },
  });

  // Update last login time
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    user: toUserResponse(user),
    refreshToken: token,
  };
}

/**
 * Register a new user (admin only)
 */
export async function register(input: RegisterInput): Promise<UserResponse> {
  // Check if user already exists
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existing) {
    throw new ConflictError('User with this email already exists');
  }

  // Hash password
  const passwordHash = await hashPassword(input.password);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash,
      role: input.role,
    },
  });

  return toUserResponse(user);
}

/**
 * Refresh access token using refresh token
 * Also rotates the refresh token for security
 */
export async function refresh(
  token: string
): Promise<{ user: UserResponse; refreshToken: string }> {
  // Find the refresh token
  const refreshToken = await prisma.refreshToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!refreshToken) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (refreshToken.revokedAt) {
    throw new UnauthorizedError('Refresh token has been revoked');
  }

  if (refreshToken.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token has expired');
  }

  if (!refreshToken.user.isActive) {
    throw new ForbiddenError('Account is disabled');
  }

  // Revoke old refresh token (token rotation)
  await prisma.refreshToken.update({
    where: { id: refreshToken.id },
    data: { revokedAt: new Date() },
  });

  // Generate new refresh token
  const newToken = generateRefreshToken();
  const expiresAt = getTokenExpiry(REFRESH_TOKEN_EXPIRY);

  await prisma.refreshToken.create({
    data: {
      token: newToken,
      userId: refreshToken.userId,
      expiresAt,
    },
  });

  return {
    user: toUserResponse(refreshToken.user),
    refreshToken: newToken,
  };
}

/**
 * Logout user by revoking refresh token
 */
export async function logout(token: string): Promise<void> {
  const refreshToken = await prisma.refreshToken.findUnique({
    where: { token },
  });

  if (refreshToken && !refreshToken.revokedAt) {
    await prisma.refreshToken.update({
      where: { id: refreshToken.id },
      data: { revokedAt: new Date() },
    });
  }
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
 * Change user password
 */
export async function changePassword(
  userId: string,
  input: ChangePasswordInput
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User', userId);
  }

  // Verify current password
  const isValidPassword = await verifyPassword(
    input.currentPassword,
    user.passwordHash
  );
  if (!isValidPassword) {
    throw new ValidationError('Current password is incorrect');
  }

  // Hash new password
  const passwordHash = await hashPassword(input.newPassword);

  // Update password and revoke all refresh tokens
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    }),
    prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    }),
  ]);
}

/**
 * Revoke all refresh tokens for a user (useful for security)
 */
export async function revokeAllTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}
