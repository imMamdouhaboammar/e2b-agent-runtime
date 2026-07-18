import * as db from './client.js';
import { logger } from '../../shared/logger.js';
import { AppError } from '../../shared/errors.js';

export class QuotaError extends AppError {
  constructor(resource: string, current: number, limit: number) {
    super(
      `Quota limit exceeded for resource "${resource}". Current usage: ${current}, limit: ${limit}.`,
      'QUOTA_EXCEEDED',
      429
    );
  }
}

export class QuotaManager {
  private useDb = false;

  constructor() {
    this.useDb = !!(process.env.DATABASE_URL || process.env.TEST_DB_URL);
  }

  public async checkQuota(
    tokenId: string,
    resource: 'active_workers' | 'active_workspaces' | 'active_tasks',
    limit: number
  ): Promise<void> {
    if (!this.useDb) {
      // In-memory fallback
      return;
    }

    const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;

    let current = 0;
    if (resource === 'active_workers' || resource === 'active_workspaces') {
      const res = await db.query(
        "SELECT COUNT(*)::int as count FROM sessions WHERE state = 'active'",
        [],
        dbUrl
      );
      current = res.rows[0]?.count || 0;
    } else if (resource === 'active_tasks') {
      const res = await db.query(
        `SELECT COUNT(*)::int as count FROM tasks
         WHERE task_state NOT IN ('COMPLETED', 'ABANDONED', 'FAILED', 'DESTROYED')`,
        [],
        dbUrl
      );
      current = res.rows[0]?.count || 0;
    }

    if (current >= limit) {
      logger.warn('quota.rejected', { tokenId, resource, current, limit });
      throw new QuotaError(resource, current, limit);
    }
  }
}

export const quotaManager = new QuotaManager();
