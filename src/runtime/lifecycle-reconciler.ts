import { Sandbox } from 'e2b';
import type { ControllerConfig } from '../config.js';
import { logger } from '../shared/logger.js';
import type { E2BWorkerManager } from './e2b-worker-manager.js';
import type { SessionRegistry } from './session-registry.js';

export class LifecycleReconciler {
  private config: ControllerConfig;
  private registry: SessionRegistry;
  private workerManager: E2BWorkerManager;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    config: ControllerConfig,
    registry: SessionRegistry,
    workerManager: E2BWorkerManager
  ) {
    this.config = config;
    this.registry = registry;
    this.workerManager = workerManager;
  }

  public async reconcileNow(): Promise<void> {
    try {
      const activeSessions = await this.registry.getActiveSessions();
      const now = new Date();

      for (const session of activeSessions) {
        const expiresAt = new Date(session.expiresAt);

        // Check if expired based on time
        if (now > expiresAt) {
          logger.info('Session expired based on timeout limit. Marking expired and killing worker.', {
            sessionId: session.sessionId,
          });
          await this.workerManager.destroySession(session.sessionId);
          await this.registry.updateSession(session.sessionId, { state: 'expired' });
          continue;
        }

        // Verify with E2B cloud API if sandbox is still alive
        try {
          const sandbox = await Sandbox.connect(session.e2bSandboxId, {
            apiKey: this.config.apiKey,
          });
          const running = await sandbox.isRunning().catch(() => false);
          if (!running) {
            logger.info('Worker Sandbox is no longer running in E2B. Marking destroyed.', {
              sessionId: session.sessionId,
            });
            await this.registry.updateSession(session.sessionId, { state: 'destroyed' });
          }
        } catch {
          // If connection fails, mark destroyed
          await this.registry.updateSession(session.sessionId, { state: 'destroyed' });
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn('Lifecycle reconciler encountered an error during pass', { error: msg });
    }
  }

  public startPeriodic(intervalMs = 60000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.reconcileNow().catch(() => {});
    }, intervalMs);

    // Unref timer so it does not block process exit during shutdown
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
