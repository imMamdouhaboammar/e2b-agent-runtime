import { describe, it, expect } from 'vitest';
import { providerRegistry } from '../../src/sandbox/providerRegistry.js';
import { SandboxError } from '../../src/sandbox/contracts/sandboxErrors.js';

describe('Sandbox Provider Registry', () => {
  it('registers direct-e2b and openai-agents-e2b by default', () => {
    const list = providerRegistry.listProviders();
    expect(list).toContain('direct-e2b');
    expect(list).toContain('openai-agents-e2b');
  });

  it('can retrieve providers by name', () => {
    const p1 = providerRegistry.getProvider('direct-e2b');
    expect(p1.providerName).toBe('direct-e2b');

    const p2 = providerRegistry.getProvider('openai-agents-e2b');
    expect(p2.providerName).toBe('openai-agents-e2b');
  });

  it('throws SandboxError for unregistered providers', () => {
    expect(() => {
      providerRegistry.getProvider('non-existent-provider');
    }).toThrow(SandboxError);
  });
});
