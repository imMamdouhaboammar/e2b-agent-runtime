import { Sandbox } from 'e2b';
import type { SessionRegistry } from './session-registry.js';
import { logger } from '../shared/logger.js';
import * as db from '../persistence/postgres/client.js';

export class LifecycleReconcilerService {
  private registry: SessionRegistry;
  private useDb = false;

  constructor(registry: SessionRegistry) {
    this.registry = registry;
    this.useDb = !!(process.env.DATABASE_URL || process.env.TEST_DB_URL);
  }

  public async reconcileActiveSandboxes() {
    logger.info('Starting E2B sandbox lifecycle reconciliation pass...');

    try {
      // 1. Fetch all currently active sandboxes listed on E2B provider
      const apiKeys = process.env.E2B_API_KEY;
      if (!apiKeys || apiKeys === 'mock_api_key') {
        logger.debug('Mock environment: skipping live E2B sandbox listing.');
        return;
      }

      const paginator = await Sandbox.list({ apiKey: apiKeys });
      const activeSandboxes = await paginator.nextItems();
      const liveSandboxIds = new Set(activeSandboxes.map((s) => s.sandboxId));

      // 2. Fetch our registry's active sessions
      const sessions = await this.registry.getActiveSessions();

      for (const session of sessions) {
        if (!liveSandboxIds.has(session.e2bSandboxId)) {
          logger.warn('Reconciler detected orphaned local session without live E2B sandbox', {
            sessionId: session.sessionId,
            sandboxId: session.e2bSandboxId,
          });

          // Mark session as unexpectedly terminated/destroyed
          await this.registry.updateSession(session.sessionId, {
            state: 'destroyed',
            failureReason: 'E2B Sandbox was unexpectedly killed or terminated.',
          });

          // Write audit log
          if (this.useDb) {
            const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
            await db.query(
              `INSERT INTO audit_logs (event, actor_id, metadata, created_at)
               VALUES ('worker_unexpected_death', $1, $2, NOW())`,
              [session.sessionId, JSON.stringify({ sandboxId: session.e2bSandboxId })],
              dbUrl
            );
          }
        }
      }

      logger.info('E2B lifecycle reconciliation pass completed.');
    } catch (err: any) {
      logger.error('Failed to run lifecycle reconciliation', { error: err.message });
    }
  }
}
