import { DirectE2bProvider } from './providers/directE2b/provider.js';
import { OpenAIE2bProvider } from './providers/openaiAgentsE2b/provider.js';
import type { SandboxProvider } from './contracts/sandboxProvider.js';
import { SandboxError } from './contracts/sandboxErrors.js';

class ProviderRegistry {
  private readonly providers = new Map<string, SandboxProvider>();

  constructor() {
    this.register(new DirectE2bProvider());
    this.register(new OpenAIE2bProvider());
  }

  public register(provider: SandboxProvider): void {
    this.providers.set(provider.providerName, provider);
  }

  public getProvider(name: string): SandboxProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `Sandbox provider "${name}" is not registered.`
      );
    }
    return provider;
  }

  public listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const providerRegistry = new ProviderRegistry();
