import { describe, it, expect } from 'vitest';
import { loadSandboxProviderConfig } from '../../src/sandbox/providerConfig.js';
import { SandboxError } from '../../src/sandbox/contracts/sandboxErrors.js';

describe('loadSandboxProviderConfig', () => {
  it('defaults to direct-e2b and fallback false when environment is empty', () => {
    const config = loadSandboxProviderConfig({});
    expect(config.provider).toBe('direct-e2b');
    expect(config.allowFallback).toBe(false);
  });

  it('correctly parses direct-e2b', () => {
    const config = loadSandboxProviderConfig({
      SANDBOX_PROVIDER: 'direct-e2b',
    });
    expect(config.provider).toBe('direct-e2b');
  });

  it('correctly parses openai-agents-e2b', () => {
    const config = loadSandboxProviderConfig({
      SANDBOX_PROVIDER: 'openai-agents-e2b',
    });
    expect(config.provider).toBe('openai-agents-e2b');
  });

  it('throws SandboxError for unsupported providers', () => {
    expect(() => {
      loadSandboxProviderConfig({
        SANDBOX_PROVIDER: 'invalid-provider-name',
      });
    }).toThrow(SandboxError);
  });

  it('correctly parses allow fallback true values', () => {
    const config1 = loadSandboxProviderConfig({
      SANDBOX_PROVIDER_ALLOW_FALLBACK: 'true',
    });
    expect(config1.allowFallback).toBe(true);

    const config2 = loadSandboxProviderConfig({
      SANDBOX_PROVIDER_ALLOW_FALLBACK: '1',
    });
    expect(config2.allowFallback).toBe(true);
  });

  it('correctly parses allow fallback false values', () => {
    const config1 = loadSandboxProviderConfig({
      SANDBOX_PROVIDER_ALLOW_FALLBACK: 'false',
    });
    expect(config1.allowFallback).toBe(false);

    const config2 = loadSandboxProviderConfig({
      SANDBOX_PROVIDER_ALLOW_FALLBACK: '0',
    });
    expect(config2.allowFallback).toBe(false);
  });
});
