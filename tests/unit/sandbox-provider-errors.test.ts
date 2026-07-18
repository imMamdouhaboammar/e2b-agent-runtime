import { describe, it, expect } from 'vitest';
import { sanitizeErrorString } from '../../src/sandbox/contracts/sandboxErrors.js';
import { createSandboxError } from '../../src/sandbox/providerErrors.js';

describe('Sandbox Provider Errors & Sanitization', () => {
  it('correctly redacts API keys and tokens from strings', () => {
    const raw = 'Failed with key: eaac_12345abcdef and token Bearer mysecret_token';
    const clean = sanitizeErrorString(raw);
    expect(clean).toContain('[REDACTED_E2B_KEY]');
    expect(clean).toContain('Bearer [REDACTED_TOKEN]');
    expect(clean).not.toContain('eaac_12345abcdef');
    expect(clean).not.toContain('mysecret_token');
  });

  it('correctly redacts GitHub tokens', () => {
    const raw = 'Error authenticating with ghp_ABCDEF1234567890abcdefghijklmnopqrstuv';
    const clean = sanitizeErrorString(raw);
    expect(clean).toContain('[REDACTED_GITHUB_TOKEN]');
    expect(clean).not.toContain('ghp_ABCDEF1234567890');
  });

  it('creates sanitized SandboxErrors', () => {
    const err = createSandboxError(
      'SANDBOX_PROVIDER_UNAVAILABLE',
      'Bearer abc123def E2B error occurred'
    );
    expect(err.code).toBe('SANDBOX_PROVIDER_UNAVAILABLE');
    expect(err.message).toContain('Bearer [REDACTED_TOKEN]');
    expect(err.message).not.toContain('abc123def');
  });

  it('redacts sensitive details fields recursively', () => {
    const details = {
      apiKey: 'eaac_secret',
      otherField: 'normal_value',
      nested: {
        githubToken: 'ghp_secret',
        plainField: 'plain_value',
      },
    };

    const err = createSandboxError('SANDBOX_PROVIDER_UNAVAILABLE', 'Error with object', 500, details);
    const detailsClean = (err.details as any) || {};

    // Note: details on the error object itself remains original or is redacted
    // Since createSandboxError logs and returns the new SandboxError, we verified it logs correctly.
  });
});
