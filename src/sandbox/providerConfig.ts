import { SandboxError } from './contracts/sandboxErrors.js';

export interface SandboxProviderConfig {
  provider: 'direct-e2b' | 'openai-agents-e2b';
  allowFallback: boolean;
}

export function loadSandboxProviderConfig(
  envOverride?: Record<string, string | undefined>
): SandboxProviderConfig {
  const env = envOverride ?? process.env;

  const rawProvider = env.SANDBOX_PROVIDER || 'direct-e2b';
  if (rawProvider !== 'direct-e2b' && rawProvider !== 'openai-agents-e2b') {
    throw new SandboxError(
      'SANDBOX_PROVIDER_UNAVAILABLE',
      `Unsupported SANDBOX_PROVIDER value: "${rawProvider}". Allowed values are: direct-e2b, openai-agents-e2b`
    );
  }

  const provider = rawProvider as 'direct-e2b' | 'openai-agents-e2b';

  const allowFallbackStr = env.SANDBOX_PROVIDER_ALLOW_FALLBACK || 'false';
  const allowFallback = allowFallbackStr.toLowerCase() === 'true' || allowFallbackStr === '1';

  return {
    provider,
    allowFallback,
  };
}
