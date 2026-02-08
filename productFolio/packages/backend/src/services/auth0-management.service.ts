import { prisma } from '../lib/prisma.js';
import { UserRole } from '@prisma/client';
import { ROLE_PERMISSIONS } from '../lib/permissions.js';
import { ValidationError } from '../lib/errors.js';

function getAuth0Config() {
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;
  const audience =
    process.env.AUTH0_MGMT_AUDIENCE ||
    (domain ? `https://${domain}/api/v2/` : undefined);
  return { domain, clientId, clientSecret, audience };
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

interface Auth0Role {
  id: string;
  name: string;
  description: string;
}

class Auth0ManagementService {
  private cachedToken: CachedToken | null = null;

  /**
   * Get a Management API access token via client_credentials grant.
   * Tokens are cached in memory until they expire (with 60s buffer).
   */
  async getManagementToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.accessToken;
    }

    const { domain, clientId, clientSecret, audience } = getAuth0Config();

    if (!domain || !clientId || !clientSecret || !audience) {
      throw new ValidationError(
        'Auth0 Management API not configured. Set AUTH0_MGMT_CLIENT_ID, AUTH0_MGMT_CLIENT_SECRET, and AUTH0_DOMAIN.'
      );
    }

    const response = await fetch(`https://${domain}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        audience,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ValidationError(`Auth0 token request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
      token_type: string;
    };

    // Cache with 60s safety buffer
    this.cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };

    return this.cachedToken.accessToken;
  }

  /**
   * Create or update Auth0 roles matching local ROLE_PERMISSIONS keys.
   */
  async syncRolesToAuth0(): Promise<{ created: string[]; existing: string[] }> {
    const token = await this.getManagementToken();
    const existingRoles = await this.listRoles(token);
    const existingNames = new Set(existingRoles.map((r) => r.name));

    const created: string[] = [];
    const existing: string[] = [];

    for (const roleName of Object.keys(ROLE_PERMISSIONS)) {
      if (existingNames.has(roleName)) {
        existing.push(roleName);
        continue;
      }

      await fetch(`https://${this.getDomain()}/api/v2/roles`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: roleName,
          description: `ProductFolio ${roleName} role`,
        }),
      });

      created.push(roleName);
    }

    return { created, existing };
  }

  /**
   * Create permissions on an Auth0 API resource server.
   */
  async syncPermissionsToAuth0(apiId: string): Promise<{ synced: number }> {
    const token = await this.getManagementToken();

    // Collect all unique permissions across roles
    const allPermissions = new Set<string>();
    for (const perms of Object.values(ROLE_PERMISSIONS)) {
      for (const p of perms) {
        allPermissions.add(p);
      }
    }

    const scopes = [...allPermissions].map((p) => ({
      value: p,
      description: `ProductFolio permission: ${p}`,
    }));

    // PATCH the API resource server to add scopes
    const response = await fetch(
      `https://${this.getDomain()}/api/v2/resource-servers/${encodeURIComponent(apiId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scopes }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new ValidationError(`Failed to sync permissions (${response.status}): ${body}`);
    }

    return { synced: scopes.length };
  }

  /**
   * Assign an Auth0 role to a user by auth0Sub.
   */
  async assignRoleToUser(auth0Sub: string, roleName: string): Promise<void> {
    const token = await this.getManagementToken();
    const role = await this.findRoleByName(token, roleName);
    if (!role) {
      throw new ValidationError(`Auth0 role '${roleName}' not found. Run sync-roles first.`);
    }

    const response = await fetch(
      `https://${this.getDomain()}/api/v2/users/${encodeURIComponent(auth0Sub)}/roles`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roles: [role.id] }),
      }
    );

    if (!response.ok && response.status !== 204) {
      const body = await response.text();
      throw new ValidationError(`Failed to assign role (${response.status}): ${body}`);
    }
  }

  /**
   * Remove an Auth0 role from a user by auth0Sub.
   */
  async removeRoleFromUser(auth0Sub: string, roleName: string): Promise<void> {
    const token = await this.getManagementToken();
    const role = await this.findRoleByName(token, roleName);
    if (!role) {
      return; // Role doesn't exist in Auth0, nothing to remove
    }

    const response = await fetch(
      `https://${this.getDomain()}/api/v2/users/${encodeURIComponent(auth0Sub)}/roles`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roles: [role.id] }),
      }
    );

    if (!response.ok && response.status !== 204) {
      const body = await response.text();
      throw new ValidationError(`Failed to remove role (${response.status}): ${body}`);
    }
  }

  /**
   * Get a user's roles from Auth0.
   */
  async getUserRoles(auth0Sub: string): Promise<Auth0Role[]> {
    const token = await this.getManagementToken();

    const response = await fetch(
      `https://${this.getDomain()}/api/v2/users/${encodeURIComponent(auth0Sub)}/roles`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new ValidationError(`Failed to get user roles (${response.status}): ${body}`);
    }

    return (await response.json()) as Auth0Role[];
  }

  /**
   * Sync a single local user's role to Auth0.
   * Removes all existing ProductFolio roles, then assigns the current local role.
   */
  async syncUserToAuth0(userId: string): Promise<{ auth0Sub: string; role: string }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ValidationError(`User '${userId}' not found`);
    }
    if (!user.auth0Sub) {
      throw new ValidationError(`User '${userId}' has no Auth0 identity linked`);
    }

    const currentRoles = await this.getUserRoles(user.auth0Sub);
    const productFolioRoleNames = new Set(Object.keys(ROLE_PERMISSIONS));

    // Remove existing ProductFolio roles
    for (const role of currentRoles) {
      if (productFolioRoleNames.has(role.name)) {
        await this.removeRoleFromUser(user.auth0Sub, role.name);
      }
    }

    // Assign current local role
    await this.assignRoleToUser(user.auth0Sub, user.role);

    return { auth0Sub: user.auth0Sub, role: user.role };
  }

  /**
   * Sync all local users with Auth0 identities to Auth0 roles.
   */
  async syncAllUsersToAuth0(): Promise<{ synced: number; skipped: number; errors: string[] }> {
    const users = await prisma.user.findMany({
      where: { auth0Sub: { not: null }, isActive: true },
    });

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        await this.syncUserToAuth0(user.id);
        synced++;
      } catch (err) {
        errors.push(`${user.email}: ${(err as Error).message}`);
        skipped++;
      }
    }

    return { synced, skipped, errors };
  }

  /** Reset the cached management token (for testing) */
  clearTokenCache(): void {
    this.cachedToken = null;
  }

  // --- Private helpers ---

  private getDomain(): string {
    return process.env.AUTH0_DOMAIN || '';
  }

  private async listRoles(token: string): Promise<Auth0Role[]> {
    const roles: Auth0Role[] = [];
    let page = 0;
    const perPage = 50;

    // Paginate to collect all roles
    while (true) {
      const response = await fetch(
        `https://${this.getDomain()}/api/v2/roles?page=${page}&per_page=${perPage}&include_totals=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) break;

      const data = (await response.json()) as { roles: Auth0Role[]; total: number };
      roles.push(...data.roles);

      if (roles.length >= data.total) break;
      page++;
    }

    return roles;
  }

  private async findRoleByName(token: string, name: string): Promise<Auth0Role | undefined> {
    const response = await fetch(
      `https://${this.getDomain()}/api/v2/roles?name_filter=${encodeURIComponent(name)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) return undefined;

    const roles = (await response.json()) as Auth0Role[];
    return roles.find((r) => r.name === name);
  }
}

export const auth0ManagementService = new Auth0ManagementService();
