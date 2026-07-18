import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { getDbPool } from '../client.js';
import { logger } from '../../../shared/logger.js';

// Unique lock ID for migration advisory lock
const MIGRATION_LOCK_ID = 1784365276;

export interface MigrationStatus {
  name: string;
  applied: boolean;
  appliedAt?: Date;
}

export async function runMigrations(databaseUrl?: string): Promise<void> {
  const pool = getDbPool(databaseUrl);
  const client = await pool.connect();

  try {
    // Acquire session advisory lock so only one controller runs migrations at a time
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    logger.info('Database migration lock acquired.');

    // 1. Create migration table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_name VARCHAR(256) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Read migration files
    const migrationsDir = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '.'
    );
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    // 3. Get applied migrations
    const { rows } = await client.query<{ migration_name: string }>(
      'SELECT migration_name FROM schema_migrations'
    );
    const applied = new Set(rows.map((r) => r.migration_name));

    for (const file of files) {
      if (applied.has(file)) {
        logger.debug(`Migration ${file} is already applied.`);
        continue;
      }

      logger.info(`Applying migration: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      // Execute migration inside a local transaction
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        logger.info(`Migration ${file} applied successfully.`);
      } catch (err: any) {
        await client.query('ROLLBACK');
        logger.error(`Migration ${file} failed and was rolled back`, { error: err.message });
        throw err;
      }
    }

    logger.info('All database migrations are up to date.');
  } finally {
    // Release the advisory lock
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}

export async function getMigrationStatus(databaseUrl?: string): Promise<MigrationStatus[]> {
  const pool = getDbPool(databaseUrl);
  const client = await pool.connect();

  try {
    // Ensure migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_name VARCHAR(256) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrationsDir = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '.'
    );
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const { rows } = await client.query<{ migration_name: string; applied_at: Date }>(
      'SELECT migration_name, applied_at FROM schema_migrations'
    );
    const appliedMap = new Map(rows.map((r) => [r.migration_name, r.applied_at]));

    return files.map((file) => ({
      name: file,
      applied: appliedMap.has(file),
      appliedAt: appliedMap.get(file),
    }));
  } finally {
    client.release();
  }
}
