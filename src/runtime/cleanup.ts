import * as db from '../persistence/postgres/client.js';
import { PostgresLeaseManager } from '../persistence/postgres/leases.js';
import { logger } from '../shared/logger.js';

export class CleanupService {
  private leaseManager: PostgresLeaseManager;
  private intervalId: NodeJS.Timeout | null = null;
  private useDb = false;

  constructor(ownerId: string) {
    this.leaseManager = new PostgresLeaseManager(ownerId);
    this.useDb = !!(process.env.DATABASE_URL || process.env.TEST_DB_URL);
  }

  public start(intervalMs = 3600000) {
    if (!this.useDb) return;
    if (this.intervalId) return;

    this.intervalId = setInterval(async () => {
      try {
        const acquired = await this.leaseManager.acquireLease('data-cleanup-job', 300000);
        if (acquired) {
          await this.runCleanup();
        }
      } catch (err: any) {
        logger.error('cleanup.job.failed', { error: err.message });
      }
    }, intervalMs);

    this.intervalId.unref();
    logger.info('Data retention cleanup service started.');
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Data retention cleanup service stopped.');
    }
  }

  public async runCleanup() {
    logger.info('Running database retention cleanup...');
    const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;

    try {
      // 1. Retention for rate limit events (delete older than 1 day)
      const resRate = await db.query(
        "DELETE FROM rate_limit_events WHERE timestamp < NOW() - INTERVAL '1 day'",
        [],
        dbUrl
      );
      logger.info('cleanup.rate_limit_events.completed', { deletedCount: resRate.rowCount });

      // 2. Retention for audit logs (delete older than 90 days)
      const resAudit = await db.query(
        "DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days'",
        [],
        dbUrl
      );
      logger.info('cleanup.audit_logs.completed', { deletedCount: resAudit.rowCount });

      // 3. Retention for sessions and associated tasks/evidence/checkpoints (delete older than 30 days)
      const resSessions = await db.query(
        "DELETE FROM sessions WHERE created_at < NOW() - INTERVAL '30 days' AND state != 'active'",
        [],
        dbUrl
      );
      logger.info('cleanup.sessions.completed', { deletedCount: resSessions.rowCount });
    } catch (err: any) {
      logger.error('Failed to run data retention cleanup', { error: err.message });
    }
  }
}
