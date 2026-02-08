import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import { ROLE_PERMISSIONS, permissionsForRole } from '../lib/permissions.js';
import type { UpdateAuthorityInput } from '../schemas/authority.schema.js';
import { Prisma } from '@prisma/client';

class AuthorityService {
  async list() {
    return prisma.authority.findMany({
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });
  }

  async getByCode(code: string) {
    const authority = await prisma.authority.findUnique({ where: { code } });
    if (!authority) {
      throw new NotFoundError('Authority', code);
    }
    return authority;
  }

  async update(code: string, data: UpdateAuthorityInput, changedBy: string) {
    const existing = await prisma.authority.findUnique({ where: { code } });
    if (!existing) {
      throw new NotFoundError('Authority', code);
    }

    const updated = await prisma.authority.update({
      where: { code },
      data: {
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.deprecated !== undefined ? { deprecated: data.deprecated } : {}),
      },
    });

    await prisma.authorityAuditLog.create({
      data: {
        action: data.deprecated !== undefined ? 'DEPRECATED' : 'UPDATED',
        authorityCode: code,
        changedBy,
        details: {
          before: { description: existing.description, deprecated: existing.deprecated },
          after: { description: updated.description, deprecated: updated.deprecated },
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return updated;
  }

  async getAuditLog(options: { page: number; limit: number; authorityCode?: string }) {
    const { page, limit, authorityCode } = options;
    const where = authorityCode ? { authorityCode } : {};

    const [data, total] = await Promise.all([
      prisma.authorityAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.authorityAuditLog.count({ where }),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Drift detection: compare code-defined permissions vs DB registry.
   */
  async detectDrift() {
    const registryAuthorities = await prisma.authority.findMany();
    const registryCodes = new Set(registryAuthorities.map((a) => a.code));

    // Collect all unique permission strings from the role map
    const codePermissions = new Set<string>();
    for (const perms of Object.values(ROLE_PERMISSIONS)) {
      for (const p of perms) {
        codePermissions.add(p);
      }
    }

    const inCodeNotInRegistry = [...codePermissions].filter((p) => !registryCodes.has(p));
    const inRegistryNotInCode = registryAuthorities
      .filter((a) => !codePermissions.has(a.code))
      .map((a) => ({ code: a.code, deprecated: a.deprecated }));

    return {
      inSync: inCodeNotInRegistry.length === 0 && inRegistryNotInCode.length === 0,
      inCodeNotInRegistry,
      inRegistryNotInCode,
      registryCount: registryAuthorities.length,
      codeCount: codePermissions.size,
    };
  }

  /**
   * Get effective permissions for a specific user (admin tooling).
   */
  async getEffectivePermissions(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    const permissions = permissionsForRole(user.role);

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      source: 'role_fallback',
      permissions,
    };
  }

  /**
   * Get the full role-to-permissions mapping (for admin reference).
   */
  getRoleMapping() {
    return ROLE_PERMISSIONS;
  }
}

export const authorityService = new AuthorityService();
