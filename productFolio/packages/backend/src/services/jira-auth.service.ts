import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { getJiraConfig } from '../lib/config/jira.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';
import type { AtlassianTokenResponse, AtlassianAccessibleResource, AtlassianUserProfile } from '../types/jira.js';

const ATLASSIAN_AUTH_URL = 'https://auth.atlassian.com/authorize';
const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const ATLASSIAN_API_URL = 'https://api.atlassian.com';
const SCOPES = 'read:me read:jira-work read:jira-user write:jira-work offline_access';

// In-memory store for OAuth state tokens (short-lived)
const pendingStates = new Map<string, { userId: string; expiresAt: number }>();

// Concurrent refresh protection: prevents multiple simultaneous refreshes for the same connection
const inFlightRefreshes = new Map<string, Promise<AtlassianTokenResponse>>();

/**
 * Generate the Atlassian authorization URL for OAuth 2.0 3LO flow.
 */
export function getAuthorizationUrl(userId: string): string {
  const state = randomBytes(32).toString('hex');

  // Store state with 10-minute expiry
  pendingStates.set(state, {
    userId,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  // Clean up expired states
  for (const [key, value] of pendingStates) {
    if (value.expiresAt < Date.now()) {
      pendingStates.delete(key);
    }
  }

  const config = getJiraConfig();
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: config.clientId,
    scope: SCOPES,
    redirect_uri: config.redirectUri,
    state,
    response_type: 'code',
    prompt: 'consent',
  });

  return `${ATLASSIAN_AUTH_URL}?${params.toString()}`;
}

/**
 * Validate the OAuth state parameter and return the associated userId.
 */
