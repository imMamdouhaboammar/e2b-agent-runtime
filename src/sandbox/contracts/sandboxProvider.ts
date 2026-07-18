import type { SandboxSession } from './sandboxSession.js';
import type { SandboxCapability, CapabilityMatrix } from './sandboxCapabilities.js';

export interface ProviderSessionOptions {
  template?: string;
  timeoutMs?: number;
  metadata?: Record<string, string>;
  env?: Record<string, string>;
}

export interface SandboxProvider {
  /**
   * Name of this provider ('direct-e2b' or 'openai-agents-e2b')
   */
  readonly providerName: string;

  /**
   * Creates a new sandbox session
   */
  createSession(options?: ProviderSessionOptions): Promise<SandboxSession>;

  /**
   * Reconnects/resumes an existing session by ID
   */
  connectSession(sessionId: string): Promise<SandboxSession>;

  /**
   * Gets the capability matrix supported by this provider
   */
  getCapabilities(): CapabilityMatrix;

  /**
   * Checks if a capability is supported by this provider
   */
  hasCapability(capability: SandboxCapability): boolean;
}
