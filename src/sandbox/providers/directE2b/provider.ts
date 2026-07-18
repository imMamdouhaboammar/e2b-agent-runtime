import { Sandbox } from 'e2b';
import type { SandboxProvider, ProviderSessionOptions } from '../../contracts/sandboxProvider.js';
import type { SandboxSession } from '../../contracts/sandboxSession.js';
import type { SandboxCapability, CapabilityMatrix } from '../../contracts/sandboxCapabilities.js';
import { DIRECT_E2B_CAPABILITIES } from '../../providerCapabilityMatrix.js';
import { DirectE2bSession } from './session.js';
import { SandboxError } from '../../contracts/sandboxErrors.js';
import { loadControllerConfig } from '../../../config.js';

export class DirectE2bProvider implements SandboxProvider {
  readonly providerName = 'direct-e2b';

  async createSession(options?: ProviderSessionOptions): Promise<SandboxSession> {
    try {
      const config = loadControllerConfig();
      const apiKey = config.apiKey;

      const sandbox = await Sandbox.create({
        apiKey,
        timeoutMs: options?.timeoutMs || config.workerDefaultTimeoutMs,
        template: options?.template || config.workerTemplate,
        metadata: options?.metadata || {
          provider: 'direct-e2b',
        },
      });

      // Ensure /workspace exists and has write permissions inside the Sandbox
      await sandbox.commands.run('sudo mkdir -p /workspace && sudo chmod 777 /workspace');

      return new DirectE2bSession(sandbox);
    } catch (err: any) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `Failed to create session with direct-e2b provider: ${err.message}`,
        500,
        err
      );
    }
  }

  async connectSession(sessionId: string): Promise<SandboxSession> {
    try {
      const config = loadControllerConfig();
      const apiKey = config.apiKey;

      const sandbox = await Sandbox.connect(sessionId, {
        apiKey,
      });

      return new DirectE2bSession(sandbox);
    } catch (err: any) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `Failed to connect to session ${sessionId} with direct-e2b provider: ${err.message}`,
        500,
        err
      );
    }
  }

  getCapabilities(): CapabilityMatrix {
    return DIRECT_E2B_CAPABILITIES;
  }

  hasCapability(capability: SandboxCapability): boolean {
    return DIRECT_E2B_CAPABILITIES[capability];
  }
}