export function validateState(state: string): string {
  const pending = pendingStates.get(state);
  if (!pending) {
    throw new ValidationError('Invalid or expired OAuth state');
  }
  if (pending.expiresAt < Date.now()) {
    pendingStates.delete(state);
    throw new ValidationError('OAuth state has expired');
  }

  pendingStates.delete(state);
  return pending.userId;
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<AtlassianTokenResponse> {
  const config = getJiraConfig();
  const response = await fetch(ATLASSIAN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new ValidationError(`Token exchange failed: ${error}`);
  }

  return response.json() as Promise<AtlassianTokenResponse>;
}

/**
 * Refresh an access token using a refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<AtlassianTokenResponse> {
  const config = getJiraConfig();
  const response = await fetch(ATLASSIAN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new ValidationError(`Token refresh failed: ${error}`);
  }

  return response.json() as Promise<AtlassianTokenResponse>;
}

/**
 * Get the Atlassian user profile for the given access token.
 */
export async function getAtlassianProfile(accessToken: string): Promise<AtlassianUserProfile> {
  const response = await fetch(`${ATLASSIAN_API_URL}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ValidationError(`Failed to fetch Atlassian user profile (${response.status}): ${body}`);
  }

  return response.json() as Promise<AtlassianUserProfile>;
}

/**
 * Get accessible cloud sites for the given access token.
 */
export async function getAccessibleResources(accessToken: string): Promise<AtlassianAccessibleResource[]> {
  const response = await fetch(`${ATLASSIAN_API_URL}/oauth/token/accessible-resources`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ValidationError(`Failed to fetch accessible resources (${response.status}): ${body}`);
  }

  return response.json() as Promise<AtlassianAccessibleResource[]>;
}

/**
 * Complete the OAuth callback: store connection + sites.
 */
export async function completeOAuthCallback(
  userId: string,
  tokens: AtlassianTokenResponse
) {
  const profile = await getAtlassianProfile(tokens.access_token);
  const resources = await getAccessibleResources(tokens.access_token);

  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  // Upsert JiraConnection by atlassianAccountId
  const connection = await prisma.jiraConnection.upsert({
    where: { atlassianAccountId: profile.account_id },
    create: {
      userId,
      atlassianAccountId: profile.account_id,
      accountEmail: profile.email || null,
      displayName: profile.name || null,
      encryptedAccessToken: encrypt(tokens.access_token),
      encryptedRefreshToken: encrypt(tokens.refresh_token),
      tokenExpiresAt,
      scopes: tokens.scope,
      isActive: true,
    },
    update: {
      userId,
      accountEmail: profile.email || null,
      displayName: profile.name || null,
      encryptedAccessToken: encrypt(tokens.access_token),
      encryptedRefreshToken: encrypt(tokens.refresh_token),
      tokenExpiresAt,
      scopes: tokens.scope,
      isActive: true,
    },
  });

  // Upsert sites from accessible resources
  for (const resource of resources) {
    await prisma.jiraSite.upsert({
      where: {
        jiraConnectionId_cloudId: {
          jiraConnectionId: connection.id,
          cloudId: resource.id,
        },
      },
      create: {
        jiraConnectionId: connection.id,
        cloudId: resource.id,
        siteName: resource.name,
        siteUrl: resource.url,
      },
      update: {
        siteName: resource.name,
        siteUrl: resource.url,
      },
    });
  }

  return connection;
}

/**
 * Get a valid access token for a connection, refreshing if needed.
 */
export async function getValidAccessToken(connectionId: string): Promise<{ accessToken: string; cloudIds: string[] }> {
  const connection = await prisma.jiraConnection.findUnique({
    where: { id: connectionId },
    include: { sites: { where: { isSelected: true } } },
  });

  if (!connection) {
    throw new NotFoundError('Jira connection not found');
  }

  if (!connection.isActive) {
    throw new ValidationError('Jira connection is inactive');
  }

  // Check if token needs refresh (refresh 60s before expiry)
  const needsRefresh = connection.tokenExpiresAt.getTime() < Date.now() + 60_000;

  if (needsRefresh) {
    // Concurrent refresh protection: if a refresh is already in-flight for this connection, await it
    const existing = inFlightRefreshes.get(connectionId);
    if (existing) {
      const newTokens = await existing;
      return {
        accessToken: newTokens.access_token,
        cloudIds: connection.sites.map(s => s.cloudId),
      };
    }

    const refreshPromise = (async () => {
      const refreshToken = decrypt(connection.encryptedRefreshToken);
      return refreshAccessToken(refreshToken);
    })();

    inFlightRefreshes.set(connectionId, refreshPromise);

    try {
      const newTokens = await refreshPromise;

      const tokenExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);

      await prisma.jiraConnection.update({
        where: { id: connectionId },
        data: {
          encryptedAccessToken: encrypt(newTokens.access_token),
          encryptedRefreshToken: encrypt(newTokens.refresh_token),
          tokenExpiresAt,
        },
      });

      return {
        accessToken: newTokens.access_token,
        cloudIds: connection.sites.map(s => s.cloudId),
      };
    } finally {
      inFlightRefreshes.delete(connectionId);
    }
  }

  return {
    accessToken: decrypt(connection.encryptedAccessToken),
    cloudIds: connection.sites.map(s => s.cloudId),
  };
}

/**
 * List all connections for a user.
 */
export async function listConnections(userId?: string) {
  const where = userId ? { userId } : {};

  return prisma.jiraConnection.findMany({
    where,
    include: {
      sites: {
        include: {
          projectSelections: true,
        },
      },
      user: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Delete a connection and all related data.
 */
export async function deleteConnection(connectionId: string) {
  const connection = await prisma.jiraConnection.findUnique({
    where: { id: connectionId },
  });

  if (!connection) {
    throw new NotFoundError('Jira connection not found');
  }

  // Cascade delete handles sites, projects, cursors, sync runs
  await prisma.jiraConnection.delete({
    where: { id: connectionId },
  });

  return { deleted: true };
}

/**
 * List sites for a connection (from DB; refreshes from Atlassian if needed).
 */
export async function listSitesForConnection(connectionId: string) {
  const connection = await prisma.jiraConnection.findUnique({
    where: { id: connectionId },
    include: { sites: true },
  });

  if (!connection) {
    throw new NotFoundError('Jira connection not found');
  }

  // Optionally refresh from Atlassian
  try {
    const { accessToken } = await getValidAccessToken(connectionId);
    const resources = await getAccessibleResources(accessToken);

    // Upsert any new sites
    for (const resource of resources) {
      await prisma.jiraSite.upsert({
        where: {
          jiraConnectionId_cloudId: {
            jiraConnectionId: connectionId,
            cloudId: resource.id,
          },
        },
        create: {
          jiraConnectionId: connectionId,
          cloudId: resource.id,
          siteName: resource.name,
          siteUrl: resource.url,
        },
        update: {
          siteName: resource.name,
          siteUrl: resource.url,
        },
      });
    }
  } catch {
    // If refresh fails, return cached data
  }

  return prisma.jiraSite.findMany({
    where: { jiraConnectionId: connectionId },
    orderBy: { siteName: 'asc' },
  });
}

/**
 * Select/deselect sites for a connection.
 */
export async function selectSites(connectionId: string, siteIds: string[]) {
  // Deselect all sites first
  await prisma.jiraSite.updateMany({
    where: { jiraConnectionId: connectionId },
    data: { isSelected: false },
  });

  // Select specified sites
  await prisma.jiraSite.updateMany({
    where: {
      jiraConnectionId: connectionId,
      id: { in: siteIds },
    },
    data: { isSelected: true },
  });

  return prisma.jiraSite.findMany({
    where: { jiraConnectionId: connectionId },
    orderBy: { siteName: 'asc' },
  });
}

/**
 * Select projects for a site.
 */
export async function selectProjects(
  siteId: string,
  projects: Array<{ projectId: string; projectKey: string; projectName: string }>
) {
  const site = await prisma.jiraSite.findUnique({ where: { id: siteId } });
  if (!site) {
    throw new NotFoundError('Jira site not found');
  }

  // Deselect all existing projects
  await prisma.jiraProjectSelection.updateMany({
    where: { jiraSiteId: siteId },
    data: { isSelected: false },
  });

  // Upsert selected projects
  for (const project of projects) {
    await prisma.jiraProjectSelection.upsert({
      where: {
        jiraSiteId_projectKey: {
          jiraSiteId: siteId,
          projectKey: project.projectKey,
        },
      },
      create: {
        jiraSiteId: siteId,
        projectId: project.projectId,
        projectKey: project.projectKey,
        projectName: project.projectName,
        isSelected: true,
      },
      update: {
        projectId: project.projectId,
        projectName: project.projectName,
        isSelected: true,
      },
    });
  }

  return prisma.jiraProjectSelection.findMany({
    where: { jiraSiteId: siteId },
    orderBy: { projectKey: 'asc' },
  });
}
