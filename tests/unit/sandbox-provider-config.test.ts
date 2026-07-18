import { describe, it, expect } from 'vitest';
import { loadSandboxProviderConfig } from '../../src/sandbox/providerConfig.js';
import { SandboxError } from '../../src/sandbox/contracts/sandboxErrors.js';

describe('loadSandboxProviderConfig', () => {
  it('should default to direct-e2b and disable fallback when environment is empty', () => {
    const config = loadSandboxProviderConfig({});
    expect(config.provider).toBe('direct-e2b');
    expect(config.allowFallback).toBe(false);
  });

  it('should resolve provider name to direct-e2b when environment variable is direct-e2b', () => {
    const config = loadSandboxProviderConfig({
      SANDBOX_PROVIDER: 'direct-e2b',
    });
    expect(config.provider).toBe('direct-e2b');
  });

  it('should resolve provider name to openai-agents-e2b when environment variable is openai-agents-e2b', () => {
    const config = loadSandboxProviderConfig({
      SANDBOX_PROVIDER: 'openai-agents-e2b',
    });
    expect(config.provider).toBe('openai-agents-e2b');
  });

  it('should throw SandboxError when environment variable specifies unsupported provider name', () => {
    expect(() => {
      loadSandboxProviderConfig({
        SANDBOX_PROVIDER: 'invalid-provider-name',
      });
    }).toThrow(SandboxError);
  });

  it('should parse allow fallback flag to true when variable is true or 1', () => {
    const config1 = loadSandboxProviderConfig({
      SANDBOX_PROVIDER_ALLOW_FALLBACK: 'true',
    });
    expect(config1.allowFallback).toBe(true);

    const config2 = loadSandboxProviderConfig({
      SANDBOX_PROVIDER_ALLOW_FALLBACK: '1',
    });
    expect(config2.allowFallback).toBe(true);
  });

  it('should parse allow fallback flag to false when variable is false or 0', () => {
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
