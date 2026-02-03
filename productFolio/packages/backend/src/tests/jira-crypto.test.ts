import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt } from '../lib/crypto.js';
import { resetJiraConfigCache } from '../lib/config/jira.js';

// A valid 64-hex-char encryption key (32 bytes)
const VALID_KEY = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

function setValidEnv() {
  process.env.JIRA_CLIENT_ID = 'test-client-id';
  process.env.JIRA_CLIENT_SECRET = 'test-client-secret';
  process.env.JIRA_TOKEN_ENCRYPTION_KEY = VALID_KEY;
}

function clearEnv() {
  delete process.env.JIRA_CLIENT_ID;
  delete process.env.JIRA_CLIENT_SECRET;
  delete process.env.JIRA_TOKEN_ENCRYPTION_KEY;
}

describe('Jira Crypto (encrypt/decrypt)', () => {
  beforeEach(() => {
    clearEnv();
    resetJiraConfigCache();
  });

  afterEach(() => {
    clearEnv();
    resetJiraConfigCache();
  });

  describe('round-trip', () => {
    it('encrypts and decrypts a simple string', () => {
      setValidEnv();
      const plaintext = 'hello-world-token';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts an empty string', () => {
      setValidEnv();
      const encrypted = encrypt('');
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe('');
    });

    it('encrypts and decrypts a long string', () => {
      setValidEnv();
      const plaintext = 'x'.repeat(10_000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts unicode characters', () => {
      setValidEnv();
      const plaintext = 'Hello \u{1F600} \u{1F30D} \u00E9\u00E8\u00EA';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('unique IVs', () => {
    it('produces different ciphertexts for the same plaintext', () => {
      setValidEnv();
      const plaintext = 'same-input';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);
      expect(encrypted1).not.toBe(encrypted2);
      // But both decrypt to the same value
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });
  });

  describe('error cases', () => {
    it('throws when config is missing', () => {
      expect(() => encrypt('test')).toThrow('Jira integration is not configured');
    });

    it('throws when decrypting with wrong key', () => {
      setValidEnv();
      const encrypted = encrypt('secret-data');

      // Change key and reset cache
      clearEnv();
      resetJiraConfigCache();
      process.env.JIRA_CLIENT_ID = 'test-client-id';
      process.env.JIRA_CLIENT_SECRET = 'test-client-secret';
      process.env.JIRA_TOKEN_ENCRYPTION_KEY = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      expect(() => decrypt(encrypted)).toThrow();
    });

    it('throws when ciphertext is tampered', () => {
      setValidEnv();
      const encrypted = encrypt('important-token');
      const tampered = Buffer.from(encrypted, 'base64');
      // Flip a byte in the ciphertext portion (after IV, before auth tag)
      if (tampered.length > 20) {
        tampered[20] ^= 0xff;
      }
      const tamperedBase64 = tampered.toString('base64');

      expect(() => decrypt(tamperedBase64)).toThrow();
    });
  });
});
