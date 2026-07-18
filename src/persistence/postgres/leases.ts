import { LeaseManager } from '../contracts/lease.js';
import { query } from './client.js';
import { logger } from '../../shared/logger.js';

export class PostgresLeaseManager implements LeaseManager {
  private ownerId: string;

  constructor(ownerId: string) {
    this.ownerId = ownerId;
  }

  public async acquireLease(leaseName: string, ttlMs: number): Promise<boolean> {
    const expiresAt = new Date(Date.now() + ttlMs);
    const now = new Date();

    try {
      // 1. Try to insert a new lease
      await query(
        `INSERT INTO leases (lease_name, owner_id, expires_at, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (lease_name) DO NOTHING`,
        [leaseName, this.ownerId, expiresAt, now]
      );

      // Verify if insertion succeeded by checking if we own it
      if (await this.isLeaseActive(leaseName)) {
        return true;
      }

      // 2. Try to reclaim if expired, or renew if already owned
      const result = await query(
        `UPDATE leases
         SET owner_id = $1, expires_at = $2, created_at = $3
         WHERE lease_name = $4 AND (expires_at < $3 OR owner_id = $1)`,
        [this.ownerId, expiresAt, now, leaseName]
      );

      const acquired = (result.rowCount ?? 0) > 0;
      if (acquired) {
        logger.debug('database.lease.acquired_or_renewed', { leaseName, ownerId: this.ownerId });
      }
      return acquired;
    } catch (err: any) {
      logger.error('database.lease.acquire_failed', { leaseName, error: err.message });
      return false;
    }
  }

  public async releaseLease(leaseName: string): Promise<void> {
    try {
      await query(
        'DELETE FROM leases WHERE lease_name = $1 AND owner_id = $2',
        [leaseName, this.ownerId]
      );
      logger.debug('database.lease.released', { leaseName, ownerId: this.ownerId });
    } catch (err: any) {
      logger.error('database.lease.release_failed', { leaseName, error: err.message });
    }
  }

  public async isLeaseActive(leaseName: string): Promise<boolean> {
    try {
      const res = await query(
        'SELECT owner_id, expires_at FROM leases WHERE lease_name = $1',
        [leaseName]
      );
      if (res.rowCount === 0) return false;
      const row = res.rows[0];
      const now = new Date();
      return row.owner_id === this.ownerId && new Date(row.expires_at) > now;
    } catch {
      return false;
    }
  }
}
