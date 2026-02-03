import { ValidationError } from '../errors.js';

export interface JiraConfig {
  clientId: string;
  clientSecret: string;
  encryptionKey: Buffer;
  redirectUri: string;
}

let cachedConfig: JiraConfig | null | undefined;

/**
 * Validate all Jira-related environment variables.
 * Returns a typed config object if all are present and valid, or null if not configured.
 * Throws ValidationError if partially configured or encryption key is malformed.
 */
export function validateJiraConfig(): JiraConfig | null {
  if (cachedConfig !== undefined) {
    return cachedConfig;
  }

  const clientId = process.env.JIRA_CLIENT_ID;
  const clientSecret = process.env.JIRA_CLIENT_SECRET;
  const encryptionKeyHex = process.env.JIRA_TOKEN_ENCRYPTION_KEY;

  // If none are set, Jira is simply not configured (not an error)
  if (!clientId && !clientSecret && !encryptionKeyHex) {
    cachedConfig = null;
    return null;
  }

  // Partial configuration is an error
  const missing: string[] = [];
  if (!clientId) missing.push('JIRA_CLIENT_ID');
  if (!clientSecret) missing.push('JIRA_CLIENT_SECRET');
  if (!encryptionKeyHex) missing.push('JIRA_TOKEN_ENCRYPTION_KEY');

  if (missing.length > 0) {
    throw new ValidationError(
      `Jira integration is partially configured. Missing environment variables: ${missing.join(', ')}`,
      { missing }
    );
  }

  // Validate encryption key format
  if (!/^[0-9a-fA-F]{64}$/.test(encryptionKeyHex!)) {
    throw new ValidationError(
      'JIRA_TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Generate one with: openssl rand -hex 32'
    );
  }

  const config: JiraConfig = {
    clientId: clientId!,
    clientSecret: clientSecret!,
    encryptionKey: Buffer.from(encryptionKeyHex!, 'hex'),
    redirectUri: process.env.JIRA_REDIRECT_URI || 'http://localhost:3000/api/integrations/jira/callback',
  };

  cachedConfig = config;
  return config;
}

/**
 * Get the validated Jira config or throw if not configured.
 * Use this in code paths that require Jira to be set up.
 */
export function getJiraConfig(): JiraConfig {
  const config = validateJiraConfig();
  if (!config) {
    throw new ValidationError(
      'Jira integration is not configured. Set JIRA_CLIENT_ID, JIRA_CLIENT_SECRET, and JIRA_TOKEN_ENCRYPTION_KEY environment variables.'
    );
  }
  return config;
}

/**
 * Check whether Jira integration is configured (without throwing).
 */
export function isJiraConfigured(): boolean {
  try {
    return validateJiraConfig() !== null;
  } catch {
    return false;
  }
}

/**
 * Reset the cached config. Intended for tests only.
 */
export function resetJiraConfigCache(): void {
  cachedConfig = undefined;
}
