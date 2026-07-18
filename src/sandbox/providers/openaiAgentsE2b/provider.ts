import type { SandboxProvider, ProviderSessionOptions } from '../../contracts/sandboxProvider.js';
import type { SandboxSession } from '../../contracts/sandboxSession.js';
import type { SandboxCapability, CapabilityMatrix } from '../../contracts/sandboxCapabilities.js';
import { OPENAI_AGENTS_E2B_CAPABILITIES } from '../../providerCapabilityMatrix.js';
import { OpenAIE2bSession } from './session.js';
import { SandboxError } from '../../contracts/sandboxErrors.js';
import { loadControllerConfig } from '../../../config.js';

export class OpenAIE2bProvider implements SandboxProvider {
  readonly providerName = 'openai-agents-e2b';

  private verifyNodeVersion(): void {
    const versionMatch = process.version.match(/^v(\d+)\./);
    if (!versionMatch) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_VERSION_INCOMPATIBLE',
        `Could not parse Node.js version: ${process.version}`
      );
    }
    const major = Number.parseInt(versionMatch[1], 10);
    if (major < 22) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_VERSION_INCOMPATIBLE',
        `OpenAI Agents SDK provider requires Node.js >=22. Current version is ${process.version}. Please use direct-e2b provider.`
      );
    }
  }

  async createSession(options?: ProviderSessionOptions): Promise<SandboxSession> {
    this.verifyNodeVersion();

    try {
      const config = loadControllerConfig();
      const apiKey = config.apiKey;

      // Dynamic import to prevent Node.js 20 static loading failures
      const { E2BSandboxClient } = await import('@openai/agents-extensions/sandbox/e2b');
      const { Manifest } = await import('@openai/agents/sandbox');

      const client = new E2BSandboxClient({
        apiKey,
        template: options?.template || config.workerTemplate,
        timeoutMs: options?.timeoutMs || config.workerDefaultTimeoutMs,
      });

      const manifest = new Manifest({
        entries: {}, // Empty workspace initialization
      });

      const session = await client.create({
        manifest,
      });

      // Ensure /workspace exists and has write permissions inside the Sandbox
      await session.execCommand({ cmd: 'sudo mkdir -p /workspace && sudo chmod 777 /workspace' });

      return new OpenAIE2bSession(session);
    } catch (err: any) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `Failed to create session with openai-agents-e2b: ${err.message}`,
        500,
        err
      );
    }
  }

  async connectSession(sessionId: string): Promise<SandboxSession> {
    this.verifyNodeVersion();

    try {
      const config = loadControllerConfig();
      const apiKey = config.apiKey;

      const { E2BSandboxClient } = await import('@openai/agents-extensions/sandbox/e2b');

      const client = new E2BSandboxClient({
        apiKey,
      });

      const state = await client.deserializeSessionState({
        sandboxId: sessionId,
        sandboxType: 'e2b',
        environment: {},
        pauseOnExit: false,
      });
      const session = await client.resume(state);

      return new OpenAIE2bSession(session);
    } catch (err: any) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `Failed to connect to session ${sessionId} with openai-agents-e2b: ${err.message}`,
        500,
        err
      );
    }
  }

  getCapabilities(): CapabilityMatrix {
    return OPENAI_AGENTS_E2B_CAPABILITIES;
  }

  hasCapability(capability: SandboxCapability): boolean {
    return OPENAI_AGENTS_E2B_CAPABILITIES[capability];
  }
}
