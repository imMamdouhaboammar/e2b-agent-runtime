import { describe, expect, it } from 'vitest';
import { loadConfig, redactSecrets } from '../src/config.js';

describe('Configuration Module', () => {
  it('should throw an error when E2B_API_KEY is missing', () => {
    expect(() => loadConfig({})).toThrowError(/E2B_API_KEY/);
  });

  it('should throw an error when E2B_API_KEY is empty', () => {
    expect(() => loadConfig({ E2B_API_KEY: '' })).toThrowError(/E2B_API_KEY/);
  });

  it('should load config with default timeout when E2B_API_KEY is present', () => {
    const config = loadConfig({ E2B_API_KEY: 'test_api_key_123' });
    expect(config.apiKey).toBe('test_api_key_123');
    expect(config.sandboxTimeoutMs).toBe(600000);
  });

  it('should parse valid custom E2B_SANDBOX_TIMEOUT_MS', () => {
    const config = loadConfig({
      E2B_API_KEY: 'test_api_key_123',
      E2B_SANDBOX_TIMEOUT_MS: '900000',
    });
    expect(config.sandboxTimeoutMs).toBe(900000);
  });

  it('should reject invalid or out-of-bounds timeout values', () => {
    expect(() =>
      loadConfig({ E2B_API_KEY: 'test_key', E2B_SANDBOX_TIMEOUT_MS: 'invalid' })
    ).toThrowError(/E2B_SANDBOX_TIMEOUT_MS/);

    expect(() =>
      loadConfig({ E2B_API_KEY: 'test_key', E2B_SANDBOX_TIMEOUT_MS: '500' })
    ).toThrowError(/E2B_SANDBOX_TIMEOUT_MS/);

    expect(() =>
      loadConfig({ E2B_API_KEY: 'test_key', E2B_SANDBOX_TIMEOUT_MS: '999999999' })
    ).toThrowError(/E2B_SANDBOX_TIMEOUT_MS/);
  });

  it('should redact secret values from text', () => {
    const secretKey = 'e2b_sec_abc123secret';
    const secretToken = 'bearer_token_xyz987';
    const text = `Failed connecting with key e2b_sec_abc123secret using token bearer_token_xyz987`;

    const redacted = redactSecrets(text, [secretKey, secretToken]);
    expect(redacted).not.toContain(secretKey);
    expect(redacted).not.toContain(secretToken);
    expect(redacted).toBe('Failed connecting with key [REDACTED] using token [REDACTED]');
  });
});
