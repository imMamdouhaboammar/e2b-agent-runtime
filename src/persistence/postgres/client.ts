import pg from 'pg';
import { logger } from '../../shared/logger.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getDbPool(databaseUrl?: string): pg.Pool {
  if (pool) return pool;

  const url = databaseUrl || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Database operations cannot proceed.');
  }

  pool = new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    logger.error('Unexpected error on idle database client', { error: err.message });
  });

  return pool;
}

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[],
  databaseUrl?: string
): Promise<pg.QueryResult<T>> {
  const p = getDbPool(databaseUrl);
  const start = Date.now();
  try {
    const res = await p.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('database.query.executed', { text, durationMs: duration, rows: res.rowCount });
    return res;
  } catch (err: any) {
    logger.error('database.query.failed', { text, error: err.message });
    throw err;
  }
}

export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>,
  databaseUrl?: string
): Promise<T> {
  const p = getDbPool(databaseUrl);
  const client = await p.connect();
  const start = Date.now();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('database.transaction.failed', { error: err.message, durationMs: Date.now() - start });
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDbConnection(databaseUrl?: string): Promise<boolean> {
  try {
    await query('SELECT 1', [], databaseUrl);
    return true;
  } catch {
    return false;
  }
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed.');
  }
}
