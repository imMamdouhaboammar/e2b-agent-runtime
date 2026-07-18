import * as db from './client.js';

export interface RateLimiter {
  isRateLimited(identifier: string, limit: number, windowMs: number): Promise<boolean>;
}

export class PostgresRateLimiter implements RateLimiter {
  private useDb = false;
  private memoryEvents = new Map<string, number[]>();

  constructor() {
    this.useDb = !!(process.env.DATABASE_URL || process.env.TEST_DB_URL);
  }

  public async isRateLimited(
    identifier: string,
    limit: number,
    windowMs: number
  ): Promise<boolean> {
    if (this.useDb) {
      const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
      const now = new Date();
      const windowStart = new Date(now.getTime() - windowMs);

      // Clean up old events and get count
      await db.query(
        'DELETE FROM rate_limit_events WHERE identifier = $1 AND timestamp < $2',
        [identifier, windowStart],
        dbUrl
      );

      const countRes = await db.query(
        'SELECT COUNT(*)::int as cnt FROM rate_limit_events WHERE identifier = $1',
        [identifier],
        dbUrl
      );

      const count = countRes.rows[0]?.cnt || 0;
      if (count >= limit) {
        return true;
      }

      await db.query(
        'INSERT INTO rate_limit_events (identifier, timestamp) VALUES ($1, NOW())',
        [identifier],
        dbUrl
      );

      return false;
    } else {
      const now = Date.now();
      let events = this.memoryEvents.get(identifier) || [];

      // Filter out old events
      events = events.filter((t) => t > now - windowMs);

      if (events.length >= limit) {
        this.memoryEvents.set(identifier, events);
        return true;
      }

      events.push(now);
      this.memoryEvents.set(identifier, events);
      return false;
    }
  }
}

export const rateLimiter = new PostgresRateLimiter();
