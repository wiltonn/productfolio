import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  validateJiraConfig,
  getJiraConfig,
  isJiraConfigured,
  resetJiraConfigCache,
} from '../lib/config/jira.js';

// A valid 64-hex-char encryption key (32 bytes)
const VALID_KEY = 'a'.repeat(64);

function setJiraEnv(overrides: Partial<{
  JIRA_CLIENT_ID: string;
  JIRA_CLIENT_SECRET: string;
  JIRA_TOKEN_ENCRYPTION_KEY: string;
  JIRA_REDIRECT_URI: string;
}> = {}) {
  process.env.JIRA_CLIENT_ID = overrides.JIRA_CLIENT_ID ?? 'test-client-id';
  process.env.JIRA_CLIENT_SECRET = overrides.JIRA_CLIENT_SECRET ?? 'test-client-secret';
  process.env.JIRA_TOKEN_ENCRYPTION_KEY = overrides.JIRA_TOKEN_ENCRYPTION_KEY ?? VALID_KEY;
  if (overrides.JIRA_REDIRECT_URI) {
    process.env.JIRA_REDIRECT_URI = overrides.JIRA_REDIRECT_URI;
  }
}

function clearJiraEnv() {
  delete process.env.JIRA_CLIENT_ID;
  delete process.env.JIRA_CLIENT_SECRET;
  delete process.env.JIRA_TOKEN_ENCRYPTION_KEY;
  delete process.env.JIRA_REDIRECT_URI;
}

describe('Jira Config Validation', () => {
  beforeEach(() => {
    clearJiraEnv();
    resetJiraConfigCache();
  });

  afterEach(() => {
    clearJiraEnv();
    resetJiraConfigCache();
  });

  describe('validateJiraConfig', () => {
    it('returns null when no env vars are set', () => {
      expect(validateJiraConfig()).toBeNull();
    });

    it('returns typed config when all env vars are valid', () => {
      setJiraEnv();
      const config = validateJiraConfig();
      expect(config).not.toBeNull();
      expect(config!.clientId).toBe('test-client-id');
      expect(config!.clientSecret).toBe('test-client-secret');
      expect(config!.encryptionKey).toBeInstanceOf(Buffer);
      expect(config!.encryptionKey.length).toBe(32);
      expect(config!.redirectUri).toBe('http://localhost:3000/api/integrations/jira/callback');
    });

    it('uses custom redirect URI when set', () => {
      setJiraEnv({ JIRA_REDIRECT_URI: 'https://example.com/callback' });
      const config = validateJiraConfig();
      expect(config!.redirectUri).toBe('https://example.com/callback');
    });

    it('throws when only JIRA_CLIENT_ID is set', () => {
      process.env.JIRA_CLIENT_ID = 'test-id';
      expect(() => validateJiraConfig()).toThrow('partially configured');
      expect(() => {
        resetJiraConfigCache();
        validateJiraConfig();
      }).toThrow('JIRA_CLIENT_SECRET');
    });

    it('throws when only JIRA_CLIENT_SECRET is set', () => {
      process.env.JIRA_CLIENT_SECRET = 'test-secret';
      expect(() => validateJiraConfig()).toThrow('partially configured');
    });

    it('throws when only JIRA_TOKEN_ENCRYPTION_KEY is set', () => {
      process.env.JIRA_TOKEN_ENCRYPTION_KEY = VALID_KEY;
      expect(() => validateJiraConfig()).toThrow('partially configured');
    });

    it('throws when encryption key is wrong length', () => {
      setJiraEnv({ JIRA_TOKEN_ENCRYPTION_KEY: 'abcd1234' });
      expect(() => validateJiraConfig()).toThrow('exactly 64 hex characters');
    });

    it('throws when encryption key contains non-hex characters', () => {
      setJiraEnv({ JIRA_TOKEN_ENCRYPTION_KEY: 'g'.repeat(64) });
      expect(() => validateJiraConfig()).toThrow('exactly 64 hex characters');
    });

    it('caches result after first call', () => {
      setJiraEnv();
      const first = validateJiraConfig();
      const second = validateJiraConfig();
      expect(first).toBe(second); // same reference
    });

    it('caches null result when not configured', () => {
      const first = validateJiraConfig();
      // Set env vars after first call - should still return cached null
      setJiraEnv();
      const second = validateJiraConfig();
      expect(first).toBeNull();
      expect(second).toBeNull();
    });

    it('resetJiraConfigCache clears cached value', () => {
      const first = validateJiraConfig();
      expect(first).toBeNull();

      resetJiraConfigCache();
      setJiraEnv();
      const second = validateJiraConfig();
      expect(second).not.toBeNull();
    });
  });

  describe('getJiraConfig', () => {
    it('returns config when configured', () => {
      setJiraEnv();
      const config = getJiraConfig();
      expect(config.clientId).toBe('test-client-id');
    });

    it('throws ValidationError when not configured', () => {
      expect(() => getJiraConfig()).toThrow('Jira integration is not configured');
    });
  });

  describe('isJiraConfigured', () => {
    it('returns true when fully configured', () => {
      setJiraEnv();
      expect(isJiraConfigured()).toBe(true);
    });

    it('returns false when not configured', () => {
      expect(isJiraConfigured()).toBe(false);
    });

    it('returns false when partially configured (does not throw)', () => {
      process.env.JIRA_CLIENT_ID = 'test-id';
      expect(isJiraConfigured()).toBe(false);
    });
  });
});
